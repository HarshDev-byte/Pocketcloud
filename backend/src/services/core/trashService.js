/**
 * Trash/Recycle Bin Service
 * Soft delete files with auto-cleanup
 */

const { getDatabase, saveDatabase } = require('../../config/database');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config/config');

class TrashService {
  constructor() {
    this.TRASH_RETENTION_DAYS = 30; // Keep files in trash for 30 days
  }
  
  /**
   * Move file to trash (soft delete)
   */
  async moveToTrash(fileId, userId) {
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
      
      // Update file status to 'trashed'
      const updateStmt = db.prepare(`
        UPDATE files 
        SET status = 'trashed', trashed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.bind([fileId]);
      updateStmt.step();
      updateStmt.free();
      
      saveDatabase();
      
      return { success: true, message: 'File moved to trash' };
    } catch (error) {
      console.error('Move to trash error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Restore file from trash
   */
  async restoreFromTrash(fileId, userId) {
    try {
      const db = getDatabase();
      
      // Verify file is in trash
      const stmt = db.prepare(`
        SELECT * FROM files 
        WHERE id = ? AND user_id = ? AND status = 'trashed'
      `);
      stmt.bind([fileId, userId]);
      
      if (!stmt.step()) {
        stmt.free();
        return { success: false, error: 'File not found in trash' };
      }
      stmt.free();
      
      // Restore file
      const updateStmt = db.prepare(`
        UPDATE files 
        SET status = 'active', trashed_at = NULL
        WHERE id = ?
      `);
      updateStmt.bind([fileId]);
      updateStmt.step();
      updateStmt.free();
      
      saveDatabase();
      
      return { success: true, message: 'File restored' };
    } catch (error) {
      console.error('Restore from trash error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Permanently delete file from trash
   */
  async permanentlyDelete(fileId, userId) {
    try {
      const db = getDatabase();
      
      // Get file details
      const stmt = db.prepare(`
        SELECT * FROM files 
        WHERE id = ? AND user_id = ? AND status = 'trashed'
      `);
      stmt.bind([fileId, userId]);
      
      if (!stmt.step()) {
        stmt.free();
        return { success: false, error: 'File not found in trash' };
      }
      
      const file = stmt.getAsObject();
      stmt.free();
      
      // Delete physical file
      try {
        await fs.unlink(file.filepath);
      } catch (err) {
        console.error('Failed to delete physical file:', err);
      }
      
      // Delete from database
      const deleteStmt = db.prepare('DELETE FROM files WHERE id = ?');
      deleteStmt.bind([fileId]);
      deleteStmt.step();
      deleteStmt.free();
      
      // Delete from search index
      const searchStmt = db.prepare('DELETE FROM search_index WHERE resource_type = ? AND resource_id = ?');
      searchStmt.bind(['file', fileId]);
      searchStmt.step();
      searchStmt.free();
      
      saveDatabase();
      
      return { success: true, message: 'File permanently deleted' };
    } catch (error) {
      console.error('Permanent delete error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get all trashed files for user
   */
  getTrash(userId, options = {}) {
    try {
      const db = getDatabase();
      const { limit = 50, offset = 0 } = options;
      
      const stmt = db.prepare(`
        SELECT * FROM files 
        WHERE user_id = ? AND status = 'trashed'
        ORDER BY trashed_at DESC
        LIMIT ? OFFSET ?
      `);
      stmt.bind([userId, limit, offset]);
      
      const files = [];
      while (stmt.step()) {
        files.push(stmt.getAsObject());
      }
      stmt.free();
      
      return { success: true, files };
    } catch (error) {
      console.error('Get trash error:', error);
      return { success: false, error: error.message, files: [] };
    }
  }
  
  /**
   * Empty trash (delete all trashed files)
   */
  async emptyTrash(userId) {
    try {
      const db = getDatabase();
      
      // Get all trashed files
      const stmt = db.prepare(`
        SELECT * FROM files 
        WHERE user_id = ? AND status = 'trashed'
      `);
      stmt.bind([userId]);
      
      const files = [];
      while (stmt.step()) {
        files.push(stmt.getAsObject());
      }
      stmt.free();
      
      // Delete physical files
      for (const file of files) {
        try {
          await fs.unlink(file.filepath);
        } catch (err) {
          console.error(`Failed to delete file ${file.id}:`, err);
        }
      }
      
      // Delete from database
      const deleteStmt = db.prepare(`
        DELETE FROM files 
        WHERE user_id = ? AND status = 'trashed'
      `);
      deleteStmt.bind([userId]);
      deleteStmt.step();
      deleteStmt.free();
      
      // Delete from search index
      const searchStmt = db.prepare(`
        DELETE FROM search_index 
        WHERE user_id = ? AND resource_id IN (
          SELECT id FROM files WHERE user_id = ? AND status = 'trashed'
        )
      `);
      searchStmt.bind([userId, userId]);
      searchStmt.step();
      searchStmt.free();
      
      saveDatabase();
      
      return { success: true, message: `Deleted ${files.length} files`, count: files.length };
    } catch (error) {
      console.error('Empty trash error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Auto-cleanup old trashed files
   */
  async autoCleanup() {
    try {
      const db = getDatabase();
      
      // Get files older than retention period
      const stmt = db.prepare(`
        SELECT * FROM files 
        WHERE status = 'trashed' 
        AND datetime(trashed_at, '+${this.TRASH_RETENTION_DAYS} days') < datetime('now')
      `);
      
      const files = [];
      while (stmt.step()) {
        files.push(stmt.getAsObject());
      }
      stmt.free();
      
      if (files.length === 0) {
        return { success: true, message: 'No files to cleanup', count: 0 };
      }
      
      // Delete physical files
      for (const file of files) {
        try {
          await fs.unlink(file.filepath);
        } catch (err) {
          console.error(`Failed to delete file ${file.id}:`, err);
        }
      }
      
      // Delete from database
      const deleteStmt = db.prepare(`
        DELETE FROM files 
        WHERE status = 'trashed' 
        AND datetime(trashed_at, '+${this.TRASH_RETENTION_DAYS} days') < datetime('now')
      `);
      deleteStmt.step();
      deleteStmt.free();
      
      saveDatabase();
      
      console.log(`Auto-cleanup: Deleted ${files.length} old files from trash`);
      return { success: true, message: `Cleaned up ${files.length} files`, count: files.length };
    } catch (error) {
      console.error('Auto-cleanup error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get trash statistics
   */
  getTrashStats(userId) {
    try {
      const db = getDatabase();
      
      const stmt = db.prepare(`
        SELECT 
          COUNT(*) as count,
          COALESCE(SUM(size), 0) as total_size
        FROM files 
        WHERE user_id = ? AND status = 'trashed'
      `);
      stmt.bind([userId]);
      stmt.step();
      const stats = stmt.getAsObject();
      stmt.free();
      
      return { success: true, stats };
    } catch (error) {
      console.error('Get trash stats error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TrashService();
