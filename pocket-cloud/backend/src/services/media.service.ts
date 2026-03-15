import ffmpeg from 'fluent-ffmpeg';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { db } from '../db';
import { File } from '../db/types';
import { realtimeService } from './realtime.service';

export interface MediaMetadata {
  width?: number;
  height?: number;
  duration_seconds?: number;
  exif_date?: number;
  gps_lat?: number;
  gps_lng?: number;
  dominant_color?: string;
  bitrate?: number;
  fps?: number;
  codec?: string;
  sample_rate?: number;
  artist?: string;
  album?: string;
  title?: string;
  page_count?: number;
  preview_snippet?: string;
}

export interface ThumbnailPaths {
  thumbnail_sm_path?: string;
  thumbnail_md_path?: string;
  poster_path?: string;
  hls_path?: string;
}

export class MediaService {
  private static readonly THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || join(process.cwd(), 'cache', 'thumbnails');
  private static readonly HLS_DIR = process.env.HLS_DIR || join(process.cwd(), 'cache', 'hls');
  private static readonly POSTER_DIR = process.env.POSTER_DIR || join(process.cwd(), 'cache', 'posters');
  
  // Image formats
  private static readonly IMAGE_FORMATS = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'
  ]);
  
  // Video formats
  private static readonly VIDEO_FORMATS = new Set([
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'
  ]);
  
  // Audio formats
  private static readonly AUDIO_FORMATS = new Set([
    'audio/mpeg', 'audio/flac', 'audio/aac', 'audio/wav', 'audio/ogg'
  ]);

  /**
   * Initialize media processing directories
   */
  public static initializeDirectories(): void {
    [this.THUMBNAIL_DIR, this.HLS_DIR, this.POSTER_DIR].forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Process uploaded file based on its type
   */
  public static async processFile(fileId: string): Promise<void> {
    try {
      // Update processing status
      this.updateProcessingStatus(fileId, 'processing');

      const file = this.getFileById(fileId);
      if (!file) {
        throw new Error('File not found');
      }

      let metadata: MediaMetadata = {};
      let paths: ThumbnailPaths = {};

      if (this.IMAGE_FORMATS.has(file.mime_type)) {
        const result = await this.processImage(file);
        metadata = result.metadata;
        paths = result.paths;
      } else if (this.VIDEO_FORMATS.has(file.mime_type)) {
        const result = await this.processVideo(file);
        metadata = result.metadata;
        paths = result.paths;
      } else if (this.AUDIO_FORMATS.has(file.mime_type)) {
        const result = await this.processAudio(file);
        metadata = result.metadata;
        paths = result.paths;
      } else if (file.mime_type === 'application/pdf') {
        const result = await this.processPDF(file);
        metadata = result.metadata;
        paths = result.paths;
      } else if (file.mime_type.startsWith('text/')) {
        metadata = await this.processText(file);
      }

      // Update database with metadata and paths
      this.updateFileMetadata(fileId, metadata, paths);
      this.updateProcessingStatus(fileId, 'completed');

      // Broadcast media ready event
      const fileRecord = this.getFileById(fileId);
      if (fileRecord) {
        const thumbnailUrl = paths.thumbnail_sm_path ? `/api/files/${fileId}/thumbnail?size=sm` : undefined;
        const posterUrl = paths.poster_path ? `/api/files/${fileId}/poster` : undefined;
        const hlsUrl = paths.hls_path ? `/api/files/${fileId}/hls/master.m3u8` : undefined;
        
        realtimeService.broadcastMediaReady(fileId, fileRecord.owner_id, thumbnailUrl, posterUrl, hlsUrl);
      }

      console.log(`Media processing completed for file: ${fileId}`);

    } catch (error) {
      console.error(`Media processing failed for file ${fileId}:`, error);
      this.updateProcessingStatus(fileId, 'failed', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Process image files
   */
  private static async processImage(file: File): Promise<{ metadata: MediaMetadata; paths: ThumbnailPaths }> {
    const metadata: MediaMetadata = {};
    const paths: ThumbnailPaths = {};

    try {
      // Dynamic import of sharp for Pi optimization
      const sharp = await import('sharp');
      const image = sharp.default(file.storage_path, { 
        sequentialRead: true,
        limitInputPixels: 268402689 // ~16k x 16k max
      });

      // Get image metadata
      const sharpMetadata = await image.metadata();
      metadata.width = sharpMetadata.width;
      metadata.height = sharpMetadata.height;

      // Extract EXIF data
      if (sharpMetadata.exif) {
        const exifData = this.parseExifData(sharpMetadata.exif);
        metadata.exif_date = exifData.date;
        metadata.gps_lat = exifData.gps_lat;
        metadata.gps_lng = exifData.gps_lng;
      }

      // Generate dominant color
      const stats = await image.stats();
      if (stats.dominant) {
        metadata.dominant_color = `rgb(${stats.dominant.r},${stats.dominant.g},${stats.dominant.b})`;
      }

      // Generate thumbnails
      const thumbnailDir = join(this.THUMBNAIL_DIR, file.id);
      mkdirSync(thumbnailDir, { recursive: true });

      // Small thumbnail (200x200 cover crop)
      const smallPath = join(thumbnailDir, 'sm.webp');
      await image
        .clone()
        .resize(200, 200, { fit: 'cover', position: 'center' })
        .webp({ quality: 75, effort: 4 })
        .toFile(smallPath);
      paths.thumbnail_sm_path = smallPath;

      // Medium thumbnail (1200px wide max)
      const mediumPath = join(thumbnailDir, 'md.webp');
      await image
        .clone()
        .resize(1200, null, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(mediumPath);
      paths.thumbnail_md_path = mediumPath;

    } catch (error) {
      console.error('Image processing error:', error);
      throw error;
    }

    return { metadata, paths };
  }

  /**
   * Process video files
   */
  private static async processVideo(file: File): Promise<{ metadata: MediaMetadata; paths: ThumbnailPaths }> {
    const metadata: MediaMetadata = {};
    const paths: ThumbnailPaths = {};

    return new Promise((resolve, reject) => {
      // Get video metadata
      ffmpeg.ffprobe(file.storage_path, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const videoStream = data.streams.find(s => s.codec_type === 'video');
          const audioStream = data.streams.find(s => s.codec_type === 'audio');

          if (videoStream) {
            metadata.width = videoStream.width;
            metadata.height = videoStream.height;
            metadata.fps = this.parseFrameRate(videoStream.r_frame_rate);
            metadata.codec = videoStream.codec_name;
            metadata.bitrate = parseInt(videoStream.bit_rate || '0');
          }

          if (audioStream) {
            metadata.sample_rate = parseInt(audioStream.sample_rate || '0');
          }

          metadata.duration_seconds = parseFloat(data.format.duration || '0');

          // Generate poster frame and HLS
          this.generatePosterFrame(file, metadata)
            .then(posterPath => {
              paths.poster_path = posterPath;
              return this.generateHLS(file, metadata);
            })
            .then(hlsPath => {
              paths.hls_path = hlsPath;
              resolve({ metadata, paths });
            })
            .catch(reject);

        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Process audio files
   */
  private static async processAudio(file: File): Promise<{ metadata: MediaMetadata; paths: ThumbnailPaths }> {
    const metadata: MediaMetadata = {};
    const paths: ThumbnailPaths = {};

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(file.storage_path, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const audioStream = data.streams.find(s => s.codec_type === 'audio');
          
          if (audioStream) {
            metadata.sample_rate = parseInt(audioStream.sample_rate || '0');
            metadata.bitrate = parseInt(audioStream.bit_rate || '0');
            metadata.codec = audioStream.codec_name;
          }

          metadata.duration_seconds = parseFloat(data.format.duration || '0');

          // Extract metadata tags
          const tags = data.format.tags || {};
          metadata.artist = tags.artist || tags.ARTIST;
          metadata.album = tags.album || tags.ALBUM;
          metadata.title = tags.title || tags.TITLE;

          // Extract cover art if available
          this.extractCoverArt(file)
            .then(coverPath => {
              if (coverPath) {
                paths.thumbnail_sm_path = coverPath;
                paths.thumbnail_md_path = coverPath;
              }
              resolve({ metadata, paths });
            })
            .catch(() => {
              // Cover art extraction failed, continue without it
              resolve({ metadata, paths });
            });

        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Process PDF files
   */
  private static async processPDF(file: File): Promise<{ metadata: MediaMetadata; paths: ThumbnailPaths }> {
    const metadata: MediaMetadata = {};
    const paths: ThumbnailPaths = {};

    try {
      // Get page count using pdfinfo
      const pdfInfo = execSync(`pdfinfo "${file.storage_path}"`, { encoding: 'utf8' });
      const pageMatch = pdfInfo.match(/Pages:\s+(\d+)/);
      if (pageMatch) {
        metadata.page_count = parseInt(pageMatch[1]);
      }

      // Generate first page preview
      const thumbnailDir = join(this.THUMBNAIL_DIR, file.id);
      mkdirSync(thumbnailDir, { recursive: true });

      const previewPath = join(thumbnailDir, 'preview.jpg');
      
      // Use pdftoppm to convert first page to image
      execSync(`pdftoppm -jpeg -f 1 -l 1 -scale-to-x 800 -scale-to-y -1 "${file.storage_path}" "${join(thumbnailDir, 'preview')}"`);
      
      // pdftoppm creates preview-1.jpg, rename it
      const generatedPath = join(thumbnailDir, 'preview-1.jpg');
      if (existsSync(generatedPath)) {
        execSync(`mv "${generatedPath}" "${previewPath}"`);
        paths.thumbnail_md_path = previewPath;
        
        // Generate small thumbnail from the preview
        const smallPath = join(thumbnailDir, 'sm.webp');
        const sharp = await import('sharp');
        await sharp.default(previewPath, { sequentialRead: true })
          .resize(200, 200, { fit: 'cover', position: 'center' })
          .webp({ quality: 75, effort: 4 })
          .toFile(smallPath);
        paths.thumbnail_sm_path = smallPath;
      }

    } catch (error) {
      console.error('PDF processing error:', error);
      // Don't throw, just continue without preview
    }

    return { metadata, paths };
  }

  /**
   * Process text files
   */
  private static async processText(file: File): Promise<MediaMetadata> {
    const metadata: MediaMetadata = {};

    try {
      // Read first 500 characters as preview
      const content = readFileSync(file.storage_path, 'utf8');
      metadata.preview_snippet = content.substring(0, 500);
    } catch (error) {
      console.error('Text processing error:', error);
    }

    return metadata;
  }

  /**
   * Generate poster frame for video
   */
  private static async generatePosterFrame(file: File, metadata: MediaMetadata): Promise<string> {
    return new Promise((resolve, reject) => {
      const posterDir = join(this.POSTER_DIR, file.id);
      mkdirSync(posterDir, { recursive: true });
      
      const posterPath = join(posterDir, 'poster.jpg');

      ffmpeg(file.storage_path)
        .seekInput(1) // Seek to 1 second
        .frames(1)
        .size('800x?')
        .format('image2')
        .output(posterPath)
        .on('end', () => resolve(posterPath))
        .on('error', reject)
        .run();
    });
  }

  /**
   * Generate HLS segments for adaptive streaming
   */
  private static async generateHLS(file: File, metadata: MediaMetadata): Promise<string> {
    return new Promise((resolve, reject) => {
      const hlsDir = join(this.HLS_DIR, file.id);
      mkdirSync(hlsDir, { recursive: true });

      const masterPlaylist = join(hlsDir, 'master.m3u8');
      const variants: string[] = [];

      // Always generate 360p
      const generate360p = this.generateHLSVariant(file, hlsDir, '360p', 500);
      variants.push('#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360\n360p/playlist.m3u8');

      // Generate 720p if source is >= 720p
      let generate720p = Promise.resolve();
      if (metadata.height && metadata.height >= 720) {
        generate720p = this.generateHLSVariant(file, hlsDir, '720p', 2000);
        variants.push('#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720\n720p/playlist.m3u8');
      }

      Promise.all([generate360p, generate720p])
        .then(() => {
          // Create master playlist
          const masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n' + variants.join('\n');
          writeFileSync(masterPlaylist, masterContent);
          resolve(hlsDir);
        })
        .catch(reject);
    });
  }

  /**
   * Generate HLS variant
   */
  private static generateHLSVariant(file: File, hlsDir: string, quality: string, bitrate: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const variantDir = join(hlsDir, quality);
      mkdirSync(variantDir, { recursive: true });

      const playlistPath = join(variantDir, 'playlist.m3u8');
      const segmentPattern = join(variantDir, 'segment_%03d.ts');

      let ffmpegCommand = ffmpeg(file.storage_path)
        .format('hls')
        .addOptions([
          '-preset ultrafast',
          '-threads 2',
          '-hls_time 4',
          '-hls_playlist_type vod',
          '-hls_segment_filename', segmentPattern
        ])
        .output(playlistPath);

      // Set resolution and bitrate based on quality
      if (quality === '360p') {
        ffmpegCommand = ffmpegCommand
          .size('640x360')
          .videoBitrate(`${bitrate}k`);
      } else if (quality === '720p') {
        ffmpegCommand = ffmpegCommand
          .size('1280x720')
          .videoBitrate(`${bitrate}k`);
      }

      ffmpegCommand
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
  }

  /**
   * Extract cover art from audio file
   */
  private static async extractCoverArt(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const thumbnailDir = join(this.THUMBNAIL_DIR, file.id);
      mkdirSync(thumbnailDir, { recursive: true });
      
      const coverPath = join(thumbnailDir, 'cover.jpg');

      ffmpeg(file.storage_path)
        .output(coverPath)
        .addOptions(['-an', '-vcodec copy'])
        .on('end', () => resolve(coverPath))
        .on('error', () => resolve(null))
        .run();
    });
  }

  /**
   * Parse EXIF data from buffer
   */
  private static parseExifData(exifBuffer: Buffer): { date?: number; gps_lat?: number; gps_lng?: number } {
    // This is a simplified EXIF parser
    // In production, you might want to use a library like 'exif-parser'
    const result: { date?: number; gps_lat?: number; gps_lng?: number } = {};
    
    try {
      // Basic EXIF parsing would go here
      // For now, return empty object
    } catch (error) {
      console.error('EXIF parsing error:', error);
    }

    return result;
  }

  /**
   * Parse frame rate string
   */
  private static parseFrameRate(frameRate?: string): number | undefined {
    if (!frameRate) return undefined;
    
    const parts = frameRate.split('/');
    if (parts.length === 2) {
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    
    return parseFloat(frameRate);
  }

  /**
   * Get file by ID
   */
  private static getFileById(fileId: string): File | null {
    try {
      const stmt = db.prepare('SELECT * FROM files WHERE id = ?');
      return stmt.get(fileId) as File || null;
    } catch (error) {
      console.error('Error getting file:', error);
      return null;
    }
  }

  /**
   * Update file metadata in database
   */
  private static updateFileMetadata(fileId: string, metadata: MediaMetadata, paths: ThumbnailPaths): void {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];

      // Add metadata fields
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined) {
          updateFields.push(`${key} = ?`);
          values.push(value);
        }
      });

      // Add path fields
      Object.entries(paths).forEach(([key, value]) => {
        if (value !== undefined) {
          updateFields.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (updateFields.length > 0) {
        values.push(Date.now()); // updated_at
        values.push(fileId);

        const sql = `UPDATE files SET ${updateFields.join(', ')}, updated_at = ? WHERE id = ?`;
        const stmt = db.prepare(sql);
        stmt.run(...values);
      }
    } catch (error) {
      console.error('Error updating file metadata:', error);
    }
  }

  /**
   * Update processing status
   */
  private static updateProcessingStatus(fileId: string, status: string, error?: string): void {
    try {
      const stmt = db.prepare(`
        UPDATE files 
        SET processing_status = ?, processing_error = ?, updated_at = ? 
        WHERE id = ?
      `);
      stmt.run(status, error || null, Date.now(), fileId);
    } catch (error) {
      console.error('Error updating processing status:', error);
    }
  }

  /**
   * Get media info for a file
   */
  public static getMediaInfo(fileId: string): any {
    try {
      const stmt = db.prepare(`
        SELECT width, height, duration_seconds, exif_date, gps_lat, gps_lng, 
               dominant_color, bitrate, fps, codec, sample_rate, artist, album, 
               title, page_count, preview_snippet, processing_status, processing_error
        FROM files WHERE id = ?
      `);
      return stmt.get(fileId);
    } catch (error) {
      console.error('Error getting media info:', error);
      return null;
    }
  }

  /**
   * Check if file has thumbnails
   */
  public static hasThumbnails(fileId: string): boolean {
    try {
      const stmt = db.prepare('SELECT thumbnail_sm_path FROM files WHERE id = ?');
      const result = stmt.get(fileId) as { thumbnail_sm_path?: string };
      return !!(result?.thumbnail_sm_path && existsSync(result.thumbnail_sm_path));
    } catch (error) {
      return false;
    }
  }

  /**
   * Get thumbnail path
   */
  public static getThumbnailPath(fileId: string, size: 'sm' | 'md'): string | null {
    try {
      const column = size === 'sm' ? 'thumbnail_sm_path' : 'thumbnail_md_path';
      const stmt = db.prepare(`SELECT ${column} FROM files WHERE id = ?`);
      const result = stmt.get(fileId) as any;
      return result?.[column] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get poster path for video
   */
  public static getPosterPath(fileId: string): string | null {
    try {
      const stmt = db.prepare('SELECT poster_path FROM files WHERE id = ?');
      const result = stmt.get(fileId) as { poster_path?: string };
      return result?.poster_path || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get HLS path for video
   */
  public static getHLSPath(fileId: string): string | null {
    try {
      const stmt = db.prepare('SELECT hls_path FROM files WHERE id = ?');
      const result = stmt.get(fileId) as { hls_path?: string };
      return result?.hls_path || null;
    } catch (error) {
      return null;
    }
  }
}