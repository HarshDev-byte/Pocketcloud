import { Command } from 'commander';
import { createReadStream, createWriteStream, statSync, existsSync } from 'fs';
import { createDecipheriv, pbkdf2Sync } from 'crypto';
import { basename } from 'path';
import { createInterface } from 'readline';
import { pipeline } from 'stream/promises';

interface DecryptOptions {
  output?: string;
  password?: string;
}

interface EncryptedFileHeader {
  magic: string;
  version: number;
  salt: Buffer;
  iv: Buffer;
  originalName: string;
  mimeType: string;
}

export const decryptCommand = new Command('decrypt')
  .description('Decrypt an encrypted .pcd file')
  .argument('<file>', 'Encrypted file to decrypt (.pcd)')
  .option('-o, --output <path>', 'Output path for decrypted file')
  .option('-p, --password <password>', 'Decryption password (not recommended for security)')
  .action(async (filePath: string, options: DecryptOptions) => {
    try {
      if (!existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      const stats = statSync(filePath);
      if (!stats.isFile()) {
        console.error(`Error: Not a file: ${filePath}`);
        process.exit(1);
      }

      // Check if file is encrypted
      if (!filePath.endsWith('.pcd')) {
        console.warn('Warning: File does not have .pcd extension');
      }

      // Parse header to get original filename
      const header = await parseHeader(filePath);
      console.log(`Original file: ${header.originalName}`);
      console.log(`File type: ${header.mimeType}`);

      // Get password
      let password = options.password;
      if (!password) {
        password = await promptPassword('Decryption password: ');
      }

      // Determine output path
      const outputPath = options.output || header.originalName;
      
      console.log(`Decrypting ${basename(filePath)}...`);
      
      // Decrypt file
      await decryptFile(filePath, outputPath, password, header);
      
      const decryptedStats = statSync(outputPath);
      console.log(`✓ Decrypted: ${basename(outputPath)} (${formatFileSize(decryptedStats.size)})`);

    } catch (error) {
      if (error instanceof Error && error.message.includes('bad decrypt')) {
        console.error('Error: Incorrect password or corrupted file');
      } else {
        console.error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      process.exit(1);
    }
  });

/**
 * Parse header from encrypted file
 */
async function parseHeader(filePath: string): Promise<EncryptedFileHeader> {
  const MAGIC_BYTES = 'PCDCRYPT';
  
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { start: 0, end: 1023 }); // Read first 1KB
    const chunks: Buffer[] = [];
    
    stream.on('data', (chunk: string | Buffer) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
    });
    
    stream.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        let offset = 0;
        
        // Check magic bytes
        const magic = buffer.toString('ascii', offset, offset + 8);
        if (magic !== MAGIC_BYTES) {
          throw new Error('Invalid encrypted file format');
        }
        offset += 8;
        
        // Check version
        const version = buffer.readUInt8(offset);
        if (version !== 0x01) {
          throw new Error(`Unsupported encryption version: ${version}`);
        }
        offset += 1;
        
        // Extract salt
        const salt = buffer.subarray(offset, offset + 32);
        offset += 32;
        
        // Extract IV
        const iv = buffer.subarray(offset, offset + 12);
        offset += 12;
        
        // Extract original filename
        const nameLength = buffer.readUInt16LE(offset);
        offset += 2;
        const originalName = buffer.toString('utf8', offset, offset + nameLength);
        offset += nameLength;
        
        // Extract MIME type
        const mimeLength = buffer.readUInt16LE(offset);
        offset += 2;
        const mimeType = buffer.toString('utf8', offset, offset + mimeLength);
        
        resolve({
          magic,
          version,
          salt,
          iv,
          originalName,
          mimeType
        });
      } catch (error) {
        reject(error);
      }
    });
    
    stream.on('error', reject);
  });
}

/**
 * Decrypt a file using AES-256-GCM
 */
async function decryptFile(
  inputPath: string, 
  outputPath: string, 
  password: string, 
  header: EncryptedFileHeader
): Promise<void> {
  const PBKDF2_ITERATIONS = 250000;

  // Derive decryption key
  const key = pbkdf2Sync(password, header.salt, PBKDF2_ITERATIONS, 32, 'sha256');

  // Calculate header size
  const headerSize = getHeaderSize(header);
  
  // Get file size to calculate ciphertext size
  const stats = statSync(inputPath);
  const authTagSize = 16; // GCM auth tag size
  const ciphertextSize = stats.size - headerSize - authTagSize;

  // Create decipher
  const decipher = createDecipheriv('aes-256-gcm', key, header.iv);

  // Create streams
  const inputStream = createReadStream(inputPath, { 
    start: headerSize, 
    end: headerSize + ciphertextSize - 1 
  });
  const outputStream = createWriteStream(outputPath);

  try {
    // Read auth tag
    const authTagStream = createReadStream(inputPath, { 
      start: headerSize + ciphertextSize,
      end: headerSize + ciphertextSize + authTagSize - 1
    });
    
    const authTagChunks: Buffer[] = [];
    for await (const chunk of authTagStream) {
      authTagChunks.push(chunk);
    }
    const authTag = Buffer.concat(authTagChunks);
    
    // Set auth tag
    decipher.setAuthTag(authTag);

    // Decrypt and write file content
    await pipeline(inputStream, decipher, outputStream);

  } catch (error) {
    // Clean up on error
    try {
      outputStream.destroy();
      if (existsSync(outputPath)) {
        const { unlinkSync } = await import('fs');
        unlinkSync(outputPath);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Calculate header size
 */
function getHeaderSize(header: EncryptedFileHeader): number {
  const nameBuffer = Buffer.from(header.originalName, 'utf8');
  const mimeBuffer = Buffer.from(header.mimeType, 'utf8');
  
  return 8 + 1 + 32 + 12 + 2 + nameBuffer.length + 2 + mimeBuffer.length;
}

/**
 * Prompt for password input (hidden)
 */
function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Hide input
    const stdin = process.stdin;
    stdin.setRawMode(true);
    
    let password = '';
    
    process.stdout.write(prompt);
    
    stdin.on('data', (char) => {
      const c = char.toString();
      
      if (c === '\r' || c === '\n') {
        // Enter pressed
        stdin.setRawMode(false);
        rl.close();
        process.stdout.write('\n');
        resolve(password);
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit(0);
      } else if (c === '\u007f' || c === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (c >= ' ' && c <= '~') {
        // Printable character
        password += c;
        process.stdout.write('•');
      }
    });
  });
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}