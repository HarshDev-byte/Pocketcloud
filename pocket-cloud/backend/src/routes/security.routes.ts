/**
 * Security routes - Kali Linux specific features
 * Secure deletion, encryption, and audit logging
 */

import { Router, Request, Response } from 'express';
import { join } from 'path';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { randomBytes, createCipher, createDecipher, pbkdf2Sync } from 'crypto';
import { auth } from '../middleware/auth';
import { auditService } from '../services/audit.service';
import { logger } from '../services/logger.service';

const router = Router();

// All security routes require authentication
router.use(auth);

/**
 * Secure delete file (DoD 3-pass overwrite)
 */
router.post('/secure-delete', async (req: Request, res: Response) => {
  try {
    const { path, passes = 3 } = req.body;
    
    if (!path) {
      return res.status(400).json({ error: 'Path is required' });
    }

    if (passes < 1 || passes > 10) {
      return res.status(400).json({ error: 'Passes must be between 1 and 10' });
    }

    // Get user from auth middleware
    const user = (req as any).user;
    
    // Resolve full file path
    const uploadsDir = join(__dirname, '../../uploads');
    const fullPath = join(uploadsDir, path);
    
    // Security check - ensure path is within uploads directory
    if (!fullPath.startsWith(uploadsDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Perform secure deletion
    await secureDeleteFile(fullPath, passes);
    
    // Log the secure deletion
    await auditService.logAction({
      userId: user.id,
      action: 'secure_delete',
      resource: path,
      details: { passes },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    logger.info(`Secure delete completed: ${path} (${passes} passes) by user ${user.username}`);

    res.json({
      success: true,
      message: `File securely deleted with ${passes} passes`
    });

  } catch (error: any) {
    logger.error('Secure delete error:', error);
    res.status(500).json({ error: 'Secure deletion failed' });
  }
});

/**
 * Encrypt file before storage
 */
router.post('/encrypt', async (req: Request, res: Response) => {
  try {
    const { path, password } = req.body;
    
    if (!path || !password) {
      return res.status(400).json({ error: 'Path and password are required' });
    }

    const user = (req as any).user;
    const uploadsDir = join(__dirname, '../../uploads');
    const fullPath = join(uploadsDir, path);
    
    // Security check
    if (!fullPath.startsWith(uploadsDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Encrypt file
    const encryptedPath = await encryptFile(fullPath, password);
    
    // Remove original file
    unlinkSync(fullPath);
    
    // Log the encryption
    await auditService.logAction({
      userId: user.id,
      action: 'encrypt',
      resource: path,
      details: { encrypted_path: encryptedPath },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    logger.info(`File encrypted: ${path} by user ${user.username}`);

    res.json({
      success: true,
      message: 'File encrypted successfully',
      encryptedPath: encryptedPath.replace(uploadsDir, '')
    });

  } catch (error: any) {
    logger.error('Encryption error:', error);
    res.status(500).json({ error: 'Encryption failed' });
  }
});

/**
 * Decrypt file for download
 */
router.post('/decrypt', async (req: Request, res: Response) => {
  try {
    const { path, password } = req.body;
    
    if (!path || !password) {
      return res.status(400).json({ error: 'Path and password are required' });
    }

    const user = (req as any).user;
    const uploadsDir = join(__dirname, '../../uploads');
    const fullPath = join(uploadsDir, path);
    
    // Security check
    if (!fullPath.startsWith(uploadsDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!existsSync(fullPath)) {
      return res.status(404).json({ error: 'Encrypted file not found' });
    }

    // Decrypt file
    const decryptedPath = await decryptFile(fullPath, password);
    
    // Log the decryption
    await auditService.logAction({
      userId: user.id,
      action: 'decrypt',
      resource: path,
      details: { decrypted_path: decryptedPath },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    logger.info(`File decrypted: ${path} by user ${user.username}`);

    res.json({
      success: true,
      message: 'File decrypted successfully',
      decryptedPath: decryptedPath.replace(uploadsDir, '')
    });

  } catch (error: any) {
    logger.error('Decryption error:', error);
    res.status(500).json({ error: 'Decryption failed' });
  }
});

/**
 * Get security audit log
 */
router.get('/audit', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Only admin users can view full audit log
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      file,
      action,
      days = 7,
      limit = 100
    } = req.query;

    const filters: any = {};
    
    if (file) filters.resource = file;
    if (action) filters.action = action;
    
    // Get audit entries
    const entries = await auditService.getAuditLog({
      ...filters,
      days: parseInt(days as string),
      limit: parseInt(limit as string)
    });

    res.json({
      success: true,
      data: entries
    });

  } catch (error: any) {
    logger.error('Audit log error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit log' });
  }
});

/**
 * Security status and statistics
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Get security statistics
    const stats = await getSecurityStats(user.id);
    
    res.json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    logger.error('Security status error:', error);
    res.status(500).json({ error: 'Failed to get security status' });
  }
});

// Helper functions

/**
 * Securely delete file with multiple overwrite passes
 */
async function secureDeleteFile(filePath: string, passes: number): Promise<void> {
  const fs = await import('fs');
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  
  for (let pass = 0; pass < passes; pass++) {
    let pattern: Buffer;
    
    switch (pass % 3) {
      case 0:
        // Pass 1: All zeros
        pattern = Buffer.alloc(fileSize, 0x00);
        break;
      case 1:
        // Pass 2: All ones
        pattern = Buffer.alloc(fileSize, 0xFF);
        break;
      case 2:
        // Pass 3: Random data
        pattern = randomBytes(fileSize);
        break;
      default:
        pattern = randomBytes(fileSize);
    }
    
    // Overwrite file
    fs.writeFileSync(filePath, pattern);
    fs.fsyncSync(fs.openSync(filePath, 'r+'));
  }
  
  // Finally delete the file
  fs.unlinkSync(filePath);
}

/**
 * Encrypt file with AES-256
 */
async function encryptFile(filePath: string, password: string): Promise<string> {
  const fs = await import('fs');
  
  // Generate salt and derive key
  const salt = randomBytes(32);
  const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = randomBytes(16);
  
  // Read file
  const data = fs.readFileSync(filePath);
  
  // Encrypt
  const cipher = createCipher('aes-256-cbc', key);
  cipher.setAutoPadding(true);
  
  let encrypted = cipher.update(data);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  // Combine salt + iv + encrypted data
  const result = Buffer.concat([salt, iv, encrypted]);
  
  // Write encrypted file
  const encryptedPath = filePath + '.enc';
  fs.writeFileSync(encryptedPath, result);
  
  return encryptedPath;
}

/**
 * Decrypt file with AES-256
 */
async function decryptFile(filePath: string, password: string): Promise<string> {
  const fs = await import('fs');
  
  // Read encrypted file
  const data = fs.readFileSync(filePath);
  
  // Extract salt, iv, and encrypted data
  const salt = data.slice(0, 32);
  const iv = data.slice(32, 48);
  const encrypted = data.slice(48);
  
  // Derive key
  const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  
  // Decrypt
  const decipher = createDecipher('aes-256-cbc', key);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  // Write decrypted file
  const decryptedPath = filePath.replace('.enc', '.dec');
  fs.writeFileSync(decryptedPath, decrypted);
  
  return decryptedPath;
}

/**
 * Get security statistics for user
 */
async function getSecurityStats(userId: string): Promise<any> {
  // This would query the audit log for statistics
  const stats = {
    totalActions: 0,
    secureDeletes: 0,
    encryptions: 0,
    decryptions: 0,
    lastActivity: null,
    riskLevel: 'low'
  };
  
  // Implementation would count audit entries
  // For now, return mock data
  
  return stats;
}

export { router as securityRoutes };