import { Router, Request, Response } from 'express';
import { BackupDeviceService } from '../services/backup-device.service';
import { UploadService } from '../services/upload.service';
import { DedupService } from '../services/dedup.service';
import { requireAuth } from '../middleware/auth.middleware';
import { uploadInitLimiter } from '../middleware/ratelimit.middleware';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// POST /api/backup/register - Register a backup device
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { deviceName, deviceOs } = req.body;
    const userId = req.user!.id;

    if (!deviceName || !deviceOs) {
      res.status(400).json({
        error: 'MISSING_PARAMS',
        message: 'deviceName and deviceOs are required'
      });
      return;
    }

    if (deviceOs !== 'ios' && deviceOs !== 'android') {
      res.status(400).json({
        error: 'INVALID_OS',
        message: 'deviceOs must be "ios" or "android"'
      });
      return;
    }

    const device = BackupDeviceService.registerDevice(userId, deviceName, deviceOs);

    res.json({ device });
  } catch (err: any) {
    logger.error('Failed to register device', { error: err.message });
    res.status(500).json({
      error: 'REGISTER_FAILED',
      message: 'Failed to register backup device'
    });
  }
});

// POST /api/backup/check - Check manifest to determine what needs upload
router.post('/check', async (req: Request, res: Response) => {
  try {
    const { deviceId, items } = req.body;
    const userId = req.user!.id;

    if (!deviceId || !items || !Array.isArray(items)) {
      res.status(400).json({
        error: 'MISSING_PARAMS',
        message: 'deviceId and items array are required'
      });
      return;
    }

    // Verify device ownership
    BackupDeviceService.getDevice(deviceId, userId);

    // Validate items format
    for (const item of items) {
      if (!item.localId || !item.checksum) {
        res.status(400).json({
          error: 'INVALID_ITEM',
          message: 'Each item must have localId and checksum'
        });
        return;
      }
    }

    const result = BackupDeviceService.checkManifest(deviceId, items);

    res.json(result);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to check manifest', { error: err.message });
      res.status(500).json({
        error: 'CHECK_FAILED',
        message: 'Failed to check backup manifest'
      });
    }
  }
});

// POST /api/backup/upload-init - Initialize photo upload
router.post('/upload-init', uploadInitLimiter, async (req: Request, res: Response) => {
  try {
    const { deviceId, localId, filename, mimeType, size, checksum, takenAt, albumName } = req.body;
    const userId = req.user!.id;

    if (!deviceId || !localId || !filename || !mimeType || !size || !checksum) {
      res.status(400).json({
        error: 'MISSING_PARAMS',
        message: 'deviceId, localId, filename, mimeType, size, and checksum are required'
      });
      return;
    }

    // Verify device ownership
    const device = BackupDeviceService.getDevice(deviceId, userId);

    // Check if content already exists (deduplication)
    const existingContent = DedupService.findExistingContent(checksum);
    
    if (existingContent) {
      // Content exists - create file record pointing to existing content
      logger.info('Dedup hit during backup upload-init', { checksum, localId });

      // Get target folder
      const folderId = BackupDeviceService.getDeviceAlbumFolder(
        userId,
        device.device_name,
        takenAt
      );

      // Create file record with dedup
      const file = DedupService.createDedupFile(
        userId,
        folderId,
        filename,
        mimeType,
        checksum,
        existingContent
      );

      // Record in backup manifest
      BackupDeviceService.recordDedupBackup(deviceId, localId, file.id, checksum);

      // Return special response indicating dedup
      res.json({
        deduplicated: true,
        file,
        message: 'Photo already exists on server, no upload needed'
      });
      return;
    }

    // Get target folder
    const folderId = BackupDeviceService.getDeviceAlbumFolder(
      userId,
      device.device_name,
      takenAt
    );

    // Initialize upload session
    const session = await UploadService.initUpload(userId, {
      filename,
      mimeType,
      size,
      checksum,
      folderId
    });

    // Store deviceId and localId in session metadata (we'll need it on complete)
    // Note: We'll pass these in the complete request instead

    res.json({
      uploadId: session.uploadId,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to init backup upload', { error: err.message });
      res.status(500).json({
        error: 'UPLOAD_INIT_FAILED',
        message: 'Failed to initialize backup upload'
      });
    }
  }
});

// POST /api/backup/upload-complete - Complete photo upload
router.post('/upload-complete', async (req: Request, res: Response) => {
  try {
    const { uploadId, deviceId, localId } = req.body;
    const userId = req.user!.id;

    if (!uploadId || !deviceId || !localId) {
      res.status(400).json({
        error: 'MISSING_PARAMS',
        message: 'uploadId, deviceId, and localId are required'
      });
      return;
    }

    // Verify device ownership
    BackupDeviceService.getDevice(deviceId, userId);

    // Complete the upload
    const file = await UploadService.completeUpload(uploadId, userId);

    // Record in backup manifest
    BackupDeviceService.recordBackup(deviceId, localId, file.id, file.checksum);

    // Get updated progress
    const progress = BackupDeviceService.getBackupProgress(deviceId);

    res.json({ file, progress });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to complete backup upload', { error: err.message });
      res.status(500).json({
        error: 'UPLOAD_COMPLETE_FAILED',
        message: 'Failed to complete backup upload'
      });
    }
  }
});

// GET /api/backup/progress/:deviceId - Get backup progress
router.get('/progress/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user!.id;

    // Verify device ownership
    BackupDeviceService.getDevice(deviceId, userId);

    const progress = BackupDeviceService.getBackupProgress(deviceId);

    res.json(progress);
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to get backup progress', { error: err.message });
      res.status(500).json({
        error: 'PROGRESS_FAILED',
        message: 'Failed to get backup progress'
      });
    }
  }
});

// GET /api/backup/devices - List all backup devices
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const devices = BackupDeviceService.getUserDevices(userId);

    res.json({ devices });
  } catch (err: any) {
    logger.error('Failed to list devices', { error: err.message });
    res.status(500).json({
      error: 'LIST_FAILED',
      message: 'Failed to list backup devices'
    });
  }
});

// DELETE /api/backup/devices/:id - Unregister a device
router.delete('/devices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    BackupDeviceService.unregisterDevice(id, userId);

    res.json({
      success: true,
      message: 'Device unregistered successfully'
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message
      });
    } else {
      logger.error('Failed to unregister device', { error: err.message });
      res.status(500).json({
        error: 'UNREGISTER_FAILED',
        message: 'Failed to unregister device'
      });
    }
  }
});

export default router;
