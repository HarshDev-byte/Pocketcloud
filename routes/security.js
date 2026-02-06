/**
 * Security routes for PocketCloud
 * Handles backup and restore operations
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { requireAuth } = require('../middleware/auth');
const backupService = require('../services/backupService');
const restoreService = require('../services/restoreService');
const { getStorageInfo } = require('../services/storageService');
const { getIdentity } = require('../services/identityService');

const router = express.Router();

// Apply authentication to all security routes
router.use(requireAuth);

// Configure multer for backup file uploads
const upload = multer({
  dest: path.join(process.cwd(), 'temp'),
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB max backup size
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.pcbackup')) {
      cb(null, true);
    } else {
      cb(new Error('Only .pcbackup files are allowed'));
    }
  }
});

/**
 * GET /security - Security dashboard
 */
router.get('/', async (req, res) => {
  try {
    const [storageInfo, identity, backupStats, backupReminder] = await Promise.all([
      getStorageInfo(),
      getIdentity(),
      backupService.getBackupStats(),
      backupService.shouldShowBackupReminder()
    ]);
    
    res.render('security', {
      title: 'Security',
      username: req.session.username,
      storageInfo,
      identity,
      backupStats,
      backupReminder
    });
  } catch (error) {
    console.error('Security page error:', error);
    res.status(500).render('error', { 
      message: 'Failed to load security page' 
    });
  }
});

/**
 * POST /security/backup - Create backup
 */
router.post('/backup', async (req, res) => {
  try {
    // Get backup stats for filename
    const stats = await backupService.getBackupStats();
    
    if (stats.error) {
      return res.status(500).json({ 
        error: 'Failed to prepare backup',
        details: stats.error
      });
    }
    
    // Create backup stream
    const { stream, manifest } = await backupService.createBackupStream();
    
    // Set response headers for download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `pocketcloud-backup-${timestamp}.pcbackup`;
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Backup-Manifest', JSON.stringify(manifest));
    
    // Stream backup to client
    stream.pipe(res);
    
    // Record backup creation when stream completes
    stream.on('end', async () => {
      try {
        await backupService.recordBackupCreated();
      } catch (error) {
        console.warn('Failed to record backup creation:', error.message);
      }
    });
    
    stream.on('error', (error) => {
      console.error('Backup stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Backup creation failed',
          details: error.message
        });
      }
    });
    
  } catch (error) {
    console.error('Backup creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create backup',
      details: error.message
    });
  }
});

/**
 * POST /security/restore/preview - Preview restore file
 */
router.post('/restore/preview', upload.single('backup'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No backup file provided' 
      });
    }
    
    const preview = await restoreService.getRestorePreview(req.file.path);
    
    // Clean up uploaded file
    try {
      await fs.remove(req.file.path);
    } catch (cleanupError) {
      console.warn('Failed to clean up preview file:', cleanupError.message);
    }
    
    if (!preview.valid) {
      return res.status(400).json({
        error: 'Invalid backup file',
        details: preview.error
      });
    }
    
    res.json({
      valid: true,
      preview
    });
    
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.remove(req.file.path);
      } catch (cleanupError) {
        console.warn('Failed to clean up preview file after error:', cleanupError.message);
      }
    }
    
    console.error('Restore preview error:', error);
    res.status(500).json({ 
      error: 'Failed to preview backup',
      details: error.message
    });
  }
});

/**
 * POST /security/restore/confirm - Perform restore
 */
router.post('/restore/confirm', upload.single('backup'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No backup file provided' 
      });
    }
    
    // Verify confirmation
    if (req.body.confirmation !== 'DESTROY_CURRENT_DATA') {
      await fs.remove(req.file.path);
      return res.status(400).json({
        error: 'Invalid confirmation',
        details: 'You must type "DESTROY_CURRENT_DATA" to confirm'
      });
    }
    
    // Perform restore
    const result = await restoreService.performRestore(req.file.path);
    
    // Clean up uploaded file
    try {
      await fs.remove(req.file.path);
    } catch (cleanupError) {
      console.warn('Failed to clean up restore file:', cleanupError.message);
    }
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Restore failed',
        details: result.error
      });
    }
    
    // Clear session to force re-login
    req.session.destroy((err) => {
      if (err) {
        console.warn('Failed to destroy session after restore:', err);
      }
    });
    
    res.json({
      success: true,
      message: 'Restore completed successfully',
      encryptedFileCount: result.encryptedFileCount,
      redirectTo: '/auth/login?restored=1'
    });
    
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.remove(req.file.path);
      } catch (cleanupError) {
        console.warn('Failed to clean up restore file after error:', cleanupError.message);
      }
    }
    
    console.error('Restore error:', error);
    res.status(500).json({ 
      error: 'Restore operation failed',
      details: error.message
    });
  }
});

/**
 * GET /security/backup/stats - Get backup statistics
 */
router.get('/backup/stats', async (req, res) => {
  try {
    const stats = await backupService.getBackupStats();
    res.json(stats);
  } catch (error) {
    console.error('Backup stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get backup statistics',
      details: error.message
    });
  }
});

module.exports = router;