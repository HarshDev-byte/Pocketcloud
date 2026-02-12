const fs = require('fs-extra');
const path = require('path');
const mm = require('music-metadata');
const db = require('../../config/database');

class MusicPlayerService {
  constructor() {
    this.audioFormats = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma', '.opus'];
  }

  /**
   * Check if file is audio
   */
  isAudio(filename) {
    const ext = path.extname(filename).toLowerCase();
    return this.audioFormats.includes(ext);
  }

  /**
   * Extract audio metadata
   */
  async extractMetadata(filePath) {
    try {
      const metadata = await mm.parseFile(filePath);
      
      return {
        title: metadata.common.title,
        artist: metadata.common.artist,
        album: metadata.common.album,
        year: metadata.common.year,
        genre: metadata.common.genre ? metadata.common.genre.join(', ') : null,
        duration: metadata.format.duration,
        bitrate: metadata.format.bitrate,
        sampleRate: metadata.format.sampleRate,
        codec: metadata.format.codec,
        trackNumber: metadata.common.track?.no,
        albumArtist: metadata.common.albumartist,
        composer: metadata.common.composer,
        comment: metadata.common.comment ? metadata.common.comment.join(', ') : null,
        picture: metadata.common.picture ? metadata.common.picture[0] : null
      };
    } catch (error) {
      console.error('Error extracting audio metadata:', error);
      return null;
    }
  }

  /**
   * Save audio metadata to database
   */
  async saveMetadata(fileId, metadata) {
    try {
      await db.run(
        `UPDATE files 
         SET duration = ?,
             bitrate = ?,
             codec = ?
         WHERE id = ?`,
        [
          Math.round(metadata.duration),
          metadata.bitrate,
          metadata.codec,
          fileId
        ]
      );
    } catch (error) {
      console.error('Error saving audio metadata:', error);
      throw error;
    }
  }

  /**
   * Stream audio file
   */
  async streamAudio(fileId, range, userId) {
    try {
      // Get file info
      const file = await db.getFileById(fileId);
      
      if (!file) {
        throw new Error('File not found');
      }

      // Check ownership
      if (file.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      // Check if file is audio
      if (!this.isAudio(file.filename)) {
        throw new Error('File is not audio');
      }

      const filePath = file.file_path;
      const stat = await fs.stat(filePath);
      const fileSize = stat.size;

      // Parse range header
      let start = 0;
      let end = fileSize - 1;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : end;
      }

      const chunkSize = (end - start) + 1;

      return {
        stream: fs.createReadStream(filePath, { start, end }),
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': this.getContentType(file.filename)
        },
        statusCode: range ? 206 : 200
      };
    } catch (error) {
      console.error('Error streaming audio:', error);
      throw error;
    }
  }

  /**
   * Get content type based on file extension
   */
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.wma': 'audio/x-ms-wma',
      '.opus': 'audio/opus'
    };
    return types[ext] || 'audio/mpeg';
  }

  /**
   * Create a new playlist
   */
  async createPlaylist(userId, name, description = null) {
    try {
      const result = await db.run(
        'INSERT INTO playlists (user_id, name, description) VALUES (?, ?, ?)',
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
      console.error('Error creating playlist:', error);
      throw error;
    }
  }

  /**
   * Get all playlists for a user
   */
  async getUserPlaylists(userId) {
    try {
      const playlists = await db.all(
        `SELECT p.*, 
                COUNT(pt.id) as track_count,
                SUM(f.duration) as total_duration
         FROM playlists p
         LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
         LEFT JOIN files f ON pt.file_id = f.id
         WHERE p.user_id = ?
         GROUP BY p.id
         ORDER BY p.updated_at DESC`,
        [userId]
      );

      return playlists;
    } catch (error) {
      console.error('Error getting user playlists:', error);
      throw error;
    }
  }

  /**
   * Get playlist by ID
   */
  async getPlaylistById(playlistId, userId) {
    try {
      const playlist = await db.get(
        `SELECT p.*, 
                COUNT(pt.id) as track_count,
                SUM(f.duration) as total_duration
         FROM playlists p
         LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
         LEFT JOIN files f ON pt.file_id = f.id
         WHERE p.id = ? AND p.user_id = ?
         GROUP BY p.id`,
        [playlistId, userId]
      );

      return playlist;
    } catch (error) {
      console.error('Error getting playlist:', error);
      throw error;
    }
  }

  /**
   * Update playlist
   */
  async updatePlaylist(playlistId, userId, updates) {
    try {
      const { name, description } = updates;
      
      await db.run(
        `UPDATE playlists 
         SET name = COALESCE(?, name),
             description = COALESCE(?, description),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [name, description, playlistId, userId]
      );

      return await this.getPlaylistById(playlistId, userId);
    } catch (error) {
      console.error('Error updating playlist:', error);
      throw error;
    }
  }

  /**
   * Delete playlist
   */
  async deletePlaylist(playlistId, userId) {
    try {
      const result = await db.run(
        'DELETE FROM playlists WHERE id = ? AND user_id = ?',
        [playlistId, userId]
      );

      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting playlist:', error);
      throw error;
    }
  }

  /**
   * Add tracks to playlist
   */
  async addTracksToPlaylist(playlistId, userId, trackIds) {
    try {
      // Verify playlist ownership
      const playlist = await this.getPlaylistById(playlistId, userId);
      if (!playlist) {
        throw new Error('Playlist not found or unauthorized');
      }

      // Verify all tracks belong to user and are audio files
      const tracks = await db.all(
        `SELECT id, filename FROM files 
         WHERE id IN (${trackIds.map(() => '?').join(',')}) 
         AND user_id = ? 
         AND status = 'active'`,
        [...trackIds, userId]
      );

      if (tracks.length !== trackIds.length) {
        throw new Error('Some tracks not found or unauthorized');
      }

      // Get current max position
      const maxPos = await db.get(
        'SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?',
        [playlistId]
      );

      let position = (maxPos?.max_pos || 0) + 1;

      // Add tracks to playlist
      for (const trackId of trackIds) {
        await db.run(
          'INSERT INTO playlist_tracks (playlist_id, file_id, position) VALUES (?, ?, ?)',
          [playlistId, trackId, position++]
        );
      }

      // Update playlist timestamp
      await db.run(
        'UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [playlistId]
      );

      return { added: tracks.length };
    } catch (error) {
      console.error('Error adding tracks to playlist:', error);
      throw error;
    }
  }

  /**
   * Remove track from playlist
   */
  async removeTrackFromPlaylist(playlistId, userId, trackId) {
    try {
      // Verify playlist ownership
      const playlist = await this.getPlaylistById(playlistId, userId);
      if (!playlist) {
        throw new Error('Playlist not found or unauthorized');
      }

      const result = await db.run(
        'DELETE FROM playlist_tracks WHERE playlist_id = ? AND file_id = ?',
        [playlistId, trackId]
      );

      // Update playlist timestamp
      await db.run(
        'UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [playlistId]
      );

      return result.changes > 0;
    } catch (error) {
      console.error('Error removing track from playlist:', error);
      throw error;
    }
  }

  /**
   * Get tracks in playlist
   */
  async getPlaylistTracks(playlistId, userId) {
    try {
      // Verify playlist ownership
      const playlist = await this.getPlaylistById(playlistId, userId);
      if (!playlist) {
        throw new Error('Playlist not found or unauthorized');
      }

      const tracks = await db.all(
        `SELECT f.*, pt.position, pt.added_at
         FROM files f
         INNER JOIN playlist_tracks pt ON f.id = pt.file_id
         WHERE pt.playlist_id = ? AND f.status = 'active'
         ORDER BY pt.position ASC`,
        [playlistId]
      );

      return tracks;
    } catch (error) {
      console.error('Error getting playlist tracks:', error);
      throw error;
    }
  }

  /**
   * Reorder tracks in playlist
   */
  async reorderPlaylistTracks(playlistId, userId, trackOrder) {
    try {
      // Verify playlist ownership
      const playlist = await this.getPlaylistById(playlistId, userId);
      if (!playlist) {
        throw new Error('Playlist not found or unauthorized');
      }

      // Update positions
      for (let i = 0; i < trackOrder.length; i++) {
        await db.run(
          'UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND file_id = ?',
          [i + 1, playlistId, trackOrder[i]]
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error reordering playlist tracks:', error);
      throw error;
    }
  }

  /**
   * Get all audio files for a user
   */
  async getUserAudioFiles(userId, options = {}) {
    try {
      const { limit = 100, offset = 0, sortBy = 'uploaded_at', order = 'DESC' } = options;

      const files = await db.all(
        `SELECT * FROM files 
         WHERE user_id = ? AND status = 'active'
         ORDER BY ${sortBy} ${order}
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );

      return files.filter(f => this.isAudio(f.filename));
    } catch (error) {
      console.error('Error getting user audio files:', error);
      throw error;
    }
  }
}

module.exports = new MusicPlayerService();
