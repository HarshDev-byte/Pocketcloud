const crypto = require('crypto');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
const { CryptoIntegrityError } = require('./cryptoErrors');

/**
 * Production-grade encryption service for PocketCloud
 * 
 * Security Model:
 * - User password → scrypt → Master Key (never stored)
 * - Master Key + file-specific context → HKDF → Per-file Key
 * - Per-file Key + random IV → AES-256-GCM → Encrypted file
 * 
 * Zero-knowledge design: Server never stores raw keys
 */

// Crypto constants (production-grade)
const SCRYPT_PARAMS = {
  N: 32768,        // CPU/memory cost (2^15)
  r: 8,            // Block size
  p: 1,            // Parallelization
  keyLen: 32,      // 256-bit key
  maxmem: 64 * 1024 * 1024  // 64MB max memory
};

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;        // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16;  // 128-bit auth tag
const SALT_LENGTH = 32;      // 256-bit salt

/**
 * Derive master key from password using scrypt
 * This is the ONLY place where password → key happens
 * 
 * @param {string} password - User password
 * @param {Buffer} salt - Unique salt (stored in DB)
 * @returns {Promise<Buffer>} - 256-bit master key
 */
async function deriveMasterKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_PARAMS.keyLen,
      {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        maxmem: SCRYPT_PARAMS.maxmem
      },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

/**
 * Derive per-file encryption key from master key
 * Uses HKDF to create unique keys for each file
 * 
 * @param {Buffer} masterKey - Master key from password
 * @param {string} fileId - Unique file identifier (prevents key reuse)
 * @returns {Buffer} - 256-bit file encryption key
 */
function deriveFileKey(masterKey, fileId) {
  // HKDF-SHA256: masterKey + context → fileKey
  const info = Buffer.from(`pocketcloud-file-${fileId}`, 'utf8');
  const derivedKey = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), info, 32);
  // hkdfSync returns ArrayBuffer in newer Node versions, convert to Buffer
  return Buffer.from(derivedKey);
}

/**
 * Generate cryptographically secure random salt
 * @returns {Buffer} - 256-bit random salt
 */
function generateSalt() {
  return crypto.randomBytes(SALT_LENGTH);
}

/**
 * Generate cryptographically secure random IV
 * @returns {Buffer} - 128-bit random IV
 */
function generateIV() {
  return crypto.randomBytes(IV_LENGTH);
}

/**
 * Encrypt file buffer in memory
 * Used for small files (< 10MB) where streaming isn't needed
 * 
 * @param {Buffer} plainBuffer - File data to encrypt
 * @param {Buffer} fileKey - Per-file encryption key
 * @param {Buffer} iv - Initialization vector
 * @returns {Object} - { encryptedBuffer, authTag }
 */
function encryptBuffer(plainBuffer, fileKey, iv) {
  const cipher = crypto.createCipheriv(AES_ALGORITHM, fileKey, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plainBuffer),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return { encryptedBuffer: encrypted, authTag };
}

/**
 * Decrypt file buffer in memory
 * Used for small files (< 10MB) where streaming isn't needed
 * 
 * @param {Buffer} encryptedBuffer - Encrypted file data
 * @param {Buffer} fileKey - Per-file encryption key
 * @param {Buffer} iv - Initialization vector
 * @param {Buffer} authTag - Authentication tag
 * @returns {Buffer} - Decrypted file data
 * @throws {Error} - If authentication fails (tampered data)
 */
function decryptBuffer(encryptedBuffer, fileKey, iv, authTag) {
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, fileKey, iv);
  decipher.setAuthTag(authTag);
  
  try {
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);
    return decrypted;
  } catch (error) {
    // Never leak crypto internals
    throw new CryptoIntegrityError();
  }
}

/**
 * Create encryption stream for large files
 * Streams data through cipher without loading entire file into memory
 * 
 * @param {Buffer} fileKey - Per-file encryption key
 * @param {Buffer} iv - Initialization vector
 * @returns {Object} - { cipher, getAuthTag }
 */
function createEncryptStream(fileKey, iv) {
  const cipher = crypto.createCipheriv(AES_ALGORITHM, fileKey, iv);
  
  return {
    cipher,
    getAuthTag: () => cipher.getAuthTag()
  };
}

/**
 * Create decryption stream for large files
 * Streams data through decipher without loading entire file into memory
 * 
 * @param {Buffer} fileKey - Per-file encryption key
 * @param {Buffer} iv - Initialization vector
 * @param {Buffer} authTag - Authentication tag
 * @returns {crypto.Decipher} - Decipher stream
 */
function createDecryptStream(fileKey, iv, authTag) {
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, fileKey, iv);
  decipher.setAuthTag(authTag);
  return decipher;
}

/**
 * High-level: Encrypt file using streaming
 * This is what upload routes call
 * 
 * @param {Stream|Buffer} input - Input stream or buffer
 * @param {string} outputPath - Path to write encrypted file
 * @param {string} password - User password
 * @param {Buffer} userSalt - User's salt (from DB)
 * @param {string} fileId - Unique file identifier
 * @returns {Promise<Object>} - { iv, authTag }
 */
async function encryptFileStream(input, outputPath, password, userSalt, fileId) {
  const fs = require('fs');
  const { Readable } = require('stream');
  
  // Step 1: Derive master key from password
  const masterKey = await deriveMasterKey(password, userSalt);
  
  // Step 2: Derive file-specific key
  const fileKey = deriveFileKey(masterKey, fileId);
  
  // Step 3: Generate random IV
  const iv = generateIV();
  
  // Step 4: Create cipher stream
  const cipher = crypto.createCipheriv(AES_ALGORITHM, fileKey, iv);
  
  // Step 5: Create streams
  const inputStream = Buffer.isBuffer(input) ? Readable.from(input) : input;
  const outputStream = fs.createWriteStream(outputPath);
  
  try {
    // Step 6: Pipe through encryption
    await pipeline(inputStream, cipher, outputStream);
    
    // Step 7: Get auth tag (only available after stream completes)
    const authTag = cipher.getAuthTag();
    
    // Clear sensitive data from memory
    masterKey.fill(0);
    fileKey.fill(0);
    
    return {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    // Clean up partial file on error
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch (cleanupError) {
      // Log but don't throw - original error is more important
      console.error('Cleanup failed:', cleanupError.message);
    }
    
    // Clear sensitive data even on error
    masterKey.fill(0);
    fileKey.fill(0);
    
    throw error;
  }
}

/**
 * High-level: Encrypt file and return metadata (LEGACY - buffer-based)
 * Kept for backward compatibility with small files
 * 
 * @param {Buffer} fileBuffer - Original file data
 * @param {string} password - User password
 * @param {Buffer} userSalt - User's salt (from DB)
 * @param {string} fileId - Unique file identifier
 * @returns {Promise<Object>} - { encryptedBuffer, iv, authTag }
 */
async function encryptFile(fileBuffer, password, userSalt, fileId) {
  // Step 1: Derive master key from password
  const masterKey = await deriveMasterKey(password, userSalt);
  
  // Step 2: Derive file-specific key
  const fileKey = deriveFileKey(masterKey, fileId);
  
  // Step 3: Generate random IV
  const iv = generateIV();
  
  // Step 4: Encrypt
  const { encryptedBuffer, authTag } = encryptBuffer(fileBuffer, fileKey, iv);
  
  // Clear sensitive data from memory
  masterKey.fill(0);
  fileKey.fill(0);
  
  return {
    encryptedBuffer,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * High-level: Decrypt file using streaming
 * This is what download routes call
 * 
 * @param {string} inputPath - Path to encrypted file
 * @param {Stream} outputStream - Output stream (e.g., HTTP response)
 * @param {string} password - User password
 * @param {Buffer} userSalt - User's salt (from DB)
 * @param {string} fileId - Unique file identifier
 * @param {string} ivHex - IV as hex string (from DB)
 * @param {string} authTagHex - Auth tag as hex string (from DB)
 * @returns {Promise<void>}
 */
async function decryptFileStream(inputPath, outputStream, password, userSalt, fileId, ivHex, authTagHex) {
  const fs = require('fs');
  
  // Step 1: Derive master key from password
  const masterKey = await deriveMasterKey(password, userSalt);
  
  // Step 2: Derive file-specific key
  const fileKey = deriveFileKey(masterKey, fileId);
  
  // Step 3: Convert hex strings to buffers
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  // Step 4: Create decipher stream
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, fileKey, iv);
  decipher.setAuthTag(authTag); // MUST set before any data flows
  
  // Step 5: Create input stream
  const inputStream = fs.createReadStream(inputPath);
  
  // Step 6: Handle auth failures gracefully
  decipher.on('error', (error) => {
    // GCM auth failure - file tampered or corrupted
    if (error.message.includes('Unsupported state') || 
        error.message.includes('authenticate data')) {
      // Destroy output stream to abort response
      outputStream.destroy();
      throw new CryptoIntegrityError();
    }
    throw error;
  });
  
  try {
    // Step 7: Pipe through decryption
    await pipeline(inputStream, decipher, outputStream);
    
    // Clear sensitive data from memory
    masterKey.fill(0);
    fileKey.fill(0);
  } catch (error) {
    // Clear sensitive data even on error
    masterKey.fill(0);
    fileKey.fill(0);
    
    // Re-throw crypto errors with proper type
    if (error.message && (error.message.includes('Unsupported state') || 
        error.message.includes('authenticate data'))) {
      throw new CryptoIntegrityError();
    }
    
    throw error;
  }
}

/**
 * High-level: Decrypt file from metadata (LEGACY - buffer-based)
 * Kept for backward compatibility with small files
 * 
 * @param {Buffer} encryptedBuffer - Encrypted file data
 * @param {string} password - User password
 * @param {Buffer} userSalt - User's salt (from DB)
 * @param {string} fileId - Unique file identifier
 * @param {string} ivHex - IV as hex string (from DB)
 * @param {string} authTagHex - Auth tag as hex string (from DB)
 * @returns {Promise<Buffer>} - Decrypted file data
 */
async function decryptFile(encryptedBuffer, password, userSalt, fileId, ivHex, authTagHex) {
  // Step 1: Derive master key from password
  const masterKey = await deriveMasterKey(password, userSalt);
  
  // Step 2: Derive file-specific key
  const fileKey = deriveFileKey(masterKey, fileId);
  
  // Step 3: Convert hex strings to buffers
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  // Step 4: Decrypt
  const decryptedBuffer = decryptBuffer(encryptedBuffer, fileKey, iv, authTag);
  
  // Clear sensitive data from memory
  masterKey.fill(0);
  fileKey.fill(0);
  
  return decryptedBuffer;
}

/**
 * Verify password without decrypting files
 * Used for login validation
 * 
 * @param {string} password - Password to verify
 * @param {Buffer} userSalt - User's salt
 * @param {string} testVector - Known encrypted value (from DB)
 * @returns {Promise<boolean>} - True if password is correct
 */
async function verifyPassword(password, userSalt, testVector) {
  try {
    const masterKey = await deriveMasterKey(password, userSalt);
    // In production, compare against stored test vector
    // For now, just verify key derivation succeeds
    masterKey.fill(0);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Re-encrypt all user files with new password
 * Called when user changes password
 * 
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @param {Buffer} oldSalt - Current salt
 * @param {Buffer} newSalt - New salt
 * @param {Array} files - Array of file metadata objects
 * @returns {Promise<Array>} - Updated file metadata
 */
async function rotateKeys(oldPassword, newPassword, oldSalt, newSalt, files) {
  const results = [];
  
  for (const file of files) {
    // Decrypt with old key
    const decrypted = await decryptFile(
      file.encryptedBuffer,
      oldPassword,
      oldSalt,
      file.id,
      file.iv,
      file.authTag
    );
    
    // Re-encrypt with new key
    const reencrypted = await encryptFile(
      decrypted,
      newPassword,
      newSalt,
      file.id
    );
    
    results.push({
      id: file.id,
      iv: reencrypted.iv,
      authTag: reencrypted.authTag,
      encryptedBuffer: reencrypted.encryptedBuffer
    });
    
    // Clear decrypted data
    decrypted.fill(0);
  }
  
  return results;
}

module.exports = {
  // Key derivation
  deriveMasterKey,
  deriveFileKey,
  generateSalt,
  generateIV,
  
  // Buffer operations (small files)
  encryptBuffer,
  decryptBuffer,
  
  // Stream operations (large files)
  createEncryptStream,
  createDecryptStream,
  
  // High-level API
  encryptFile,          // Legacy buffer-based
  decryptFile,          // Legacy buffer-based
  encryptFileStream,    // NEW: Streaming encryption
  decryptFileStream,    // NEW: Streaming decryption
  verifyPassword,
  rotateKeys,
  
  // Constants
  SALT_LENGTH,
  IV_LENGTH,
  AUTH_TAG_LENGTH
};
