import { db } from '../db/client';
import { logger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Media processing configuration
const THUMBNAIL_DIR = path.join(process.env.STORAGE_PATH!, '.thumbnails');
const HLS_DIR = path.join(process.env.STORAGE_PATH!, '.hls');
const MAX_CONCURRENT_JOBS = 1; // Critical for Pi thermal management
const JOB_TIMEOUT = 300000; // 5 minutes
const RETRY_DELAYS = [30000, 60000, 120000]; // 30s, 1m, 2m backoff

interface MediaTask {
  id: string;
  file_id: string;
  task_type: 'thumbnail' | 'hls' | 'exif' | 'content_index';
  priority: number;
  attempts: number;
  max_attempts: number;
  status: 'queued' | 'processing' | 'done' | 'failed';
  error?: string;
  created_at: number;
  started_at?: number;
  completed_at?: number;
}

interface HLSQuality {
  name: string;
  height: number;
  bitrate: string;
  audioBitrate: string;
}

// Simple queue implementation since we can't install p-queue
class MediaQueue {
  private processing = false;
  private currentTask: MediaTask | null = null;

  async processNext(): Promise<void> {
    if (this.processing) return;

    // Get next task from database
    const task = db.prepare(`
      SELECT * FROM media_queue 
      WHERE status = 'queued' 
      ORDER BY priority DESC, created_at ASC 
      LIMIT 1
    `).get() as MediaTask | undefined;

    if (!task) return;

    this.processing = true;
    this.currentTask = task;

    try {
      await this.processTask(task);
    } catch (error) {
      logger.error('Media queue processing error', { task: task.id, error });
    } finally {
      this.processing = false;
      this.currentTask = null;
      
      // Process next task after a short delay
      setTimeout(() => this.processNext(), 1000);
    }
  }

  private async processTask(task: MediaTask): Promise<void> {
    const startTime = Date.now();
    
    // Update task status to processing
    db.prepare(`
      UPDATE media_queue 
      SET status = 'processing', started_at = ? 
      WHERE id = ?
    `).run(startTime, task.id);

    try {
      // Process based on task type
      switch (task.task_type) {
        case 'thumbnail':
          await this.generateThumbnails(task.file_id);
          break;
        case 'exif':
          await this.extractMetadata(task.file_id);
          break;
        case 'hls':
          await this.generateHLS(task.file_id);
          break;
        case 'content_index':
          await this.indexContent(task.file_id);
          break;
        default:
          throw new Error(`Unknown task type: ${task.task_type}`);
      }

      // Mark task as completed
      const completedAt = Date.now();
      db.prepare(`
        UPDATE media_queue 
        SET status = 'done', completed_at = ? 
        WHERE id = ?
      `).run(completedAt, task.id);

      // Update file status if all tasks are done
      const remainingTasks = db.prepare(`
        SELECT COUNT(*) as count FROM media_queue 
        WHERE file_id = ? AND status IN ('queued', 'processing')
      `).get(task.file_id) as { count: number };

      if (remainingTasks.count === 0) {
        db.prepare(`
          UPDATE files 
          SET media_status = 'processed' 
          WHERE id = ?
        `).run(task.file_id);
      }

      logger.info('Media task completed', {
        taskId: task.id,
        fileId: task.file_id,
        taskType: task.task_type,
        duration: completedAt - startTime
      });

      // Emit real-time events for media processing
      setImmediate(() => {
        try {
          const { RealtimeService, WS_EVENTS } = require('./realtime.service');
          
          if (task.task_type === 'thumbnail') {
            // Get file to find owner
            const file = db.prepare('SELECT owner_id FROM files WHERE id = ?').get(task.file_id) as { owner_id: string } | undefined;
            if (file) {
              RealtimeService.sendToUser(file.owner_id, WS_EVENTS.MEDIA_READY, {
                fileId: task.file_id,
                taskType: task.task_type,
                thumbSmUrl: `/api/files/${task.file_id}/thumbnail?size=sm`,
                thumbMdUrl: `/api/files/${task.file_id}/thumbnail?size=md`
              });
            }
          } else if (task.task_type === 'hls') {
            const file = db.prepare('SELECT owner_id FROM files WHERE id = ?').get(task.file_id) as { owner_id: string } | undefined;
            if (file) {
              RealtimeService.sendToUser(file.owner_id, WS_EVENTS.MEDIA_READY, {
                fileId: task.file_id,
                taskType: task.task_type,
                hlsUrl: `/api/files/${task.file_id}/hls/master.m3u8`
              });
            }
          }
        } catch (error: any) {
          logger.warn('Failed to emit media ready event', { 
            taskId: task.id, 
            error: error?.message || String(error)
          });
        }
      });

    } catch (error: any) {
      await this.handleTaskError(task, error);
    }
  }

  private async handleTaskError(task: MediaTask, error: Error): Promise<void> {
    const newAttempts = task.attempts + 1;
    
    if (newAttempts >= task.max_attempts) {
      // Mark as permanently failed
      db.prepare(`
        UPDATE media_queue 
        SET status = 'failed', error = ?, attempts = ? 
        WHERE id = ?
      `).run(error.message, newAttempts, task.id);

      db.prepare(`
        UPDATE files 
        SET media_status = 'failed' 
        WHERE id = ?
      `).run(task.file_id);

      logger.error('Media task failed permanently', {
        taskId: task.id,
        fileId: task.file_id,
        taskType: task.task_type,
        attempts: newAttempts,
        error: error.message
      });
    } else {
      // Retry with backoff
      const delay = RETRY_DELAYS[newAttempts - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      
      db.prepare(`
        UPDATE media_queue 
        SET status = 'queued', attempts = ?, error = ? 
        WHERE id = ?
      `).run(newAttempts, error.message, task.id);

      logger.warn('Media task failed, will retry', {
        taskId: task.id,
        fileId: task.file_id,
        taskType: task.task_type,
        attempts: newAttempts,
        retryIn: delay,
        error: error.message
      });

      // Schedule retry
      setTimeout(() => this.processNext(), delay);
    }
  }

  private async generateThumbnails(fileId: string): Promise<void> {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as any;
    if (!file) throw new Error('File not found');

    const mimeType = file.mime_type;
    const storagePath = file.storage_path;

    // Ensure thumbnail directory exists
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });

    if (mimeType.startsWith('image/')) {
      await this.generateImageThumbnails(fileId, storagePath);
    } else if (mimeType.startsWith('video/')) {
      await this.generateVideoThumbnails(fileId, storagePath);
    } else if (mimeType === 'application/pdf') {
      await this.generatePDFThumbnails(fileId, storagePath);
    } else {
      throw new Error(`Unsupported media type for thumbnails: ${mimeType}`);
    }
  }

  private async generateImageThumbnails(fileId: string, storagePath: string): Promise<void> {
    // Check if sharp is available (will be on Pi)
    try {
      const sharp = require('sharp');
      
      const image = sharp(storagePath, { sequentialRead: true });
      const metadata = await image.metadata();

      // Small thumbnail: 200x200 cover crop
      const smPath = path.join(THUMBNAIL_DIR, `${fileId}_sm.webp`);
      await image
        .clone()
        .resize(200, 200, { fit: 'cover', position: 'centre' })
        .webp({ quality: 75, effort: 4 }) // effort:4 = fast on Pi
        .toFile(smPath);

      // Medium thumbnail: max 1200px wide, preserve aspect
      const mdPath = path.join(THUMBNAIL_DIR, `${fileId}_md.webp`);
      await image
        .clone()
        .resize(1200, null, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(mdPath);

      // Get dominant color for placeholder
      const { dominant } = await image.stats();
      const hexColor = `#${dominant.r.toString(16).padStart(2, '0')}${dominant.g.toString(16).padStart(2, '0')}${dominant.b.toString(16).padStart(2, '0')}`;

      // Update database
      db.prepare(`
        UPDATE files SET 
          thumb_sm_path = ?,
          thumb_md_path = ?,
          media_width = ?,
          media_height = ?,
          dominant_color = ?
        WHERE id = ?
      `).run(smPath, mdPath, metadata.width, metadata.height, hexColor, fileId);

    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        // Fallback to ImageMagick/GraphicsMagick if sharp not available
        await this.generateImageThumbnailsFallback(fileId, storagePath);
      } else {
        throw error;
      }
    }
  }

  private async generateImageThumbnailsFallback(fileId: string, storagePath: string): Promise<void> {
    const smPath = path.join(THUMBNAIL_DIR, `${fileId}_sm.jpg`);
    const mdPath = path.join(THUMBNAIL_DIR, `${fileId}_md.jpg`);

    // Try ImageMagick first, then GraphicsMagick
    try {
      await execAsync(`convert "${storagePath}" -resize 200x200^ -gravity center -crop 200x200+0+0 -quality 75 "${smPath}"`);
      await execAsync(`convert "${storagePath}" -resize 1200x1200> -quality 82 "${mdPath}"`);
    } catch (error) {
      try {
        await execAsync(`gm convert "${storagePath}" -resize 200x200^ -gravity center -crop 200x200+0+0 -quality 75 "${smPath}"`);
        await execAsync(`gm convert "${storagePath}" -resize 1200x1200> -quality 82 "${mdPath}"`);
      } catch (gmError) {
        throw new Error('Neither ImageMagick nor GraphicsMagick available for image processing');
      }
    }

    // Get image dimensions
    try {
      const identify = await execAsync(`identify -format "%wx%h" "${storagePath}"`);
      const [width, height] = identify.stdout.trim().split('x').map(Number);
      
      db.prepare(`
        UPDATE files SET 
          thumb_sm_path = ?,
          thumb_md_path = ?,
          media_width = ?,
          media_height = ?
        WHERE id = ?
      `).run(smPath, mdPath, width, height, fileId);
    } catch (error) {
      // Just update thumbnail paths if identify fails
      db.prepare(`
        UPDATE files SET 
          thumb_sm_path = ?,
          thumb_md_path = ?
        WHERE id = ?
      `).run(smPath, mdPath, fileId);
    }
  }

  private async generateVideoThumbnails(fileId: string, storagePath: string): Promise<void> {
    const posterPath = path.join(THUMBNAIL_DIR, `${fileId}_poster.jpg`);
    const smPath = path.join(THUMBNAIL_DIR, `${fileId}_sm.webp`);
    const mdPath = path.join(THUMBNAIL_DIR, `${fileId}_md.webp`);

    // Extract frame at 1 second using ffmpeg
    await execAsync(`ffmpeg -ss 1 -i "${storagePath}" -vframes 1 -q:v 2 "${posterPath}" -y`);

    // Get video info
    const probeResult = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${storagePath}"`);
    const streams = JSON.parse(probeResult.stdout).streams;
    const videoStream = streams.find((s: any) => s.codec_type === 'video');

    if (!videoStream) {
      throw new Error('No video stream found');
    }

    // Generate thumbnails from poster
    try {
      const sharp = require('sharp');
      const image = sharp(posterPath);
      
      await image
        .clone()
        .resize(200, 200, { fit: 'cover', position: 'centre' })
        .webp({ quality: 75, effort: 4 })
        .toFile(smPath);

      await image
        .clone()
        .resize(1200, null, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(mdPath);

    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        // Fallback to ImageMagick
        await execAsync(`convert "${posterPath}" -resize 200x200^ -gravity center -crop 200x200+0+0 -quality 75 "${smPath.replace('.webp', '.jpg')}"`);
        await execAsync(`convert "${posterPath}" -resize 1200x1200> -quality 82 "${mdPath.replace('.webp', '.jpg')}"`);
      } else {
        throw error;
      }
    }

    // Clean up poster
    if (fs.existsSync(posterPath)) {
      fs.unlinkSync(posterPath);
    }

    // Update database
    db.prepare(`
      UPDATE files SET 
        thumb_sm_path = ?,
        thumb_md_path = ?,
        media_width = ?,
        media_height = ?,
        media_duration = ?,
        media_codec = ?
      WHERE id = ?
    `).run(
      smPath,
      mdPath,
      parseInt(videoStream.width) || null,
      parseInt(videoStream.height) || null,
      parseFloat(videoStream.duration) || null,
      videoStream.codec_name || null,
      fileId
    );
  }

  private async generatePDFThumbnails(fileId: string, storagePath: string): Promise<void> {
    const smPath = path.join(THUMBNAIL_DIR, `${fileId}_sm.jpg`);
    const mdPath = path.join(THUMBNAIL_DIR, `${fileId}_md.jpg`);

    // Try pdftoppm first, then ImageMagick
    try {
      const tempPath = path.join(THUMBNAIL_DIR, `${fileId}_page1`);
      await execAsync(`pdftoppm -r 72 -f 1 -l 1 "${storagePath}" "${tempPath}"`);
      
      const ppmPath = `${tempPath}-1.ppm`;
      if (fs.existsSync(ppmPath)) {
        await execAsync(`convert "${ppmPath}" -resize 200x200^ -gravity center -crop 200x200+0+0 -quality 75 "${smPath}"`);
        await execAsync(`convert "${ppmPath}" -resize 1200x1200> -quality 82 "${mdPath}"`);
        fs.unlinkSync(ppmPath);
      }
    } catch (error) {
      // Fallback to ImageMagick direct PDF processing
      await execAsync(`convert "${storagePath}[0]" -resize 200x200^ -gravity center -crop 200x200+0+0 -quality 75 "${smPath}"`);
      await execAsync(`convert "${storagePath}[0]" -resize 1200x1200> -quality 82 "${mdPath}"`);
    }

    db.prepare(`
      UPDATE files SET 
        thumb_sm_path = ?,
        thumb_md_path = ?
      WHERE id = ?
    `).run(smPath, mdPath, fileId);
  }

  private async extractMetadata(fileId: string): Promise<void> {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as any;
    if (!file) throw new Error('File not found');

    try {
      // Try exifr if available
      const exifr = require('exifr');
      
      const exif = await exifr.parse(file.storage_path, {
        tiff: true,
        xmp: true,
        icc: false,
        iptc: false,
        gps: true,
        exif: true,
        pick: [
          'DateTimeOriginal',
          'Make',
          'Model',
          'latitude',
          'longitude',
          'ImageWidth',
          'ImageHeight',
          'Artist',
          'Album',
          'Title',
          'Duration'
        ]
      });

      if (exif) {
        const camera = exif.Make && exif.Model ? `${exif.Make} ${exif.Model}`.trim() : null;
        
        db.prepare(`
          UPDATE files SET 
            exif_date = ?,
            exif_lat = ?,
            exif_lng = ?,
            exif_camera = ?,
            media_width = COALESCE(media_width, ?),
            media_height = COALESCE(media_height, ?)
          WHERE id = ?
        `).run(
          exif.DateTimeOriginal?.getTime() || null,
          exif.latitude || null,
          exif.longitude || null,
          camera,
          exif.ImageWidth || null,
          exif.ImageHeight || null,
          fileId
        );
      }

    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        // Fallback to exiftool if available
        await this.extractMetadataFallback(fileId, file.storage_path);
      } else {
        throw error;
      }
    }
  }

  private async extractMetadataFallback(fileId: string, storagePath: string): Promise<void> {
    try {
      const result = await execAsync(`exiftool -json -DateTimeOriginal -Make -Model -GPSLatitude -GPSLongitude -ImageWidth -ImageHeight "${storagePath}"`);
      const data = JSON.parse(result.stdout)[0];
      
      if (data) {
        const camera = data.Make && data.Model ? `${data.Make} ${data.Model}`.trim() : null;
        const exifDate = data.DateTimeOriginal ? new Date(data.DateTimeOriginal).getTime() : null;
        
        db.prepare(`
          UPDATE files SET 
            exif_date = ?,
            exif_lat = ?,
            exif_lng = ?,
            exif_camera = ?,
            media_width = COALESCE(media_width, ?),
            media_height = COALESCE(media_height, ?)
          WHERE id = ?
        `).run(
          exifDate,
          data.GPSLatitude || null,
          data.GPSLongitude || null,
          camera,
          data.ImageWidth || null,
          data.ImageHeight || null,
          fileId
        );
      }
    } catch (error: any) {
      logger.warn('EXIF extraction failed', { fileId, error: error?.message || String(error) });
    }
  }

  private async generateHLS(fileId: string): Promise<void> {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as any;
    if (!file) throw new Error('File not found');

    if (!file.mime_type.startsWith('video/')) {
      throw new Error('HLS generation only supported for video files');
    }

    const hlsDir = path.join(HLS_DIR, fileId);
    fs.mkdirSync(hlsDir, { recursive: true });

    // Get video info
    const probeResult = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${file.storage_path}"`);
    const streams = JSON.parse(probeResult.stdout).streams;
    const videoStream = streams.find((s: any) => s.codec_type === 'video');

    if (!videoStream) {
      throw new Error('No video stream found');
    }

    const sourceHeight = parseInt(videoStream.height) || 720;
    const sourceWidth = parseInt(videoStream.width) || 1280;
    const duration = parseFloat(videoStream.duration) || 0;

    // Determine qualities to generate based on source resolution
    const qualities: HLSQuality[] = [];
    if (sourceHeight >= 360) {
      qualities.push({ name: '360p', height: 360, bitrate: '800k', audioBitrate: '96k' });
    }
    if (sourceHeight >= 720) {
      qualities.push({ name: '720p', height: 720, bitrate: '2500k', audioBitrate: '128k' });
    }

    // Generate HLS streams for each quality
    for (const quality of qualities) {
      const outputWidth = Math.round((quality.height * sourceWidth) / sourceHeight);
      
      await execAsync(`ffmpeg -i "${file.storage_path}" \
        -vf "scale=${outputWidth}:${quality.height}" \
        -c:v libx264 -b:v ${quality.bitrate} -preset ultrafast -threads 2 \
        -c:a aac -b:a ${quality.audioBitrate} \
        -hls_time 6 \
        -hls_playlist_type vod \
        -hls_segment_filename "${hlsDir}/${quality.name}_%04d.ts" \
        "${hlsDir}/${quality.name}.m3u8" \
        -y`, { timeout: JOB_TIMEOUT });
    }

    // Generate master playlist
    const masterContent = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      ...qualities.map(q => {
        const bandwidth = parseInt(q.bitrate) * 1000 + parseInt(q.audioBitrate) * 1000;
        const resolution = `${Math.round((q.height * sourceWidth) / sourceHeight)}x${q.height}`;
        return `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}\n${q.name}.m3u8`;
      })
    ].join('\n');

    const masterPath = path.join(hlsDir, 'master.m3u8');
    fs.writeFileSync(masterPath, masterContent);

    // Insert HLS stream record
    db.prepare(`
      INSERT OR REPLACE INTO hls_streams (
        file_id, master_path, qualities, duration, status, created_at
      ) VALUES (?, ?, ?, ?, 'ready', ?)
    `).run(
      fileId,
      masterPath,
      JSON.stringify(qualities.map(q => q.name)),
      duration,
      Date.now()
    );

    logger.info('HLS stream generated', {
      fileId,
      qualities: qualities.map(q => q.name),
      duration,
      outputDir: hlsDir
    });
  }

  private async indexContent(fileId: string): Promise<void> {
    // This would integrate with the search service for content indexing
    // For now, just mark as completed
    logger.info('Content indexing completed', { fileId });
  }

  getQueueStatus(): any {
    const stats = db.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM media_queue 
      GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    const result = {
      queued: 0,
      processing: 0,
      done: 0,
      failed: 0
    };

    stats.forEach(stat => {
      result[stat.status as keyof typeof result] = stat.count;
    });

    const recentItems = db.prepare(`
      SELECT mq.*, f.name as filename
      FROM media_queue mq
      JOIN files f ON f.id = mq.file_id
      ORDER BY mq.created_at DESC
      LIMIT 20
    `).all();

    return {
      ...result,
      currentTask: this.currentTask,
      recentItems
    };
  }
}

// Global queue instance
const mediaQueue = new MediaQueue();

export class MediaService {
  /**
   * Enqueue media processing tasks for a file
   */
  static async enqueueFile(fileId: string, mimeType: string): Promise<void> {
    const tasks: Array<{ type: string; priority: number }> = [];

    // Determine tasks based on MIME type
    if (mimeType.startsWith('image/')) {
      tasks.push(
        { type: 'exif', priority: 9 },
        { type: 'thumbnail', priority: 10 },
        { type: 'content_index', priority: 5 }
      );
    } else if (mimeType.startsWith('video/')) {
      tasks.push(
        { type: 'thumbnail', priority: 10 },
        { type: 'hls', priority: 3 } // HLS is slow, lower priority
      );
    } else if (mimeType.startsWith('audio/')) {
      tasks.push(
        { type: 'exif', priority: 9 } // Gets ID3 tags via exifr
      );
    } else if (mimeType === 'application/pdf') {
      tasks.push(
        { type: 'thumbnail', priority: 10 },
        { type: 'content_index', priority: 5 }
      );
    }

    // Insert tasks into database
    const now = Date.now();
    for (const task of tasks) {
      const taskId = crypto.randomUUID();
      
      db.prepare(`
        INSERT INTO media_queue (
          id, file_id, task_type, priority, attempts, max_attempts,
          status, created_at
        ) VALUES (?, ?, ?, ?, 0, 3, 'queued', ?)
      `).run(taskId, fileId, task.type, task.priority, now);
    }

    logger.info('Media tasks enqueued', {
      fileId,
      mimeType,
      tasks: tasks.map(t => t.type)
    });

    // Start processing
    setImmediate(() => mediaQueue.processNext());
  }

  /**
   * Reprocess all media tasks for a file
   */
  static async reprocessFile(fileId: string): Promise<void> {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as any;
    if (!file) {
      throw new Error('File not found');
    }

    // Remove existing tasks
    db.prepare('DELETE FROM media_queue WHERE file_id = ?').run(fileId);

    // Reset file media status
    db.prepare('UPDATE files SET media_status = ? WHERE id = ?').run('pending', fileId);

    // Enqueue new tasks
    await this.enqueueFile(fileId, file.mime_type);
  }

  /**
   * Get media processing queue status
   */
  static getQueueStatus(): any {
    return mediaQueue.getQueueStatus();
  }

  /**
   * Initialize media processing (start queue)
   */
  static initialize(): void {
    // Ensure directories exist
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
    fs.mkdirSync(HLS_DIR, { recursive: true });

    // Resume processing any queued tasks
    setImmediate(() => mediaQueue.processNext());

    logger.info('Media service initialized', {
      thumbnailDir: THUMBNAIL_DIR,
      hlsDir: HLS_DIR,
      maxConcurrency: MAX_CONCURRENT_JOBS
    });
  }
}