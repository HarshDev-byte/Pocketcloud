import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { BackupService } from '../services/backup.service';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

/**
 * GET /api/admin/backups
 * List all available backups with metadata
 */
router.get('/backups', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const backups = BackupService.listBackups();
    
    res.json({
      success: true,
      data: {
        backups,
        totalCount: backups.length
      }
    });
    
  } catch (error: any) {
    logger.error('Failed to list backups', {
      adminId: req.user!.id,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'BACKUP_LIST_FAILED',
        message: 'Failed to list backups'
      }
    });
  }
});

/**
 * POST /api/admin/backups
 * Create a manual backup immediately
 */
router.post('/backups', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const backupReason = (reason && typeof reason === 'string') 
      ? reason.trim().substring(0, 50) 
      : 'manual';
    
    const backup = await BackupService.createBackup(backupReason);
    
    res.json({
      success: true,
      data: {
        backup,
        message: 'Backup created successfully'
      }
    });
    
    logger.info('Manual backup created', {
      adminId: req.user!.id,
      backup: backup.fileName,
      reason: backupReason
    });
    
  } catch (error: any) {
    logger.error('Failed to create manual backup', {
      adminId: req.user!.id,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'BACKUP_CREATION_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * GET /api/admin/backups/:filename/verify
 * Verify backup file integrity
 */
router.get('/backups/:filename/verify', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    
    // Validate filename (security check)
    if (!filename || filename.includes('..') || filename.includes('/') || !filename.endsWith('.db')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILENAME',
          message: 'Invalid backup filename'
        }
      });
    }
    
    const verification = await BackupService.verifyBackup(filename);
    
    res.json({
      success: true,
      data: verification
    });
    
    logger.info('Backup verification completed', {
      adminId: req.user!.id,
      filename,
      valid: verification.valid
    });
    
  } catch (error: any) {
    logger.error('Failed to verify backup', {
      adminId: req.user!.id,
      filename: req.params.filename,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'BACKUP_VERIFICATION_FAILED',
        message: 'Failed to verify backup'
      }
    });
  }
});

/**
 * POST /api/admin/backups/:filename/restore
 * Restore database from backup (DANGEROUS OPERATION)
 */
router.post('/backups/:filename/restore', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const confirmHeader = req.headers['x-confirm-restore'];
    
    // Validate filename (security check)
    if (!filename || filename.includes('..') || filename.includes('/') || !filename.endsWith('.db')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILENAME',
          message: 'Invalid backup filename'
        }
      });
    }
    
    // Require confirmation header for safety
    if (confirmHeader !== 'yes') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Restore confirmation required. Add header: X-Confirm-Restore: yes'
        }
      });
    }
    
    // Log the restore attempt
    logger.warn('Database restore requested', {
      adminId: req.user!.id,
      adminUsername: req.user!.username,
      filename,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Start restore process (this may restart the backend)
    // Send response immediately as the connection may be lost
    res.json({
      success: true,
      message: 'Database restore initiated. The system will restart. Please reconnect in 15 seconds.',
      estimatedDowntime: '15 seconds'
    });
    
    // Start restore process after sending response
    setImmediate(async () => {
      try {
        await BackupService.restoreFromBackup(filename, req.user!.id);
      } catch (error: any) {
        logger.error('Database restore failed', {
          adminId: req.user!.id,
          filename,
          error: error.message
        });
      }
    });
    
  } catch (error: any) {
    logger.error('Failed to initiate restore', {
      adminId: req.user!.id,
      filename: req.params.filename,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'RESTORE_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * GET /api/admin/backups/:filename/download
 * Download a backup file for off-device storage
 */
router.get('/backups/:filename/download', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    
    // Validate filename (security check)
    if (!filename || filename.includes('..') || filename.includes('/') || !filename.endsWith('.db')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILENAME',
          message: 'Invalid backup filename'
        }
      });
    }
    
    const backupPath = BackupService.getBackupPath(filename);
    
    // Check if backup file exists
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BACKUP_NOT_FOUND',
          message: 'Backup file not found'
        }
      });
    }
    
    // Get file stats
    const stats = fs.statSync(backupPath);
    
    // Set response headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Stream the backup file
    const fileStream = fs.createReadStream(backupPath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      logger.error('Error streaming backup file', {
        adminId: req.user!.id,
        filename,
        error: error.message
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: {
            code: 'DOWNLOAD_FAILED',
            message: 'Failed to download backup file'
          }
        });
      }
    });
    
    logger.info('Backup file download started', {
      adminId: req.user!.id,
      filename,
      sizeBytes: stats.size
    });
    
  } catch (error: any) {
    logger.error('Failed to download backup', {
      adminId: req.user!.id,
      filename: req.params.filename,
      error: error.message
    });
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: {
          code: 'DOWNLOAD_FAILED',
          message: 'Failed to download backup file'
        }
      });
    }
  }
});

export default router;