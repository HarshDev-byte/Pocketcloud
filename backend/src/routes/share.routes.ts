import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ShareService } from '../services/share.service';
import { FileService } from '../services/file.service';
import { ActivityService } from '../services/activity.service';
import { requireAuth } from '../middleware/auth.middleware';
import { logShareAccess } from '../middleware/activity.middleware';
import { logger } from '../utils/logger';
import { ValidationError, AppError } from '../utils/errors';
import archiver from 'archiver';
import * as path from 'path';

const router = Router();

// Rate limiting for public share access
const shareAccessLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many share access attempts, please try again later'
    }
  }
});

// Rate limiting for password verification (brute force protection)
const passwordLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 attempts per 5 minutes per IP
  message: {
    success: false,
    error: {
      code: 'PASSWORD_ATTEMPTS_EXCEEDED',
      message: 'Too many password attempts, please try again later'
    }
  }
});

// AUTHENTICATED ROUTES

// POST /api/shares - Create a new share
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileId, folderId, password, expiresInHours, maxDownloads, allowUpload, label } = req.body;
    
    const userId = req.user!.id;
    
    const params = {
      fileId,
      folderId,
      password,
      expiresInHours: expiresInHours ? parseInt(expiresInHours, 10) : undefined,
      maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : undefined,
      allowUpload: !!allowUpload,
      label
    };

    const result = await ShareService.createShare(userId, params);
    
    res.json({
      success: true,
      share: result.share,
      url: result.url,
      qrData: result.url // For QR code generation on frontend
    });

  } catch (error: any) {
    logger.error('Create share failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// GET /api/shares - List user's shares
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const shares = await ShareService.listShares(userId);
    
    res.json({
      success: true,
      shares
    });

  } catch (error: any) {
    logger.error('List shares failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// DELETE /api/shares/:id - Revoke a share
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    await ShareService.revokeShare(id, userId);
    
    res.json({
      success: true,
      message: 'Share revoked successfully'
    });

  } catch (error: any) {
    logger.error('Revoke share failed', { 
      shareId: req.params.id,
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// PUBLIC ROUTES (no authentication required)

// GET /s/:token - Get share info
router.get('/s/:token', shareAccessLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const shareInfo = await ShareService.getShareInfo(token);
    
    res.json({
      success: true,
      ...shareInfo
    });

  } catch (error: any) {
    logger.warn('Share access failed', { 
      token: req.params.token,
      ip: req.ip,
      error: error.message 
    });
    throw error;
  }
});

// POST /s/:token/verify-password - Verify share password
router.post('/s/:token/verify-password', passwordLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required');
    }

    // Validate the share and password
    await ShareService.validateShare(token, password);
    
    // Set a temporary cookie for this share (valid for 1 hour)
    res.cookie(`share_${token}`, 'verified', {
      httpOnly: true,
      secure: false, // HTTP for local network
      maxAge: 60 * 60 * 1000, // 1 hour
      sameSite: 'lax'
    });
    
    res.json({
      success: true,
      message: 'Password verified'
    });

  } catch (error: any) {
    logger.warn('Share password verification failed', { 
      token: req.params.token,
      ip: req.ip,
      error: error.message 
    });
    throw error;
  }
});

// GET /s/:token/download - Download shared file or folder
router.get('/s/:token/download', shareAccessLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    // Check if password verification cookie exists for password-protected shares
    const share = await ShareService.getShareByToken(token);
    if (!share) {
      throw new AppError('SHARE_NOT_FOUND', 'Share not found', 404);
    }

    let password: string | undefined;
    if (share.password_hash) {
      const cookieValue = req.cookies[`share_${token}`];
      if (cookieValue !== 'verified') {
        throw new AppError('PASSWORD_REQUIRED', 'Password verification required', 401);
      }
    }

    // Validate the share
    const validatedShare = await ShareService.validateShare(token, password);
    
    // Increment download count
    ShareService.incrementDownloadCount(validatedShare.id);

    // Log share access
    const resourceName = await ActivityService.getResourceName(
      validatedShare.file_id ? 'file' : 'folder',
      validatedShare.file_id || validatedShare.folder_id!
    );
    logShareAccess(req, token, resourceName || undefined);

    if (validatedShare.file_id) {
      // Single file download
      await FileService.streamFile(validatedShare.file_id, validatedShare.owner_id, res);
    } else if (validatedShare.folder_id) {
      // Folder download as ZIP
      const { folder, files } = await ShareService.getFolderContents(validatedShare.folder_id);
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${folder.name}.zip"`);
      
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      archive.on('error', (err: any) => {
        logger.error('Archive error', { error: err.message });
        throw new AppError('ARCHIVE_ERROR', 'Failed to create archive', 500);
      });

      archive.pipe(res);

      // Add files to archive
      for (const file of files) {
        try {
          const fileStream = await FileService.getFileStream(file.id, validatedShare.owner_id);
          archive.append(fileStream, { name: file.name });
        } catch (error: any) {
          logger.warn('Failed to add file to archive', { 
            fileId: file.id, 
            fileName: file.name,
            error: error.message 
          });
          // Continue with other files
        }
      }

      await archive.finalize();
    }

  } catch (error: any) {
    logger.error('Share download failed', { 
      token: req.params.token,
      ip: req.ip,
      error: error.message 
    });
    throw error;
  }
});

// GET /s/:token/contents - Get folder contents (for folder shares)
router.get('/s/:token/contents', shareAccessLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    // Check password verification if needed
    const share = await ShareService.getShareByToken(token);
    if (!share) {
      throw new AppError('SHARE_NOT_FOUND', 'Share not found', 404);
    }

    if (!share.folder_id) {
      throw new AppError('NOT_FOLDER_SHARE', 'This is not a folder share', 400);
    }

    let password: string | undefined;
    if (share.password_hash) {
      const cookieValue = req.cookies[`share_${token}`];
      if (cookieValue !== 'verified') {
        throw new AppError('PASSWORD_REQUIRED', 'Password verification required', 401);
      }
    }

    // Validate the share
    await ShareService.validateShare(token, password);
    
    // Get folder contents
    const contents = await ShareService.getFolderContents(share.folder_id);
    
    res.json({
      success: true,
      ...contents
    });

  } catch (error: any) {
    logger.error('Get folder contents failed', { 
      token: req.params.token,
      ip: req.ip,
      error: error.message 
    });
    throw error;
  }
});

export default router;