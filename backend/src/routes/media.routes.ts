import { Router, Request, Response } from 'express';
import { MediaService } from '../services/media.service';
import { requireAuth } from '../middleware/auth.middleware';
import { createActivityLogger } from '../middleware/activity.middleware';
import { Actions } from '../services/activity.service';
import { logger } from '../utils/logger';
import { db } from '../db/client';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

// Middleware to verify file ownership
const verifyFileOwnership = async (req: Request, res: Response, next: Function) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(id, userId);
    
    if (!file) {
      throw new NotFoundError('File not found or access denied');
    }

    (req as any).file = file;
    next();
  } catch (error) {
    next(error);
  }
};

// GET /api/files/:id/thumbnail - Serve thumbnail image
router.get('/:id/thumbnail', 
  requireAuth,
  verifyFileOwnership,
  createActivityLogger(Actions.FILE_VIEW, (req) => ({
    resourceType: 'file',
    resourceId: req.params.id,
    resourceName: (req as any).file?.name,
    details: {
      thumbnailSize: req.query.size || 'sm',
      userAgent: req.get('User-Agent')
    }
  })),
  async (req: Request, res: Response) => {
    try {
      const file = (req as any).file;
      const size = (req.query.size as string) || 'sm';
      
      if (!['sm', 'md'].includes(size)) {
        res.status(400).json({ error: 'Invalid size parameter. Use "sm" or "md"' });
        return;
      }

      const thumbnailPath = size === 'sm' ? file.thumb_sm_path : file.thumb_md_path;

      if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
        // Check if processing is in progress
        if (file.media_status === 'pending') {
          res.status(202).json({
            status: 'processing',
            message: 'Thumbnail is being generated'
          });
          return;
        }

        // No thumbnail available and not processing
        res.status(404).json({ error: 'Thumbnail not available' });
        return;
      }

      // Set caching headers for thumbnails
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', thumbnailPath.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

      // Stream thumbnail file
      const stream = fs.createReadStream(thumbnailPath);
      stream.pipe(res);

      stream.on('error', (error) => {
        logger.error('Thumbnail streaming error', { 
          fileId: file.id, 
          thumbnailPath, 
          error: error.message 
        });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to serve thumbnail' });
        }
      });

    } catch (error: any) {
      logger.error('Thumbnail request failed', { 
        fileId: req.params.id, 
        error: error.message 
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/files/:id/hls/master.m3u8 - Serve HLS master playlist
router.get('/:id/hls/master.m3u8',
  requireAuth,
  verifyFileOwnership,
  createActivityLogger(Actions.FILE_STREAM, (req) => ({
    resourceType: 'file',
    resourceId: req.params.id,
    resourceName: (req as any).file?.name,
    details: {
      streamType: 'hls_master',
      userAgent: req.get('User-Agent')
    }
  })),
  async (req: Request, res: Response) => {
    try {
      const file = (req as any).file;

      if (!file.mime_type.startsWith('video/')) {
        res.status(400).json({ error: 'HLS streaming only available for video files' });
        return;
      }

      // Check HLS stream status
      const hlsStream = db.prepare('SELECT * FROM hls_streams WHERE file_id = ?').get(file.id) as any;

      if (!hlsStream) {
        // HLS not started, enqueue generation
        await MediaService.enqueueFile(file.id, file.mime_type);
        res.status(202).json({
          status: 'processing',
          message: 'HLS stream is being generated',
          estimatedMinutes: 2
        });
        return;
      }

      if (hlsStream.status === 'pending') {
        res.status(202).json({
          status: 'processing',
          message: 'HLS stream is being generated',
          estimatedMinutes: 2
        });
        return;
      }

      if (hlsStream.status === 'failed') {
        res.status(500).json({ 
          error: 'HLS generation failed',
          details: hlsStream.error
        });
        return;
      }

      // Serve master playlist
      if (!fs.existsSync(hlsStream.master_path)) {
        res.status(404).json({ error: 'HLS stream files not found' });
        return;
      }

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const stream = fs.createReadStream(hlsStream.master_path);
      stream.pipe(res);

    } catch (error: any) {
      logger.error('HLS master playlist request failed', { 
        fileId: req.params.id, 
        error: error.message 
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/files/:id/hls/:filename - Serve HLS segments and playlists
router.get('/:id/hls/:filename',
  requireAuth,
  verifyFileOwnership,
  async (req: Request, res: Response) => {
    try {
      const file = (req as any).file;
      const { filename } = req.params;

      // Validate filename to prevent path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        res.status(400).json({ error: 'Invalid filename' });
        return;
      }

      // Check HLS stream exists
      const hlsStream = db.prepare('SELECT * FROM hls_streams WHERE file_id = ?').get(file.id) as any;
      
      if (!hlsStream || hlsStream.status !== 'ready') {
        res.status(404).json({ error: 'HLS stream not available' });
        return;
      }

      const hlsDir = path.dirname(hlsStream.master_path);
      const filePath = path.join(hlsDir, filename);

      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'HLS file not found' });
        return;
      }

      // Set appropriate content type
      if (filename.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      } else if (filename.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/MP2T');
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);

    } catch (error: any) {
      logger.error('HLS file request failed', { 
        fileId: req.params.id, 
        filename: req.params.filename,
        error: error.message 
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/files/:id/exif - Get EXIF metadata
router.get('/:id/exif',
  requireAuth,
  verifyFileOwnership,
  async (req: Request, res: Response) => {
    try {
      const file = (req as any).file;

      const exifData = {
        camera: file.exif_camera,
        dateTaken: file.exif_date ? new Date(file.exif_date).toISOString() : null,
        location: (file.exif_lat && file.exif_lng) ? {
          lat: file.exif_lat,
          lng: file.exif_lng
        } : null,
        dimensions: (file.media_width && file.media_height) ? {
          width: file.media_width,
          height: file.media_height
        } : null,
        duration: file.media_duration || null,
        codec: file.media_codec || null,
        dominantColor: file.dominant_color || null
      };

      res.json({
        success: true,
        exif: exifData
      });

    } catch (error: any) {
      logger.error('EXIF request failed', { 
        fileId: req.params.id, 
        error: error.message 
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Admin routes for media queue management
const requireAdmin = (req: Request, res: Response, next: Function) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  next();
};

// GET /api/media/queue - Get media processing queue status (admin only)
router.get('/queue',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const queueStatus = MediaService.getQueueStatus();
      
      res.json({
        success: true,
        queue: queueStatus
      });

    } catch (error: any) {
      logger.error('Media queue status request failed', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/media/reprocess/:id - Reprocess media for a file (admin only)
router.post('/reprocess/:id',
  requireAuth,
  requireAdmin,
  createActivityLogger(Actions.ADMIN_MEDIA_REPROCESS, (req) => ({
    resourceType: 'file',
    resourceId: req.params.id,
    details: {
      triggeredBy: req.user?.id
    }
  })),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify file exists
      const file = db.prepare('SELECT * FROM files WHERE id = ? AND is_deleted = 0').get(id);
      
      if (!file) {
        throw new NotFoundError('File not found');
      }

      await MediaService.reprocessFile(id);

      res.json({
        success: true,
        message: 'Media reprocessing initiated'
      });

    } catch (error: any) {
      logger.error('Media reprocess request failed', { 
        fileId: req.params.id, 
        error: error.message 
      });
      
      if (error instanceof NotFoundError) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }
);

// GET /api/media/stats - Get media processing statistics (admin only)
router.get('/stats',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total_files,
          COUNT(CASE WHEN thumb_sm_path IS NOT NULL THEN 1 END) as files_with_thumbnails,
          COUNT(CASE WHEN media_status = 'processed' THEN 1 END) as fully_processed,
          COUNT(CASE WHEN media_status = 'pending' THEN 1 END) as pending_processing,
          COUNT(CASE WHEN media_status = 'failed' THEN 1 END) as failed_processing
        FROM files 
        WHERE is_deleted = 0
      `).get();

      const hlsStats = db.prepare(`
        SELECT 
          COUNT(*) as total_hls_streams,
          COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_streams,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_streams,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_streams
        FROM hls_streams
      `).get();

      const queueStats = MediaService.getQueueStatus();

      res.json({
        success: true,
        stats: {
          files: stats,
          hls: hlsStats,
          queue: {
            queued: queueStats.queued,
            processing: queueStats.processing,
            failed: queueStats.failed
          }
        }
      });

    } catch (error: any) {
      logger.error('Media stats request failed', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;