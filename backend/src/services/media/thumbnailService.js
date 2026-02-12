/**
 * Thumbnail Generation Service
 * Generate thumbnails for images and videos
 */

const { getDatabase, saveDatabase } = require('../../config/database');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class ThumbnailService {
  constructor() {
    this.THUMBNAIL_DIR = path.join(__dirname, '../storage/thumbnails');
    this.THUMBNAIL_SIZES = {
      small: { width: 150, height: 150 },
      medium: { width: 300, height: 300 },
      large: { width: 600, height: 600 }
    };
  }
  
  /**
   * Initialize thumbnail directory
   */
  async init() {
    try {
      await fs.mkdir(this.THUMBNAIL_DIR, { recursive: true });
      console.log('✓ Thumbnail directory initialized');
    } catch (error) {
      console.error('Thumbnail directory init error:', error);
    }
  }
  
  /**
   * Generate thumbnail for file
   */
  async generateThumbnail(fileId, userId, size = 'medium') {
    try {
      const db = getDatabase();
      
      // Get file details
      const stmt = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?');
      stmt.bind([fileId, userId]);
      
      if (!stmt.step()) {
        stmt.free();
        return { success: false, error: 'File not found' };
      }
      
      const file = stmt.getAsObject();
      stmt.free();
      
      // Check if file type supports thumbnails
      if (!this.supportsThumbnail(file.mimetype)) {
        return { success: false, error: 'File type not supported for thumbnails' };
      }
      
      // Generate thumbnail based on type
      let thumbnailPath;
      if (file.mimetype.startsWith('image/')) {
        thumbnailPath = await this.generateImageThumbnail(file, size);
      } else if (file.mimetype.startsWith('video/')) {
        thumbnailPath = await this.generateVideoThumbnail(file, size);
      }
      
      if (!thumbnailPath) {
        return { success: false, error: 'Failed to generate thumbnail' };
      }
      
      // Save thumbnail path to database
      const updateStmt = db.prepare(`
        UPDATE files 
        SET thumbnail_${size} = ?
        WHERE id = ?
      `);
      updateStmt.bind([thumbnailPath, fileId]);
      updateStmt.step();
      updateStmt.free();
      
      saveDatabase();
      
      return { success: true, thumbnailPath };
    } catch (error) {
      console.error('Generate thumbnail error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Generate image thumbnail using sharp (if available) or ImageMagick
   */
  async generateImageThumbnail(file, size) {
    try {
      const dimensions = this.THUMBNAIL_SIZES[size];
      const thumbnailFilename = `${file.id}_${size}.jpg`;
      const thumbnailPath = path.join(this.THUMBNAIL_DIR, thumbnailFilename);
      
      // Try using sharp first (faster, better quality)
      try {
        const sharp = require('sharp');
        await sharp(file.filepath)
          .resize(dimensions.width, dimensions.height, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 80 })
          .toFile(thumbnailPath);
        
        return thumbnailPath;
      } catch (sharpError) {
        // Fallback to ImageMagick
        console.log('Sharp not available, using ImageMagick');
        
        const cmd = `convert "${file.filepath}" -thumbnail ${dimensions.width}x${dimensions.height}^ -gravity center -extent ${dimensions.width}x${dimensions.height} "${thumbnailPath}"`;
        await execAsync(cmd);
        
        return thumbnailPath;
      }
    } catch (error) {
      console.error('Image thumbnail error:', error);
      return null;
    }
  }
  
  /**
   * Generate video thumbnail using ffmpeg
   */
  async generateVideoThumbnail(file, size) {
    try {
      const dimensions = this.THUMBNAIL_SIZES[size];
      const thumbnailFilename = `${file.id}_${size}.jpg`;
      const thumbnailPath = path.join(this.THUMBNAIL_DIR, thumbnailFilename);
      
      // Extract frame at 1 second
      const cmd = `ffmpeg -i "${file.filepath}" -ss 00:00:01 -vframes 1 -vf scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=increase,crop=${dimensions.width}:${dimensions.height} "${thumbnailPath}"`;
      
      await execAsync(cmd);
      
      return thumbnailPath;
    } catch (error) {
      console.error('Video thumbnail error:', error);
      return null;
    }
  }
  
  /**
   * Check if file type supports thumbnails
   */
  supportsThumbnail(mimetype) {
    if (!mimetype) return false;
    
    const supported = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm'
    ];
    
    return supported.some(type => mimetype.startsWith(type.split('/')[0]));
  }
  
  /**
   * Generate thumbnails for all sizes
   */
  async generateAllSizes(fileId, userId) {
    const results = {};
    
    for (const size of Object.keys(this.THUMBNAIL_SIZES)) {
      const result = await this.generateThumbnail(fileId, userId, size);
      results[size] = result;
    }
    
    return { success: true, results };
  }
  
  /**
   * Get thumbnail path
   */
  getThumbnail(fileId, userId, size = 'medium') {
    try {
      const db = getDatabase();
      
      const stmt = db.prepare(`
        SELECT thumbnail_${size} as thumbnail 
        FROM files 
        WHERE id = ? AND user_id = ?
      `);
      stmt.bind([fileId, userId]);
      
      if (!stmt.step()) {
        stmt.free();
        return { success: false, error: 'File not found' };
      }
      
      const result = stmt.getAsObject();
      stmt.free();
      
      return { success: true, thumbnail: result.thumbnail };
    } catch (error) {
      console.error('Get thumbnail error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Delete thumbnails for file
   */
  async deleteThumbnails(fileId) {
    try {
      for (const size of Object.keys(this.THUMBNAIL_SIZES)) {
        const thumbnailPath = path.join(this.THUMBNAIL_DIR, `${fileId}_${size}.jpg`);
        try {
          await fs.unlink(thumbnailPath);
        } catch (err) {
          // Thumbnail might not exist, ignore error
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('Delete thumbnails error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Batch generate thumbnails for multiple files
   */
  async batchGenerate(fileIds, userId, size = 'medium') {
    const results = [];
    
    for (const fileId of fileIds) {
      const result = await this.generateThumbnail(fileId, userId, size);
      results.push({ fileId, ...result });
    }
    
    return { success: true, results };
  }
  
  /**
   * Auto-generate thumbnails for new uploads
   */
  async autoGenerate(fileId, userId) {
    try {
      const db = getDatabase();
      
      // Check if file supports thumbnails
      const stmt = db.prepare('SELECT mimetype FROM files WHERE id = ? AND user_id = ?');
      stmt.bind([fileId, userId]);
      
      if (!stmt.step()) {
        stmt.free();
        return { success: false, error: 'File not found' };
      }
      
      const file = stmt.getAsObject();
      stmt.free();
      
      if (!this.supportsThumbnail(file.mimetype)) {
        return { success: false, error: 'File type not supported' };
      }
      
      // Generate medium thumbnail by default
      return await this.generateThumbnail(fileId, userId, 'medium');
    } catch (error) {
      console.error('Auto-generate error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ThumbnailService();
