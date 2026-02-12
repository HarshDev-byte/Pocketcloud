const db = require('../../config/database');
const ExifParser = require('exif-parser');
const fs = require('fs-extra');

class PhotoGalleryService {
  constructor() {
    this.imageFormats = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg'];
  }

  /**
   * Check if file is an image
   */
  isImage(filename) {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return this.imageFormats.includes(ext);
  }

  /**
   * Extract EXIF data from image
   */
  async extractExifData(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      const parser = ExifParser.create(buffer);
      const result = parser.parse();

      return {
        make: result.tags.Make,
        model: result.tags.Model,
        dateTime: result.tags.DateTime ? new Date(result.tags.DateTime * 1000) : null,
        orientation: result.tags.Orientation,
        width: result.imageSize?.width,
        height: result.imageSize?.height,
        iso: result.tags.ISO,
        fNumber: result.tags.FNumber,
        exposureTime: result.tags.ExposureTime,
        focalLength: result.tags.FocalLength,
        flash: result.tags.Flash,
        gps: result.tags.GPSLatitude && result.tags.GPSLongitude ? {
          latitude: result.tags.GPSLatitude,
          longitude: result.tags.GPSLongitude,
          altitude: result.tags.GPSAltitude
        } : null
      };
    } catch (error) {
      console.error('Error extracting EXIF data:', error);
      return null;
    }
  }

  /**
   * Save EXIF data to database
   */
  async saveExifData(fileId, exifData) {
    try {
      await db.run(
        `UPDATE files 
         SET exif_data = ?,
             width = ?,
             height = ?
         WHERE id = ?`,
        [
          JSON.stringify(exifData),
          exifData.width,
          exifData.height,
          fileId
        ]
      );
    } catch (error) {
      console.error('Error saving EXIF data:', error);
      throw error;
    }
  }

  /**
   * Create a new album
   */
  async createAlbum(userId, name, description = null) {
    try {
      const result = await db.run(
        'INSERT INTO albums (user_id, name, description) VALUES (?, ?, ?)',
        [userId, name, description]
      );

      return {
        id: result.lastID,
        user_id: userId,
        name,
        description,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error creating album:', error);
      throw error;
    }
  }

  /**
   * Get all albums for a user
   */
  async getUserAlbums(userId) {
    try {
      const albums = await db.all(
        `SELECT a.*, 
                COUNT(ap.id) as photo_count,
                f.filename as cover_filename,
                f.thumbnail_medium as cover_thumbnail
         FROM albums a
         LEFT JOIN album_photos ap ON a.id = ap.album_id
         LEFT JOIN files f ON a.cover_photo_id = f.id
         WHERE a.user_id = ?
         GROUP BY a.id
         ORDER BY a.updated_at DESC`,
        [userId]
      );

      return albums;
    } catch (error) {
      console.error('Error getting user albums:', error);
      throw error;
    }
  }

  /**
   * Get album by ID
   */
  async getAlbumById(albumId, userId) {
    try {
      const album = await db.get(
        `SELECT a.*, COUNT(ap.id) as photo_count
         FROM albums a
         LEFT JOIN album_photos ap ON a.id = ap.album_id
         WHERE a.id = ? AND a.user_id = ?
         GROUP BY a.id`,
        [albumId, userId]
      );

      return album;
    } catch (error) {
      console.error('Error getting album:', error);
      throw error;
    }
  }

  /**
   * Update album
   */
  async updateAlbum(albumId, userId, updates) {
    try {
      const { name, description, cover_photo_id } = updates;
      
      await db.run(
        `UPDATE albums 
         SET name = COALESCE(?, name),
             description = COALESCE(?, description),
             cover_photo_id = COALESCE(?, cover_photo_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [name, description, cover_photo_id, albumId, userId]
      );

      return await this.getAlbumById(albumId, userId);
    } catch (error) {
      console.error('Error updating album:', error);
      throw error;
    }
  }

  /**
   * Delete album
   */
  async deleteAlbum(albumId, userId) {
    try {
      const result = await db.run(
        'DELETE FROM albums WHERE id = ? AND user_id = ?',
        [albumId, userId]
      );

      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting album:', error);
      throw error;
    }
  }

  /**
   * Add photos to album
   */
  async addPhotosToAlbum(albumId, userId, photoIds) {
    try {
      // Verify album ownership
      const album = await this.getAlbumById(albumId, userId);
      if (!album) {
        throw new Error('Album not found or unauthorized');
      }

      // Verify all photos belong to user and are images
      const photos = await db.all(
        `SELECT id, filename FROM files 
         WHERE id IN (${photoIds.map(() => '?').join(',')}) 
         AND user_id = ? 
         AND status = 'active'`,
        [...photoIds, userId]
      );

      if (photos.length !== photoIds.length) {
        throw new Error('Some photos not found or unauthorized');
      }

      // Get current max position
      const maxPos = await db.get(
        'SELECT MAX(position) as max_pos FROM album_photos WHERE album_id = ?',
        [albumId]
      );

      let position = (maxPos?.max_pos || 0) + 1;

      // Add photos to album
      for (const photoId of photoIds) {
        try {
          await db.run(
            'INSERT INTO album_photos (album_id, file_id, position) VALUES (?, ?, ?)',
            [albumId, photoId, position++]
          );
        } catch (err) {
          // Ignore duplicate entries
          if (!err.message.includes('UNIQUE constraint')) {
            throw err;
          }
        }
      }

      // Update album timestamp
      await db.run(
        'UPDATE albums SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [albumId]
      );

      return { added: photos.length };
    } catch (error) {
      console.error('Error adding photos to album:', error);
      throw error;
    }
  }

  /**
   * Remove photo from album
   */
  async removePhotoFromAlbum(albumId, userId, photoId) {
    try {
      // Verify album ownership
      const album = await this.getAlbumById(albumId, userId);
      if (!album) {
        throw new Error('Album not found or unauthorized');
      }

      const result = await db.run(
        'DELETE FROM album_photos WHERE album_id = ? AND file_id = ?',
        [albumId, photoId]
      );

      // Update album timestamp
      await db.run(
        'UPDATE albums SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [albumId]
      );

      return result.changes > 0;
    } catch (error) {
      console.error('Error removing photo from album:', error);
      throw error;
    }
  }

  /**
   * Get photos in album
   */
  async getAlbumPhotos(albumId, userId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      // Verify album ownership
      const album = await this.getAlbumById(albumId, userId);
      if (!album) {
        throw new Error('Album not found or unauthorized');
      }

      const photos = await db.all(
        `SELECT f.*, ap.position, ap.added_at
         FROM files f
         INNER JOIN album_photos ap ON f.id = ap.file_id
         WHERE ap.album_id = ? AND f.status = 'active'
         ORDER BY ap.position ASC
         LIMIT ? OFFSET ?`,
        [albumId, limit, offset]
      );

      return photos;
    } catch (error) {
      console.error('Error getting album photos:', error);
      throw error;
    }
  }

  /**
   * Reorder photos in album
   */
  async reorderAlbumPhotos(albumId, userId, photoOrder) {
    try {
      // Verify album ownership
      const album = await this.getAlbumById(albumId, userId);
      if (!album) {
        throw new Error('Album not found or unauthorized');
      }

      // Update positions
      for (let i = 0; i < photoOrder.length; i++) {
        await db.run(
          'UPDATE album_photos SET position = ? WHERE album_id = ? AND file_id = ?',
          [i + 1, albumId, photoOrder[i]]
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error reordering album photos:', error);
      throw error;
    }
  }

  /**
   * Get photos by date range
   */
  async getPhotosByDateRange(userId, startDate, endDate) {
    try {
      const photos = await db.all(
        `SELECT * FROM files 
         WHERE user_id = ? 
         AND status = 'active'
         AND uploaded_at BETWEEN ? AND ?
         ORDER BY uploaded_at DESC`,
        [userId, startDate, endDate]
      );

      return photos.filter(f => this.isImage(f.filename));
    } catch (error) {
      console.error('Error getting photos by date:', error);
      throw error;
    }
  }

  /**
   * Get photos with GPS data
   */
  async getPhotosWithLocation(userId) {
    try {
      const photos = await db.all(
        `SELECT * FROM files 
         WHERE user_id = ? 
         AND status = 'active'
         AND exif_data IS NOT NULL`,
        [userId]
      );

      return photos.filter(photo => {
        if (!this.isImage(photo.filename)) return false;
        try {
          const exif = JSON.parse(photo.exif_data);
          return exif.gps !== null;
        } catch {
          return false;
        }
      });
    } catch (error) {
      console.error('Error getting photos with location:', error);
      throw error;
    }
  }
}

module.exports = new PhotoGalleryService();
