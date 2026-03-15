import { Command } from 'commander';
import { createReadStream, createWriteStream, statSync, existsSync } from 'fs';
import { createCipheriv, randomBytes, pbkdf2Sync } from 'crypto';
import { basename, extname, dirname } from 'path';
import { createInterface } from 'readline';
import { pipeline } from 'stream/promises';

interface EncryptOptions {
  output?: string;
  password?: string;
  upload?: boolean;
}

export const encryptCommand = new Command('encrypt')
  .description('Encrypt a file with password-based encryption')
  .argument('<file>', 'File to encrypt')
  .option('-o, --output <path>', 'Output path for encrypted file')
  .option('-p, --password <password>', 'Encryption password (not recommended for security)')
  .option('-u, --upload', 'Upload encrypted file after encryption')
  .action(async (filePath: string, options: EncryptOptions) => {
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

      // Get password
      let password = options.password;
      if (!password) {
        password = await promptPassword('Encryption password: ');
        const confirmPassword = await promptPassword('Confirm password: ');
        
        if (password !== confirmPassword) {
          console.error('Error: Passwords do not match');
          process.exit(1);
        }
      }

      // Validate password strength
      const strength = validatePasswordStrength(password);
      if (strength.score < 3) {
        console.warn('Warning: Weak password detected');
        console.warn('Recommendations:');
        strength.feedback.forEach(feedback => console.warn(`  • ${feedback}`));
        
        const proceed = await promptConfirm('Continue with weak password? (not recommended) [y/N]: ');
        if (!proceed) {
          console.log('Encryption cancelled');
          process.exit(0);
        }
      }

      // Determine output path
      const outputPath = options.output || `${filePath}.pcd`;
      
      console.log(`Encrypting ${basename(filePath)}...`);
      
      // Encrypt file
      await encryptFile(filePath, outputPath, password);
      
      const encryptedStats = statSync(outputPath);
      console.log(`✓ Encrypted: ${basename(outputPath)} (${formatFileSize(encryptedStats.size)})`);
      
      // Upload if requested
      if (options.upload) {
        const shouldUpload = await promptConfirm('Upload encrypted file? [Y/n]: ', true);
        if (shouldUpload) {
          console.log('Uploading encrypted file...');
          // Import upload functionality
          const { uploader } = await import('../lib/upload');
          await uploader.uploadFile(outputPath, dirname(outputPath));
          console.log('✓ Upload complete');
        }
      }

    } catch (error) {
      console.error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

/**
 * Encrypt a file using AES-256-GCM with PBKDF2 key derivation
 */
async function encryptFile(inputPath: string, outputPath: string, password: string): Promise<void> {
  const MAGIC_BYTES = 'PCDCRYPT';
  const VERSION = 0x01;
  const SALT_LENGTH = 32;
  const IV_LENGTH = 12;
  const PBKDF2_ITERATIONS = 250000;

  // Generate random salt and IV
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  // Derive encryption key
  const key = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');

  // Get original file info
  const originalName = basename(inputPath);
  const mimeType = getMimeType(inputPath);

  // Create header
  const header = createHeader(MAGIC_BYTES, VERSION, salt, iv, originalName, mimeType);

  // Create cipher
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  // Create streams
  const inputStream = createReadStream(inputPath);
  const outputStream = createWriteStream(outputPath);

  try {
    // Write header
    outputStream.write(header);

    // Encrypt and write file content
    await pipeline(inputStream, cipher, outputStream, { end: false });

    // Write authentication tag
    const authTag = cipher.getAuthTag();
    outputStream.write(authTag);
    
    outputStream.end();

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
 * Create binary header for encrypted file
 */
function createHeader(
  magic: string,
  version: number,
  salt: Buffer,
  iv: Buffer,
  originalName: string,
  mimeType: string
): Buffer {
  const nameBuffer = Buffer.from(originalName, 'utf8');
  const mimeBuffer = Buffer.from(mimeType, 'utf8');
  
  const headerSize = 8 + 1 + 32 + 12 + 2 + nameBuffer.length + 2 + mimeBuffer.length;
  const header = Buffer.alloc(headerSize);
  
  let offset = 0;
  
  // Magic bytes
  header.write(magic, offset, 8, 'ascii');
  offset += 8;
  
  // Version
  header.writeUInt8(version, offset);
  offset += 1;
  
  // Salt
  salt.copy(header, offset);
  offset += 32;
  
  // IV
  iv.copy(header, offset);
  offset += 12;
  
  // Original filename length and data
  header.writeUInt16LE(nameBuffer.length, offset);
  offset += 2;
  nameBuffer.copy(header, offset);
  offset += nameBuffer.length;
  
  // MIME type length and data
  header.writeUInt16LE(mimeBuffer.length, offset);
  offset += 2;
  mimeBuffer.copy(header, offset);
  
  return header;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip', '.tar': 'application/x-tar', '.gz': 'application/gzip'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Validate password strength
 */
function validatePasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;
  
  if (password.length >= 12) score++;
  else feedback.push('Use at least 12 characters');
  
  if (/[a-z]/.test(password)) score++;
  else feedback.push('Include lowercase letters');
  
  if (/[A-Z]/.test(password)) score++;
  else feedback.push('Include uppercase letters');
  
  if (/[0-9]/.test(password)) score++;
  else feedback.push('Include numbers');
  
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else feedback.push('Include special characters');
  
  const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    score = Math.max(0, score - 2);
    feedback.push('Avoid common passwords');
  }
  
  return { score: Math.min(4, score), feedback };
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
 * Prompt for confirmation
 */
function promptConfirm(prompt: string, defaultYes: boolean = false): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(prompt, (answer) => {
      rl.close();
      
      if (!answer.trim()) {
        resolve(defaultYes);
      } else {
        resolve(['y', 'yes', '1', 'true'].includes(answer.toLowerCase()));
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