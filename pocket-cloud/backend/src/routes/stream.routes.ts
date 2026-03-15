import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { createRateLimitMiddleware } from '../middleware/ratelimit.transfer.js';
import { transcoderService } from '../services/transcoder.service.js';
import { hlsService } from '../services/hls.service.js';
import { LoggerService } from '../services/logger.service.js';
import { db } from '../db/index.js';

// Import fs and path using eval to avoid TypeScript module resolution issues
const fs = eval('require')('fs');
const path = eval('require')('path');

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

// Apply bandwidth rate limiting for streaming (higher priority)
router.use(createRateLimitMiddleware({ transferType: 'streaming' }));

/**
 * Get HLS master playlist
 * GET /stream/:fileId/master.m3u8
 */
router.get('/:fileId/master.m3u8', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' });
      return;
    }

    // Check file ownership and type
    const file = await getVideoFile(fileId, req.user!.id);
    if (!file) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    // Get or generate HLS master playlist
    let masterPath = hlsService.getMasterPlaylistPath(fileId);
    
    if (!masterPath) {
      // Generate HLS on demand
      const mediaInfo = await transcoderService.getMediaInfo(file.storage_path);
      const qualities = mediaInfo.compatibleProfiles;
      
      LoggerService.info('stream', `Generating HLS for ${fileId}`, req.user!.id.toString(), {
        qualities,
        fileSize: file.size
      });
      
      const hlsDir = await hlsService.generateHLS(fileId, file.storage_path, qualities);
      masterPath = path.join(hlsDir, 'master.m3u8');
    }

    if (!fs.existsSync(masterPath)) {
      res.status(404).json({ error: 'HLS playlist not available' });
      return;
    }

    // Set HLS headers
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range'
    });

    // Stream the master playlist
    const stream = fs.createReadStream(masterPath);
    stream.pipe(res);

  } catch (error) {
    LoggerService.error('stream', 'HLS master playlist error', req.user?.id?.toString(), {
      error: (error as Error).message,
      fileId: req.params.fileId || 'unknown'
    });
    res.status(500).json({ error: 'Failed to serve HLS playlist' });
  }
});

/**
 * Get HLS quality playlist or segment
 * GET /stream/:fileId/:quality/playlist.m3u8
 * GET /stream/:fileId/:quality/:segment
 */
router.get('/:fileId/:quality/:segment', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId, quality, segment } = req.params;

    if (!fileId || !quality || !segment) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    // Validate quality
    if (!['360p', '480p', '720p', '1080p'].includes(quality)) {
      res.status(400).json({ error: 'Invalid quality parameter' });
      return;
    }

    // Validate segment
    if (!/^(playlist\.m3u8|seg\d{3}\.ts)$/.test(segment)) {
      res.status(400).json({ error: 'Invalid segment parameter' });
      return;
    }

    // Check file ownership
    const file = await getVideoFile(fileId, req.user!.id);
    if (!file) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    // Get segment path
    const segmentPath = hlsService.getSegmentPath(fileId, quality, segment);
    
    if (!segmentPath || !fs.existsSync(segmentPath)) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    // Set appropriate headers
    if (segment.endsWith('.m3u8')) {
      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
    } else if (segment.endsWith('.ts')) {
      res.set({
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes'
      });
    }

    // Add CORS headers for HLS
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range'
    });

    // Stream the segment
    const stream = fs.createReadStream(segmentPath);
    stream.pipe(res);

  } catch (error) {
    LoggerService.error('stream', 'HLS segment error', req.user?.id?.toString(), {
      error: (error as Error).message,
      fileId: req.params.fileId || 'unknown',
      quality: req.params.quality || 'unknown',
      segment: req.params.segment || 'unknown'
    });
    res.status(500).json({ error: 'Failed to serve HLS segment' });
  }
});
/**
 * Direct video stream with Range support
 * GET /stream/:fileId/direct
 */
router.get('/:fileId/direct', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' });
      return;
    }

    // Check file ownership
    const file = await getVideoFile(fileId, req.user!.id);
    if (!file) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    if (!fs.existsSync(file.storage_path)) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }

    const stat = fs.statSync(file.storage_path);
    const fileSize = stat.size;
    const range = req.get('range');

    // Set basic headers
    res.set({
      'Content-Type': file.mime_type,
      'Accept-Ranges': 'bytes',
      'Content-Length': fileSize.toString(),
      'Cache-Control': 'public, max-age=3600'
    });

    // Handle Range requests for seeking
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const startStr = parts[0];
      const endStr = parts[1];
      
      if (!startStr) {
        res.status(400).json({ error: 'Invalid range header' });
        return;
      }
      
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).set({
          'Content-Range': `bytes */${fileSize}`
        });
        res.send();
        return;
      }

      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunkSize.toString()
      });

      // Stream the requested range
      const stream = fs.createReadStream(file.storage_path, { start, end });
      stream.pipe(res);
    } else {
      // Stream entire file
      const stream = fs.createReadStream(file.storage_path);
      stream.pipe(res);
    }

    LoggerService.info('stream', `Direct stream served for ${fileId}`, req.user!.id.toString(), {
      range: range || 'full',
      fileSize
    });

  } catch (error) {
    LoggerService.error('stream', 'Direct stream error', req.user?.id?.toString(), {
      error: (error as Error).message,
      fileId: req.params.fileId || 'unknown'
    });
    res.status(500).json({ error: 'Failed to serve video stream' });
  }
});

/**
 * Get video information
 * GET /stream/:fileId/info
 */
router.get('/:fileId/info', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' });
      return;
    }

    // Check file ownership
    const file = await getVideoFile(fileId, req.user!.id);
    if (!file) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    // Get media info
    const mediaInfo = await transcoderService.getMediaInfo(file.storage_path);
    
    // Get available qualities
    const qualities = mediaInfo.compatibleProfiles;
    
    // Check for subtitles
    const subtitles = await getAvailableSubtitles(fileId, file.storage_path);

    res.json({
      fileId,
      fileName: file.name,
      duration: mediaInfo.duration,
      width: mediaInfo.width,
      height: mediaInfo.height,
      videoCodec: mediaInfo.videoCodec,
      audioCodec: mediaInfo.audioCodec,
      bitrate: mediaInfo.bitrate,
      needsTranscode: mediaInfo.needsTranscode,
      qualities,
      subtitles,
      hlsAvailable: hlsService.getMasterPlaylistPath(fileId) !== null,
      directStreamUrl: `/api/stream/${fileId}/direct`,
      hlsUrl: `/api/stream/${fileId}/master.m3u8`,
      posterUrl: `/api/files/${fileId}/poster`
    });

  } catch (error) {
    LoggerService.error('stream', 'Video info error', req.user?.id?.toString(), {
      error: (error as Error).message,
      fileId: req.params.fileId || 'unknown'
    });
    res.status(500).json({ error: 'Failed to get video info' });
  }
});

/**
 * Save playback position
 * POST /stream/:fileId/position
 */
router.post('/:fileId/position', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const { seconds, duration } = req.body;

    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' });
      return;
    }

    if (typeof seconds !== 'number' || seconds < 0) {
      res.status(400).json({ error: 'Invalid position' });
      return;
    }

    // Check file ownership
    const file = await getVideoFile(fileId, req.user!.id);
    if (!file) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    // Save position to database
    const database = db();
    const stmt = database.prepare(`
      INSERT OR REPLACE INTO playback_positions 
      (user_id, file_id, position, duration, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(req.user!.id, fileId, seconds, duration || null, Date.now());

    LoggerService.info('stream', `Playback position saved for ${fileId}`, req.user!.id.toString(), {
      position: seconds,
      duration: duration || undefined
    });

    res.json({ success: true });

  } catch (error) {
    LoggerService.error('stream', 'Save position error', req.user?.id?.toString(), {
      error: (error as Error).message,
      fileId: req.params.fileId || 'unknown'
    });
    res.status(500).json({ error: 'Failed to save playback position' });
  }
});

/**
 * Get saved playback position
 * GET /stream/:fileId/position
 */
router.get('/:fileId/position', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' });
      return;
    }

    // Check file ownership
    const file = await getVideoFile(fileId, req.user!.id);
    if (!file) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    // Get saved position
    const database = db();
    const stmt = database.prepare(`
      SELECT position, duration, updated_at 
      FROM playback_positions 
      WHERE user_id = ? AND file_id = ?
    `);
    
    const result = stmt.get(req.user!.id, fileId) as {
      position: number;
      duration?: number;
      updated_at: number;
    } | undefined;

    if (result) {
      res.json({
        fileId,
        position: result.position,
        duration: result.duration,
        updatedAt: new Date(result.updated_at).toISOString()
      });
    } else {
      res.json({
        fileId,
        position: 0,
        duration: null,
        updatedAt: null
      });
    }

  } catch (error) {
    LoggerService.error('stream', 'Get position error', req.user?.id?.toString(), {
      error: (error as Error).message,
      fileId: req.params.fileId || 'unknown'
    });
    res.status(500).json({ error: 'Failed to get playback position' });
  }
});

/**
 * Get recently played videos
 * GET /stream/recent
 */
router.get('/recent', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const database = db();
    const stmt = database.prepare(`
      SELECT f.id, f.name, f.mime_type, f.size, f.created_at,
             p.position, p.duration, p.updated_at as last_played
      FROM playback_positions p
      JOIN files f ON f.id = p.file_id
      WHERE p.user_id = ? AND f.is_deleted = 0 AND f.mime_type LIKE 'video/%'
      ORDER BY p.updated_at DESC
      LIMIT ?
    `);

    const results = stmt.all(req.user!.id, limit) as Array<{
      id: string;
      name: string;
      mime_type: string;
      size: number;
      created_at: number;
      position: number;
      duration?: number;
      last_played: number;
    }>;

    const recentVideos = results.map(row => ({
      fileId: row.id,
      fileName: row.name,
      mimeType: row.mime_type,
      size: row.size,
      createdAt: new Date(row.created_at).toISOString(),
      position: row.position,
      duration: row.duration,
      lastPlayed: new Date(row.last_played).toISOString(),
      progressPercent: row.duration ? Math.round((row.position / row.duration) * 100) : 0,
      thumbnailUrl: `/api/files/${row.id}/thumbnail?size=sm`,
      posterUrl: `/api/files/${row.id}/poster`
    }));

    res.json(recentVideos);

  } catch (error) {
    LoggerService.error('stream', 'Recent videos error', req.user?.id?.toString(), {
      error: (error as Error).message
    });
    res.status(500).json({ error: 'Failed to get recent videos' });
  }
});

/**
 * Get videos with saved positions (continue watching)
 * GET /stream/continue
 */
router.get('/continue', async (req: Request, res: Response): Promise<void> => {
  try {
    const database = db();
    const stmt = database.prepare(`
      SELECT f.id, f.name, f.mime_type, f.size, f.created_at,
             p.position, p.duration, p.updated_at as last_played
      FROM playback_positions p
      JOIN files f ON f.id = p.file_id
      WHERE p.user_id = ? AND f.is_deleted = 0 AND f.mime_type LIKE 'video/%'
        AND p.position > 30 AND p.position < (p.duration * 0.95)
      ORDER BY p.updated_at DESC
      LIMIT 20
    `);

    const results = stmt.all(req.user!.id) as Array<{
      id: string;
      name: string;
      mime_type: string;
      size: number;
      created_at: number;
      position: number;
      duration: number;
      last_played: number;
    }>;

    const continueWatching = results.map(row => ({
      fileId: row.id,
      fileName: row.name,
      mimeType: row.mime_type,
      size: row.size,
      createdAt: new Date(row.created_at).toISOString(),
      position: row.position,
      duration: row.duration,
      lastPlayed: new Date(row.last_played).toISOString(),
      progressPercent: Math.round((row.position / row.duration) * 100),
      thumbnailUrl: `/api/files/${row.id}/thumbnail?size=sm`,
      posterUrl: `/api/files/${row.id}/poster`
    }));

    res.json(continueWatching);

  } catch (error) {
    LoggerService.error('stream', 'Continue watching error', req.user?.id?.toString(), {
      error: (error as Error).message
    });
    res.status(500).json({ error: 'Failed to get continue watching list' });
  }
});

/**
 * Get subtitles for video
 * GET /stream/:fileId/subtitles/:lang
 */
router.get('/:fileId/subtitles/:lang', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId, lang } = req.params;

    if (!fileId || !lang) {
      res.status(400).json({ error: 'File ID and language are required' });
      return;
    }

    // Check file ownership
    const file = await getVideoFile(fileId, req.user!.id);
    if (!file) {
      res.status(404).json({ error: 'Video file not found' });
      return;
    }

    // Find subtitle file
    const subtitlePath = await findSubtitleFile(file.storage_path, lang);
    
    if (!subtitlePath || !fs.existsSync(subtitlePath)) {
      res.status(404).json({ error: 'Subtitles not found' });
      return;
    }

    // Convert SRT to VTT if needed
    if (subtitlePath.endsWith('.srt')) {
      const vttContent = await convertSrtToVtt(subtitlePath);
      res.set('Content-Type', 'text/vtt');
      res.send(vttContent);
    } else {
      res.set('Content-Type', 'text/vtt');
      const stream = fs.createReadStream(subtitlePath);
      stream.pipe(res);
    }

  } catch (error) {
    LoggerService.error('stream', 'Subtitles error', req.user?.id?.toString(), {
      error: (error as Error).message,
      fileId: req.params.fileId || 'unknown',
      lang: req.params.lang || 'unknown'
    });
    res.status(500).json({ error: 'Failed to serve subtitles' });
  }
});

// Helper functions

async function getVideoFile(fileId: string, userId: number) {
  const database = db();
  const stmt = database.prepare(`
    SELECT id, name, storage_path, mime_type, size, owner_id
    FROM files 
    WHERE id = ? AND owner_id = ? AND is_deleted = 0 AND mime_type LIKE 'video/%'
  `);
  
  return stmt.get(fileId, userId) as {
    id: string;
    name: string;
    storage_path: string;
    mime_type: string;
    size: number;
    owner_id: string;
  } | undefined;
}

async function getAvailableSubtitles(_fileId: string, _videoPath: string): Promise<string[]> {
  // Implementation would scan for .srt/.vtt files with same name
  // For now, return empty array
  return [];
}

async function findSubtitleFile(_videoPath: string, _lang: string): Promise<string | null> {
  // Implementation would find subtitle files
  // For now, return null
  return null;
}

async function convertSrtToVtt(_srtPath: string): Promise<string> {
  // Implementation would convert SRT to VTT format
  // For now, return basic VTT header
  return 'WEBVTT\n\n';
}

export default router;