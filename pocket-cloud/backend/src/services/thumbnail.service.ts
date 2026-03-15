import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class ThumbnailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThumbnailError';
  }
}

class ThumbnailService {
  private readonly STORAGE_PATH = process.env.STORAGE_PATH || '/opt/pocketcloud/storage';
  private readonly THUMBNAIL_DIR = path.join(this.STORAGE_PATH, '.thumbnails');
  private readonly THUMBNAIL_SIZE = 300;
  private readonly WEBP_QUALITY = 75;

  constructor() {
    this.ensureThumbnailDir();
  }

  /**
   * Generate thumbnail for file (lazy generation with caching)
   */
  async generateThumbnail(fileId: string, sourcePath: string, mimeType: string): Promise<string | null> {
    try {
      const thumbnailPath = path.join(this.THUMBNAIL_DIR, `${fileId}.webp`);

      // Check if thumbnail already exists
      try {
        await fs.access(thumbnailPath);
        return thumbnailPath; // Return cached thumbnail
      } catch {
        // Thumbnail doesn't exist, generate it
      }

      // Check if source file exists
      try {
        await fs.access(sourcePath);
      } catch {
        throw new ThumbnailError('Source file not found');
      }

      // Generate thumbnail based on mime type
      if (mimeType.startsWith('image/')) {
        return await this.generateImageThumbnail(sourcePath, thumbnailPath);
      } else if (mimeType.startsWith('video/')) {
        return await this.generateVideoThumbnail(sourcePath, thumbnailPath);
      } else if (mimeType === 'application/pdf') {
        return await this.generatePdfThumbnail(sourcePath, thumbnailPath);
      } else {
        // Unsupported file type
        return null;
      }
    } catch (error) {
      if (error instanceof ThumbnailError) {
        throw error;
      }
      throw new ThumbnailError(`Failed to generate thumbnail: ${error.message}`);
    }
  }

  /**
   * Generate thumbnail for image files using sharp
   */
  private async generateImageThumbnail(sourcePath: string, thumbnailPath: string): Promise<string> {
    try {
      // Dynamic import of sharp (ARM64 pre-built binaries)
      const sharp = await import('sharp');
      
      await sharp.default(sourcePath)
        .resize(this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE, {
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: this.WEBP_QUALITY })
        .toFile(thumbnailPath);

      return thumbnailPath;
    } catch (error: any) {
      throw new ThumbnailError(`Failed to generate image thumbnail: ${error.message}`);
    }
  }

  /**
   * Generate thumbnail for video files using ffmpeg
   */
  private async generateVideoThumbnail(sourcePath: string, thumbnailPath: string): Promise<string> {
    try {
      // Extract frame at 1 second using ffmpeg
      const tempImagePath = thumbnailPath.replace('.webp', '.jpg');
      
      await execFileAsync('ffmpeg', [
        '-i', sourcePath,
        '-ss', '00:00:01.000',
        '-vframes', '1',
        '-q:v', '2',
        '-y', // Overwrite output file
        tempImagePath
      ]);

      // Convert to webp using sharp
      const sharp = await import('sharp');
      
      await sharp.default(tempImagePath)
        .resize(this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE, {
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: this.WEBP_QUALITY })
        .toFile(thumbnailPath);

      // Clean up temp file
      await fs.unlink(tempImagePath).catch(() => {});

      return thumbnailPath;
    } catch (error: any) {
      throw new ThumbnailError(`Failed to generate video thumbnail: ${error.message}`);
    }
  }

  /**
   * Generate thumbnail for PDF files using pdftoppm
   */
  private async generatePdfThumbnail(sourcePath: string, thumbnailPath: string): Promise<string> {
    try {
      // Extract first page using pdftoppm
      const tempImagePath = thumbnailPath.replace('.webp', '.ppm');
      
      await execFileAsync('pdftoppm', [
        '-f', '1', // First page
        '-l', '1', // Last page (same as first)
        '-scale-to', this.THUMBNAIL_SIZE.toString(),
        sourcePath,
        tempImagePath.replace('.ppm', '') // pdftoppm adds extension
      ]);

      // Convert to webp using sharp
      const sharp = await import('sharp');
      
      await sharp.default(tempImagePath)
        .resize(this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE, {
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: this.WEBP_QUALITY })
        .toFile(thumbnailPath);

      // Clean up temp file
      await fs.unlink(tempImagePath).catch(() => {});

      return thumbnailPath;
    } catch (error: any) {
      throw new ThumbnailError(`Failed to generate PDF thumbnail: ${error.message}`);
    }
  }

  /**
   * Delete thumbnail for file
   */
  async deleteThumbnail(fileId: string): Promise<void> {
    try {
      const thumbnailPath = path.join(this.THUMBNAIL_DIR, `${fileId}.webp`);
      await fs.unlink(thumbnailPath);
    } catch (error) {
      // Ignore errors if thumbnail doesn't exist
    }
  }

  /**
   * Get thumbnail path if it exists
   */
  async getThumbnailPath(fileId: string): Promise<string | null> {
    try {
      const thumbnailPath = path.join(this.THUMBNAIL_DIR, `${fileId}.webp`);
      await fs.access(thumbnailPath);
      return thumbnailPath;
    } catch {
      return null;
    }
  }

  /**
   * Clean up orphaned thumbnails
   */
  async cleanupOrphanedThumbnails(): Promise<void> {
    try {
      const { getDatabase } = await import('../db/client.js');
      const db = getDatabase();
      
      // Get all thumbnail files
      const thumbnailFiles = await fs.readdir(this.THUMBNAIL_DIR);
      
      for (const filename of thumbnailFiles) {
        if (!filename.endsWith('.webp')) continue;
        
        const fileId = filename.replace('.webp', '');
        
        // Check if file still exists in database
        const file = db.prepare('SELECT id FROM files WHERE id = ? AND is_deleted = 0').get([fileId]);
        
        if (!file) {
          // File doesn't exist, delete thumbnail
          const thumbnailPath = path.join(this.THUMBNAIL_DIR, filename);
          await fs.unlink(thumbnailPath).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Failed to cleanup orphaned thumbnails:', error);
    }
  }

  // Helper methods

  private async ensureThumbnailDir(): Promise<void> {
    try {
      await fs.mkdir(this.THUMBNAIL_DIR, { recursive: true });
    } catch (error: any) {
      throw new ThumbnailError(`Failed to create thumbnail directory: ${error.message}`);
    }
  }
}

export const thumbnailService = new ThumbnailService();