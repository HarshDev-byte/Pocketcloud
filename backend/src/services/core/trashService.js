/**
 * Trash Service - File deletion and recovery
 */

const fs = require('fs-extra');
const path = require('path');
const { getDatabase, saveDatabase } = require('../../config/database');

/**
 * Auto-cleanup old files from trash
 */
async function autoCleanup() {
  try {
    const db = getDatabase();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Find files trashed more than 30 days ago
    const result = db.exec(
      'SELECT id, filepath FROM files WHERE trashed_at IS NOT NULL AND trashed_at < ?',
      [thirtyDaysAgo]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return { success: true, count: 0 };
    }
    
    let cleanedCount = 0;
    
    for (const row of result[0].values) {
      const fileId = row[0];
      const filepath = row[1];
      
      try {
        // Delete from filesystem
        if (await fs.pathExists(filepath)) {
          await fs.remove(filepath);
        }
        
        // Delete from database
        db.exec('DELETE FROM files WHERE id = ?', [fileId]);
        cleanedCount++;
      } catch (error) {
        console.warn(`Failed to cleanup file ${fileId}:`, error.message);
      }
    }
    
    if (cleanedCount > 0) {
      saveDatabase();
    }
    
    return { success: true, count: cleanedCount };
  } catch (error) {
    console.error('Trash auto-cleanup failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Move file to trash
 */
async function moveToTrash(fileId) {
  try {
    const db = getDatabase();
    db.exec(
      'UPDATE files SET trashed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [fileId]
    );
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Restore file from trash
 */
async function restoreFromTrash(fileId) {
  try {
    const db = getDatabase();
    db.exec(
      'UPDATE files SET trashed_at = NULL WHERE id = ?',
      [fileId]
    );
    saveDatabase();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  autoCleanup,
  moveToTrash,
  restoreFromTrash
};