import { Router, Request, Response } from 'express';
import { existsSync, createReadStream, statSync } from 'fs';
import { join } from 'path';
import { MediaService } from '../services/media.service';
import { requireAuth } from '../middleware/auth';
import { db } from '../db';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

/**
 * Get thumbnail for file
 * GET /api/files/:id/thumbnail?size=sm|md
 */
router.get('/files/:id/thumbnail', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const size = req.query.size as 'sm' | 'md' || 'md';
    
    if (!['sm', 'md'].includes(size)) {
      return res.status(400).json({ error: 'Invalid size parameter' });
    }

    // Check if user owns the file
    const fileStmt = db.prepare('SELECT owner_id FROM files WHERE id = ? AND is_deleted = 0');
    const file = fileStmt.get(id) as { owner_id: string } | undefined;
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (file.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get thumbnail path
    const thumbnailPath = MediaService.getThumbnailPath(id, size);
    
    if (!thumbnailPath || !existsSync(thumbnailPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    // Set cache headers (1 year)
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': size === 'sm' ? 'image/webp' : 'image/webp'
    });

    // Stream the thumbnail
    const stream = createReadStream(thumbnailPath);
    stream.pipe(res);

  } catch (error) {
    console.error('Thumbnail serve error:', error);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

/**
 * Get poster frame for video
 * GET /api/files/:id/poster
 */
router.get('/files/:id/poster', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user owns the file
    const fileStmt = db.prepare('SELECT owner_id, mime_type FROM files WHERE id = ? AND is_deleted = 0');
    const file = fileStmt.get(id) as { owner_id: string; mime_type: string } | undefined;
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (file.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!file.mime_type.startsWith('video/')) {
      return res.status(400).json({ error: 'File is not a video' });
    }

    // Get poster path
    const posterPath = MediaService.getPosterPath(id);
    
    if (!posterPath || !existsSync(posterPath)) {
      return res.status(404).json({ error: 'Poster not found' });
    }

    // Set cache headers
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': 'image/jpeg'
    });

    // Stream the poster
    const stream = createReadStream(posterPath);
    stream.pipe(res);

  } catch (error) {
    console.error('Poster serve error:', error);
    res.status(500).json({ error: 'Failed to serve poster' });
  }
});

/**
 * Get HLS master playlist
 * GET /api/files/:id/hls/master.m3u8
 */
router.get('/files/:id/hls/master.m3u8', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user owns the file
    const fileStmt = db.prepare('SELECT owner_id, mime_type FROM files WHERE id = ? AND is_deleted = 0');
    const file = fileStmt.get(id) as { owner_id: string; mime_type: string } | undefined;
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (file.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!file.mime_type.startsWith('video/')) {
      return res.status(400).json({ error: 'File is not a video' });
    }

    // Get HLS path
    const hlsPath = MediaService.getHLSPath(id);
    
    if (!hlsPath) {
      return res.status(404).json({ error: 'HLS not available' });
    }

    const masterPlaylistPath = join(hlsPath, 'master.m3u8');
    
    if (!existsSync(masterPlaylistPath)) {
      return res.status(404).json({ error: 'HLS playlist not found' });
    }

    // Set appropriate headers for HLS
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache'
    });

    // Stream the playlist
    const stream = createReadStream(masterPlaylistPath);
    stream.pipe(res);

  } catch (error) {
    console.error('HLS master playlist serve error:', error);
    res.status(500).json({ error: 'Failed to serve HLS playlist' });
  }
});

/**
 * Get HLS segment files
 * GET /api/files/:id/hls/:quality/:segment
 */
router.get('/files/:id/hls/:quality/:segment', async (req: Request, res: Response) => {
  try {
    const { id, quality, segment } = req.params;

    // Validate quality parameter
    if (!['360p', '720p'].includes(quality)) {
      return res.status(400).json({ error: 'Invalid quality parameter' });
    }

    // Validate segment parameter (should be playlist.m3u8 or segment_xxx.ts)
    if (!/^(playlist\.m3u8|segment_\d{3}\.ts)$/.test(segment)) {
      return res.status(400).json({ error: 'Invalid segment parameter' });
    }

    // Check if user owns the file
    const fileStmt = db.prepare('SELECT owner_id, mime_type FROM files WHERE id = ? AND is_deleted = 0');
    const file = fileStmt.get(id) as { owner_id: string; mime_type: string } | undefined;
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (file.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!file.mime_type.startsWith('video/')) {
      return res.status(400).json({ error: 'File is not a video' });
    }

    // Get HLS path
    const hlsPath = MediaService.getHLSPath(id);
    
    if (!hlsPath) {
      return res.status(404).json({ error: 'HLS not available' });
    }

    const segmentPath = join(hlsPath, quality, segment);
    
    if (!existsSync(segmentPath)) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    // Set appropriate headers
    if (segment.endsWith('.m3u8')) {
      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache'
      });
    } else if (segment.endsWith('.ts')) {
      res.set({
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
    }

    // Stream the segment
    const stream = createReadStream(segmentPath);
    stream.pipe(res);

  } catch (error) {
    console.error('HLS segment serve error:', error);
    res.status(500).json({ error: 'Failed to serve HLS segment' });
  }
});

/**
 * Get full media metadata
 * GET /api/files/:id/info
 */
router.get('/files/:id/info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user owns the file
    const fileStmt = db.prepare('SELECT owner_id FROM files WHERE id = ? AND is_deleted = 0');
    const file = fileStmt.get(id) as { owner_id: string } | undefined;
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (file.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get media info
    const mediaInfo = MediaService.getMediaInfo(id);
    
    if (!mediaInfo) {
      return res.status(404).json({ error: 'Media info not found' });
    }

    res.json({
      fileId: id,
      ...mediaInfo,
      hasThumbnails: MediaService.hasThumbnails(id)
    });

  } catch (error) {
    console.error('Media info error:', error);
    res.status(500).json({ error: 'Failed to get media info' });
  }
});

/**
 * Get processing status
 * GET /api/files/:id/processing-status
 */
router.get('/files/:id/processing-status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user owns the file
    const fileStmt = db.prepare('SELECT owner_id, processing_status, processing_error FROM files WHERE id = ? AND is_deleted = 0');
    const file = fileStmt.get(id) as { 
      owner_id: string; 
      processing_status: string; 
      processing_error?: string 
    } | undefined;
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    if (file.owner_id !== req.user!.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      fileId: id,
      status: file.processing_status || 'pending',
      error: file.processing_error || null
    });

  } catch (error) {
    console.error('Processing status error:', error);
    res.status(500).json({ error: 'Failed to get processing status' });
  }
});

/**
 * Reprocess file (admin only)
 * POST /api/files/:id/reprocess
 */
router.post('/files/:id/reprocess', async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    // Check if file exists
    const fileStmt = db.prepare('SELECT id, mime_type FROM files WHERE id = ? AND is_deleted = 0');
    const file = fileStmt.get(id) as { id: string; mime_type: string } | undefined;
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Add to processing queue
    const { mediaWorker } = require('../workers/media.worker');
    mediaWorker.addJob(id, file.mime_type);

    res.json({ 
      message: 'File queued for reprocessing',
      fileId: id 
    });

  } catch (error) {
    console.error('Reprocess error:', error);
    res.status(500).json({ error: 'Failed to queue file for reprocessing' });
  }
});

export default router;