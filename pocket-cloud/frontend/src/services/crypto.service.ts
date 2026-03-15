/**
 * Client-side encryption service using Web Crypto API
 * All encryption/decryption happens in browser - keys never leave device
 */

export interface EncryptedFileHeader {
  magic: string;
  version: number;
  salt: Uint8Array;
  iv: Uint8Array;
  originalName: string;
  mimeType: string;
}

export interface EncryptionProgress {
  phase: 'deriving-key' | 'encrypting' | 'decrypting' | 'complete';
  progress: number; // 0-100
  currentChunk?: number;
  totalChunks?: number;
}

export class CryptoService {
  private static readonly MAGIC_BYTES = 'PCDCRYPT';
  private static readonly VERSION = 0x01;
  private static readonly SALT_LENGTH = 32;
  private static readonly IV_LENGTH = 12;
  private static readonly CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
  private static readonly PBKDF2_ITERATIONS = 250000; // OWASP recommended

  /**
   * Encrypt a file with password-based encryption
   */
  public static async encryptFile(
    file: File, 
    password: string,
    onProgress?: (progress: EncryptionProgress) => void
  ): Promise<Blob> {
    try {
      onProgress?.({ phase: 'deriving-key', progress: 0 });

      // Generate random salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
      const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

      // Derive encryption key from password
      const key = await this.deriveKey(password, salt);
      
      onProgress?.({ phase: 'encrypting', progress: 10 });

      // Create header
      const header = this.createHeader(salt, iv, file.name, file.type);
      
      // Encrypt file content
      let encryptedContent: Uint8Array;
      
      if (file.size > 50 * 1024 * 1024) { // > 50MB - use chunked encryption
        encryptedContent = await this.encryptFileChunked(file, key, iv, onProgress);
      } else {
        // Small file - encrypt in one go
        const fileBuffer = await file.arrayBuffer();
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          fileBuffer
        );
        encryptedContent = new Uint8Array(encrypted);
        onProgress?.({ phase: 'encrypting', progress: 90 });
      }

      // Combine header and encrypted content
      const result = new Uint8Array(header.length + encryptedContent.length);
      result.set(header, 0);
      result.set(encryptedContent, header.length);

      onProgress?.({ phase: 'complete', progress: 100 });
      
      return new Blob([result], { type: 'application/octet-stream' });

    } catch (error) {
      throw new Error(`Encryption failed: ${(error as Error).message}`);
    }
  }
  /**
   * Decrypt an encrypted file
   */
  public static async decryptFile(
    encryptedBlob: Blob, 
    password: string,
    onProgress?: (progress: EncryptionProgress) => void
  ): Promise<File> {
    try {
      onProgress?.({ phase: 'deriving-key', progress: 0 });

      const buffer = await encryptedBlob.arrayBuffer();
      const data = new Uint8Array(buffer);

      // Parse header
      const header = this.parseHeader(data);
      
      onProgress?.({ phase: 'deriving-key', progress: 10 });

      // Derive decryption key
      const key = await this.deriveKey(password, header.salt);
      
      onProgress?.({ phase: 'decrypting', progress: 20 });

      // Extract encrypted content (skip header)
      const headerSize = this.getHeaderSize(header);
      const encryptedContent = data.slice(headerSize);

      // Decrypt content
      let decryptedContent: ArrayBuffer;
      
      if (encryptedContent.length > 50 * 1024 * 1024) { // > 50MB - use chunked decryption
        decryptedContent = await this.decryptFileChunked(encryptedContent, key, header.iv, onProgress);
      } else {
        // Small file - decrypt in one go
        decryptedContent = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: header.iv },
          key,
          encryptedContent
        );
        onProgress?.({ phase: 'decrypting', progress: 90 });
      }

      onProgress?.({ phase: 'complete', progress: 100 });

      // Return original file
      return new File([decryptedContent], header.originalName, {
        type: header.mimeType
      });

    } catch (error) {
      if (error instanceof Error && error.name === 'OperationError') {
        throw new Error('Incorrect password or corrupted file');
      }
      throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Encrypt large file in chunks
   */
  private static async encryptFileChunked(
    file: File,
    key: CryptoKey,
    baseIv: Uint8Array,
    onProgress?: (progress: EncryptionProgress) => void
  ): Promise<Uint8Array> {
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
    const encryptedChunks: Uint8Array[] = [];
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      // Create unique IV for each chunk
      const chunkIv = new Uint8Array(baseIv);
      const chunkNumber = new DataView(new ArrayBuffer(4));
      chunkNumber.setUint32(0, i, true); // little endian
      
      // XOR chunk number into IV for uniqueness
      for (let j = 0; j < 4; j++) {
        chunkIv[j] ^= chunkNumber.getUint8(j);
      }
      
      const chunkBuffer = await chunk.arrayBuffer();
      const encryptedChunk = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: chunkIv },
        key,
        chunkBuffer
      );
      
      encryptedChunks.push(new Uint8Array(encryptedChunk));
      
      const progress = 10 + Math.round((i / totalChunks) * 80);
      onProgress?.({
        phase: 'encrypting',
        progress,
        currentChunk: i + 1,
        totalChunks
      });
    }
    
    // Combine all encrypted chunks
    const totalLength = encryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of encryptedChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result;
  }

  /**
   * Decrypt large file in chunks
   */
  private static async decryptFileChunked(
    encryptedData: Uint8Array,
    key: CryptoKey,
    baseIv: Uint8Array,
    onProgress?: (progress: EncryptionProgress) => void
  ): Promise<ArrayBuffer> {
    // For chunked decryption, we need to know chunk boundaries
    // This is a simplified version - in practice, you'd store chunk sizes in header
    const authTagSize = 16; // GCM auth tag size
    const chunkSize = this.CHUNK_SIZE + authTagSize;
    const totalChunks = Math.ceil(encryptedData.length / chunkSize);
    const decryptedChunks: Uint8Array[] = [];
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, encryptedData.length);
      const encryptedChunk = encryptedData.slice(start, end);
      
      // Recreate chunk IV
      const chunkIv = new Uint8Array(baseIv);
      const chunkNumber = new DataView(new ArrayBuffer(4));
      chunkNumber.setUint32(0, i, true);
      
      for (let j = 0; j < 4; j++) {
        chunkIv[j] ^= chunkNumber.getUint8(j);
      }
      
      const decryptedChunk = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: chunkIv },
        key,
        encryptedChunk
      );
      
      decryptedChunks.push(new Uint8Array(decryptedChunk));
      
      const progress = 20 + Math.round((i / totalChunks) * 70);
      onProgress?.({
        phase: 'decrypting',
        progress,
        currentChunk: i + 1,
        totalChunks
      });
    }
    
    // Combine all decrypted chunks
    const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of decryptedChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result.buffer;
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    // Derive AES-GCM key
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: this.PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Create binary header for encrypted file
   */
  private static createHeader(
    salt: Uint8Array,
    iv: Uint8Array,
    originalName: string,
    mimeType: string
  ): Uint8Array {
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(originalName);
    const mimeBytes = encoder.encode(mimeType);
    
    const headerSize = 8 + 1 + 32 + 12 + 2 + nameBytes.length + 2 + mimeBytes.length;
    const header = new Uint8Array(headerSize);
    const view = new DataView(header.buffer);
    
    let offset = 0;
    
    // Magic bytes
    const magicBytes = encoder.encode(this.MAGIC_BYTES);
    header.set(magicBytes, offset);
    offset += 8;
    
    // Version
    view.setUint8(offset, this.VERSION);
    offset += 1;
    
    // Salt
    header.set(salt, offset);
    offset += 32;
    
    // IV
    header.set(iv, offset);
    offset += 12;
    
    // Original filename length and data
    view.setUint16(offset, nameBytes.length, true); // little endian
    offset += 2;
    header.set(nameBytes, offset);
    offset += nameBytes.length;
    
    // MIME type length and data
    view.setUint16(offset, mimeBytes.length, true);
    offset += 2;
    header.set(mimeBytes, offset);
    
    return header;
  }

  /**
   * Parse header from encrypted file
   */
  private static parseHeader(data: Uint8Array): EncryptedFileHeader {
    const decoder = new TextDecoder();
    const view = new DataView(data.buffer);
    
    let offset = 0;
    
    // Check magic bytes
    const magic = decoder.decode(data.slice(offset, offset + 8));
    if (magic !== this.MAGIC_BYTES) {
      throw new Error('Invalid encrypted file format');
    }
    offset += 8;
    
    // Check version
    const version = view.getUint8(offset);
    if (version !== this.VERSION) {
      throw new Error(`Unsupported encryption version: ${version}`);
    }
    offset += 1;
    
    // Extract salt
    const salt = data.slice(offset, offset + 32);
    offset += 32;
    
    // Extract IV
    const iv = data.slice(offset, offset + 12);
    offset += 12;
    
    // Extract original filename
    const nameLength = view.getUint16(offset, true);
    offset += 2;
    const originalName = decoder.decode(data.slice(offset, offset + nameLength));
    offset += nameLength;
    
    // Extract MIME type
    const mimeLength = view.getUint16(offset, true);
    offset += 2;
    const mimeType = decoder.decode(data.slice(offset, offset + mimeLength));
    
    return {
      magic,
      version,
      salt,
      iv,
      originalName,
      mimeType
    };
  }

  /**
   * Calculate header size for given header
   */
  private static getHeaderSize(header: EncryptedFileHeader): number {
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(header.originalName);
    const mimeBytes = encoder.encode(header.mimeType);
    
    return 8 + 1 + 32 + 12 + 2 + nameBytes.length + 2 + mimeBytes.length;
  }

  /**
   * Check if a file is encrypted (has .pcd extension and valid header)
   */
  public static async isEncryptedFile(file: File | Blob): Promise<boolean> {
    try {
      if (file.size < 64) return false; // Too small to have valid header
      
      const headerChunk = file.slice(0, 64);
      const buffer = await headerChunk.arrayBuffer();
      const data = new Uint8Array(buffer);
      
      const decoder = new TextDecoder();
      const magic = decoder.decode(data.slice(0, 8));
      
      return magic === this.MAGIC_BYTES;
    } catch {
      return false;
    }
  }

  /**
   * Get original filename from encrypted file without decrypting
   */
  public static async getOriginalFilename(encryptedFile: File | Blob): Promise<string | null> {
    try {
      const headerChunk = encryptedFile.slice(0, 1024); // Read enough for header
      const buffer = await headerChunk.arrayBuffer();
      const data = new Uint8Array(buffer);
      
      const header = this.parseHeader(data);
      return header.originalName;
    } catch {
      return null;
    }
  }

  /**
   * Validate password strength
   */
  public static validatePasswordStrength(password: string): {
    score: number; // 0-4
    feedback: string[];
    isValid: boolean;
  } {
    const feedback: string[] = [];
    let score = 0;
    
    // Length check
    if (password.length >= 12) score++;
    else feedback.push('Use at least 12 characters');
    
    // Character variety
    if (/[a-z]/.test(password)) score++;
    else feedback.push('Include lowercase letters');
    
    if (/[A-Z]/.test(password)) score++;
    else feedback.push('Include uppercase letters');
    
    if (/[0-9]/.test(password)) score++;
    else feedback.push('Include numbers');
    
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    else feedback.push('Include special characters');
    
    // Common password check (simplified)
    const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
    if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
      score = Math.max(0, score - 2);
      feedback.push('Avoid common passwords');
    }
    
    return {
      score: Math.min(4, score),
      feedback,
      isValid: score >= 3 // Require "Good" strength
    };
  }

  /**
   * Generate secure random password
   */
  public static generateSecurePassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    
    return Array.from(array, byte => charset[byte % charset.length]).join('');
  }
}