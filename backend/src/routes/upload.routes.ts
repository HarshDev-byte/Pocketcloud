import { Router, Request, Response } from 'express';
import { UploadService } from '../services/upload.service';
import { requireAuth } from '../middleware/auth.middleware';
import { createActivityLogger } from '../middleware/activity.middleware';
import { Actions } from '../services/activity.service';
import { logger } from '../utils/logger';

const router = Router();

// Middleware for raw binary data on chunk upload
router.use('/:uploadId/chunk/:chunkIndex', (req, res, next) => {
  if (req.method === 'PUT') {
    // Raw body is already parsed by express.raw() middleware in main app
    next();
  } else {
    next();
  }
});

// POST /api/upload/init - Initialize upload session
router.post('/init', requireAuth, async (req: Request, res: Response) => {
  try {
    const { filename, mimeType, size, checksum, folderId } = req.body;

    // Manual validation (TODO: add Zod in later prompt)
    if (!filename || typeof filename !== 'string' || filename.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILENAME',
          message: 'Filename is required and must be a non-empty string'
        }
      });
    }

    if (!mimeType || typeof mimeType !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MIME_TYPE',
          message: 'MIME type is required'
        }
      });
    }

    if (!size || typeof size !== 'number' || size <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SIZE',
          message: 'Size must be a positive number'
        }
      });
    }

    if (!checksum || typeof checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(checksum)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CHECKSUM',
          message: 'Checksum must be a 64-character hex string'
        }
      });
    }

    if (folderId && typeof folderId !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FOLDER_ID',
          message: 'Folder ID must be a string'
        }
      });
    }

    const userId = req.user!.id;

    const result = await UploadService.initUpload(userId, {
      filename,
      mimeType,
      size,
      checksum,
      folderId
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    logger.error('Upload init failed', { error: error.message, body: req.body });

    if (error.message === 'INSUFFICIENT_SPACE') {
      return res.status(507).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_SPACE',
          message: 'Not enough storage space available'
        }
      });
    }

    if (error.message === 'QUOTA_EXCEEDED' || error.code === 'QUOTA_EXCEEDED') {
      return res.status(507).json({
        success: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: error.message || 'Upload would exceed your storage quota',
          details: error.details || {}
        }
      });
    }

    if (error.message.startsWith('INVALID_') || error.message === 'FOLDER_NOT_FOUND') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.message,
          message: error.message.replace(/_/g, ' ').toLowerCase()
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to initialize upload'
      }
    });
  }
});

// PUT /api/upload/:uploadId/chunk/:chunkIndex - Upload chunk
router.put('/:uploadId/chunk/:chunkIndex', requireAuth, async (req: Request, res: Response) => {
  try {
    const { uploadId, chunkIndex: chunkIndexStr } = req.params;
    const chunkIndex = parseInt(chunkIndexStr, 10);

    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CHUNK_INDEX',
          message: 'Chunk index must be a non-negative integer'
        }
      });
    }

    const rawBody = req.body as Buffer;
    if (!rawBody || rawBody.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_CHUNK',
          message: 'Chunk data is required'
        }
      });
    }

    const result = await UploadService.saveChunk(uploadId, chunkIndex, rawBody);

    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    logger.error('Chunk upload failed', { 
      uploadId: req.params.uploadId,
      chunkIndex: req.params.chunkIndex,
      error: error.message 
    });

    if (error.message === 'UPLOAD_SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'UPLOAD_SESSION_NOT_FOUND',
          message: 'Upload session not found'
        }
      });
    }

    if (error.message === 'UPLOAD_SESSION_EXPIRED') {
      return res.status(410).json({
        success: false,
        error: {
          code: 'UPLOAD_SESSION_EXPIRED',
          message: 'Upload session has expired'
        }
      });
    }

    if (error.message.startsWith('INVALID_')) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.message,
          message: error.message.replace(/_/g, ' ').toLowerCase()
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to save chunk'
      }
    });
  }
});

// GET /api/upload/:uploadId/progress - Get upload progress
router.get('/:uploadId/progress', requireAuth, async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;
    const userId = req.user!.id;

    const progress = await UploadService.getProgress(uploadId, userId);

    res.json({
      success: true,
      ...progress
    });

  } catch (error: any) {
    logger.error('Get progress failed', { uploadId: req.params.uploadId, error: error.message });

    if (error.message === 'UPLOAD_SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'UPLOAD_SESSION_NOT_FOUND',
          message: 'Upload session not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get upload progress'
      }
    });
  }
});

// POST /api/upload/:uploadId/complete - Complete upload
router.post('/:uploadId/complete', 
  requireAuth, 
  createActivityLogger(Actions.FILE_UPLOAD, (req, res) => ({
    resourceType: 'file',
    resourceId: res?.locals?.file?.id,
    resourceName: res?.locals?.file?.name,
    details: {
      uploadId: req.params.uploadId,
      fileSize: res?.locals?.file?.size,
      mimeType: res?.locals?.file?.mime_type
    }
  })),
  async (req: Request, res: Response) => {
    try {
      const { uploadId } = req.params;
      const userId = req.user!.id;

      const file = await UploadService.completeUpload(uploadId, userId);

      // Store file info for activity logging
      res.locals.file = file;

      res.json({
        success: true,
        file
      });

    } catch (error: any) {
    logger.error('Upload complete failed', { uploadId: req.params.uploadId, error: error.message });

    if (error.message === 'UPLOAD_SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'UPLOAD_SESSION_NOT_FOUND',
          message: 'Upload session not found'
        }
      });
    }

    if (error.message === 'CHECKSUM_MISMATCH') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CHECKSUM_MISMATCH',
          message: 'File checksum does not match expected value'
        }
      });
    }

    if (error.message.startsWith('MISSING_CHUNKS:')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CHUNKS',
          message: error.message
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to complete upload'
      }
    });
  }
});

// DELETE /api/upload/:uploadId - Abort upload
router.delete('/:uploadId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;
    const userId = req.user!.id;

    await UploadService.abortUpload(uploadId, userId);

    res.json({
      success: true,
      message: 'Upload aborted successfully'
    });

  } catch (error: any) {
    logger.error('Upload abort failed', { uploadId: req.params.uploadId, error: error.message });

    if (error.message === 'UPLOAD_SESSION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'UPLOAD_SESSION_NOT_FOUND',
          message: 'Upload session not found'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to abort upload'
      }
    });
  }
});

export default router;