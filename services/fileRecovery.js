/**
 * File Recovery Service for PocketCloud
 * Handles corrupted files and provides recovery mechanisms
 */

const fs = require('fs-extra');
const path = require('path');
const { getDatabase, saveDatabase } = require('../config/database');
const { getUserStoragePath } = require('../config/storage');
const { CryptoIntegrityError } = require('./cryptoErrors');

/**
 * Check if a file is corrupted
 */
async function isFileCorrupted(filePath, expectedSize, encrypted = true) {
  try {
    if (!await fs.pathExists(filePath)) {
      return { corrupted: true, reason: 'File missing from disk' };
    }
    
    const stats = await fs.stat(filePath);
    
    if (encrypted) {
      // For encrypted files, allow some overhead but check for reasonable bounds
      const minSize = expectedSize; // At least original size
      const maxSize = expectedSize + 1024; // Original + reasonable encryption overhead
      
      if (stats.size < minSize) {
        return { corrupted: true, reason: `File too small (${stats.size} < ${minSize} bytes)` };
      }
      
      if (stats.size > maxSize) {
        return { corrupted: true, reason: `File too large (${stats.size} > ${maxSize} bytes)` };
      }
    } else {
      // Unencrypted files should match exactly
      if (stats.size !== expectedSize) {
        return { corrupted: true, reason: `Size mismatch (${stats.size} != ${expectedSize} bytes)` };
      }
    }
    
    return { corrupted: false };
  } catch (error) {
    return { corrupted: true, reason: `Cannot access file: ${error.message}` };
  }
}

/**
 * Mark a file as corrupted in the database
 */
async function markFileCorrupted(fileId, reason) {
  try {
    const db = getDatabase();
    
    // Add a corrupted flag to the files table (we'll need to alter table structure)
    // For now, we'll use a separate corrupted_files table
    
    // Create corrupted_files table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS corrupted_files (
        id INTEGER PRIMARY KEY,
        file_id INTEGER,
        reason TEXT,
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files (id)
      )
    `);
    
    // Insert corruption record
    db.run(
      'INSERT INTO corrupted_files (file_id, reason) VALUES (?, ?)',
      [fileId, reason]
    );
    
    saveDatabase();
    
    console.warn(`⚠️  File ${fileId} marked as corrupted: ${reason}`);
  } catch (error) {
    console.error('Failed to mark file as corrupted:', error.message);
  }
}

/**
 * Get list of corrupted files for a user
 */
function getCorruptedFiles(userId) {
  try {
    const db = getDatabase();
    
    const result = db.exec(`
      SELECT f.id, f.filename, f.filepath, f.size, c.reason, c.detected_at
      FROM files f
      JOIN corrupted_files c ON f.id = c.file_id
      WHERE f.user_id = ?
      ORDER BY c.detected_at DESC
    `, [userId]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }
    
    return result[0].values.map(row => ({
      id: row[0],
      filename: row[1],
      filepath: row[2],
      size: row[3],
      reason: row[4],
      detected_at: row[5]
    }));
  } catch (error) {
    console.error('Failed to get corrupted files:', error.message);
    return [];
  }
}

/**
 * Clean up a corrupted file
 */
async function cleanupCorruptedFile(fileId, userId) {
  try {
    const db = getDatabase();
    
    // Get file info
    const result = db.exec('SELECT filepath FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return { success: false, reason: 'File not found in database' };
    }
    
    const filepath = result[0].values[0][0];
    const userPath = getUserStoragePath(userId);
    const fullPath = path.join(userPath, filepath);
    
    // Remove corrupted file from disk
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
    }
    
    // Remove from database
    db.run('DELETE FROM files WHERE id = ?', [fileId]);
    db.run('DELETE FROM corrupted_files WHERE file_id = ?', [fileId]);
    
    saveDatabase();
    
    console.log(`🗑️  Cleaned up corrupted file: ${filepath}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to cleanup corrupted file:', error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Validate file integrity after upload
 */
async function validateUploadedFile(filePath, expectedSize, encrypted = true) {
  const corruption = await isFileCorrupted(filePath, expectedSize, encrypted);
  
  if (corruption.corrupted) {
    // Clean up corrupted file immediately
    try {
      await fs.remove(filePath);
    } catch (error) {
      console.warn('Failed to remove corrupted file:', error.message);
    }
    
    throw new Error(`Upload validation failed: ${corruption.reason}`);
  }
  
  return true;
}

/**
 * Handle crypto integrity error gracefully
 */
async function handleCryptoIntegrityError(fileId, userId, error) {
  console.error(`🔐 Crypto integrity error for file ${fileId}:`, error.message);
  
  // Mark file as corrupted
  await markFileCorrupted(fileId, 'Decryption integrity check failed');
  
  return {
    userMessage: 'This file appears to be corrupted and cannot be downloaded.',
    technicalMessage: 'File failed integrity verification during decryption.',
    action: 'The file has been marked as corrupted. You may need to re-upload it.',
    canRecover: false
  };
}

/**
 * Scan all files for corruption
 */
async function scanForCorruption(userId = null) {
  try {
    const db = getDatabase();
    
    let query = 'SELECT * FROM files';
    let params = [];
    
    if (userId) {
      query += ' WHERE user_id = ?';
      params = [userId];
    }
    
    const result = db.exec(query, params);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return { scanned: 0, corrupted: 0, healthy: 0 };
    }
    
    const files = result[0].values.map(row => ({
      id: row[0],
      user_id: row[1],
      filename: row[2],
      filepath: row[3],
      size: row[4],
      encrypted: row[9]
    }));
    
    let corrupted = 0;
    let healthy = 0;
    
    for (const file of files) {
      const userPath = getUserStoragePath(file.user_id);
      const fullPath = path.join(userPath, file.filepath);
      
      const corruption = await isFileCorrupted(fullPath, file.size, file.encrypted === 1);
      
      if (corruption.corrupted) {
        await markFileCorrupted(file.id, corruption.reason);
        corrupted++;
        console.warn(`⚠️  Corrupted: ${file.filename} - ${corruption.reason}`);
      } else {
        healthy++;
      }
    }
    
    return { scanned: files.length, corrupted, healthy };
  } catch (error) {
    console.error('Corruption scan failed:', error.message);
    throw error;
  }
}

module.exports = {
  isFileCorrupted,
  markFileCorrupted,
  getCorruptedFiles,
  cleanupCorruptedFile,
  validateUploadedFile,
  handleCryptoIntegrityError,
  scanForCorruption
};