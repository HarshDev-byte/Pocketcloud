/**
 * Duplicate File Detection Service
 * Detect duplicate files using hash comparison
 */

const { getDatabase, saveDatabase } = require('../../config/database');
const crypto = require('crypto');
const fs = require('fs');
const { promisify } = require('util');
const stat = promisify(fs.stat);

class DuplicateService {
  /**
   * Calculate file hash (SHA-256)
   */
  async calculateHash(filepath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filepath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
  
  /**
   * Add file hash to database
   */
  async addFileHash(fileId, userId) {
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
      
      // Calculate hash
      const hash = await this.calculateHash(file.filepath);
      
      // Update file with hash
      const updateStmt = db.prepare('UPDATE files SET file_hash = ? WHERE id = ?');
      updateStmt.bind([hash, fileId]);
      updateStmt.step();
      updateStmt.free();
      
      saveDatabase();
      
      return { success: true, hash };
    } catch (error) {
      console.error('Add file hash error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Find duplicate files for user
   */
  findDuplicates(userId) {
    try {
      const db = getDatabase();
      
      // Find files with same hash
      const stmt = db.prepare(`
        SELECT 
          file_hash,
          COUNT(*) as count,
          GROUP_CONCAT(id) as file_ids,
          GROUP_CONCAT(filename) as filenames,
          SUM(size) as total_size,
          size as file_size
        FROM files 
        WHERE user_id = ? AND file_hash IS NOT NULL AND status = 'active'
        GROUP BY file_hash
        HAVING count > 1
        ORDER BY total_size DESC
      `);
      stmt.bind([userId]);
      
      const duplicates = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        duplicates.push({
          hash: row.file_hash,
          count: row.count,
          fileIds: row.file_ids.split(',').map(id => parseInt(id)),
          filenames: row.filenames.split(','),
          totalSize: row.total_size,
          fileSize: row.file_size,
          wastedSpace: row.file_size * (row.count - 1) // Space that could be saved
        });
      }
      stmt.free();
      
      // Calculate total wasted space
      const totalWasted = duplicates.reduce((sum, dup) => sum + dup.wastedSpace, 0);
      
      return { 
        success: true, 
        duplicates,
        totalWasted,
        duplicateCount: duplicates.length
      };
    } catch (error) {
      console.error('Find duplicates error:', error);
      return { success: false, error: error.message, duplicates: [] };
    }
  }
  
  /**
   * Check if file is duplicate before upload
   */
  async checkDuplicate(filepath, userId) {
    try {
      const db = getDatabase();
      
      // Calculate hash of new file
      const hash = await this.calculateHash(filepath);
      
      // Check if hash exists
      const stmt = db.prepare(`
        SELECT * FROM files 
        WHERE user_id = ? AND file_hash = ? AND status = 'active'
        LIMIT 1
      `);
      stmt.bind([userId, hash]);
      
      if (stmt.step()) {
        const duplicate = stmt.getAsObject();
        stmt.free();
        return { 
          success: true, 
          isDuplicate: true, 
          existingFile: duplicate 
        };
      }
      stmt.free();
      
      return { success: true, isDuplicate: false, hash };
    } catch (error) {
      console.error('Check duplicate error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get duplicate groups (files with same content)
   */
  getDuplicateGroups(userId) {
    try {
      const db = getDatabase();
      
      // Get all hashes with duplicates
      const hashStmt = db.prepare(`
        SELECT file_hash
        FROM files 
        WHERE user_id = ? AND file_hash IS NOT NULL AND status = 'active'
        GROUP BY file_hash
        HAVING COUNT(*) > 1
      `);
      hashStmt.bind([userId]);
      
      const hashes = [];
      while (hashStmt.step()) {
        hashes.push(hashStmt.getAsObject().file_hash);
      }
      hashStmt.free();
      
      // Get files for each hash
      const groups = [];
      for (const hash of hashes) {
        const fileStmt = db.prepare(`
          SELECT * FROM files 
          WHERE user_id = ? AND file_hash = ? AND status = 'active'
          ORDER BY uploaded_at ASC
        `);
        fileStmt.bind([userId, hash]);
        
        const files = [];
        while (fileStmt.step()) {
          files.push(fileStmt.getAsObject());
        }
        fileStmt.free();
        
        if (files.length > 1) {
          groups.push({
            hash,
            files,
            count: files.length,
            original: files[0], // First uploaded is considered original
            duplicates: files.slice(1),
            wastedSpace: files[0].size * (files.length - 1)
          });
        }
      }
      
      return { success: true, groups };
    } catch (error) {
      console.error('Get duplicate groups error:', error);
      return { success: false, error: error.message, groups: [] };
    }
  }
  
  /**
   * Delete duplicate files (keep oldest)
   */
  async deleteDuplicates(userId, keepStrategy = 'oldest') {
    try {
      const result = this.getDuplicateGroups(userId);
      
      if (!result.success) {
        return result;
      }
      
      let deletedCount = 0;
      let freedSpace = 0;
      
      for (const group of result.groups) {
        // Determine which file to keep
        let toKeep, toDelete;
        
        if (keepStrategy === 'oldest') {
          toKeep = group.files[0];
          toDelete = group.files.slice(1);
        } else if (keepStrategy === 'newest') {
          toKeep = group.files[group.files.length - 1];
          toDelete = group.files.slice(0, -1);
        }
        
        // Delete duplicates
        for (const file of toDelete) {
          const trashService = require('./trashService');
          await trashService.moveToTrash(file.id, userId);
          deletedCount++;
          freedSpace += file.size;
        }
      }
      
      return { 
        success: true, 
        deletedCount, 
        freedSpace,
        message: `Moved ${deletedCount} duplicate files to trash, freed ${this.formatBytes(freedSpace)}`
      };
    } catch (error) {
      console.error('Delete duplicates error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Scan all files and update hashes
   */
  async scanAllFiles(userId) {
    try {
      const db = getDatabase();
      
      // Get all files without hash
      const stmt = db.prepare(`
        SELECT id FROM files 
        WHERE user_id = ? AND file_hash IS NULL AND status = 'active'
      `);
      stmt.bind([userId]);
      
      const fileIds = [];
      while (stmt.step()) {
        fileIds.push(stmt.getAsObject().id);
      }
      stmt.free();
      
      // Calculate hashes
      let processed = 0;
      for (const fileId of fileIds) {
        await this.addFileHash(fileId, userId);
        processed++;
      }
      
      return { 
        success: true, 
        processed,
        message: `Scanned ${processed} files`
      };
    } catch (error) {
      console.error('Scan all files error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get duplicate statistics
   */
  getDuplicateStats(userId) {
    try {
      const result = this.findDuplicates(userId);
      
      if (!result.success) {
        return result;
      }
      
      const totalFiles = result.duplicates.reduce((sum, dup) => sum + dup.count, 0);
      const uniqueFiles = result.duplicates.length;
      const duplicateFiles = totalFiles - uniqueFiles;
      
      return {
        success: true,
        stats: {
          totalDuplicateGroups: result.duplicateCount,
          totalDuplicateFiles: duplicateFiles,
          totalWastedSpace: result.totalWasted,
          potentialSavings: this.formatBytes(result.totalWasted)
        }
      };
    } catch (error) {
      console.error('Get duplicate stats error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = new DuplicateService();
