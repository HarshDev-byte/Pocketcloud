/**
 * Duplicate Detection Service - Find and manage duplicate files
 */

const fs = require('fs-extra');
const crypto = require('crypto');
const { getDatabase, saveDatabase } = require('../../config/database');

/**
 * Calculate file hash for duplicate detection
 */
async function calculateFileHash(filePath) {
  try {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  } catch (error) {
    throw new Error(`Failed to calculate hash: ${error.message}`);
  }
}

/**
 * Find duplicate files by hash
 */
async function findDuplicates(userId = null) {
  try {
    const db = getDatabase();
    let query = 'SELECT file_hash, COUNT(*) as count FROM files WHERE file_hash IS NOT NULL';
    let params = [];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    query += ' GROUP BY file_hash HAVING count > 1';
    
    const result = db.exec(query, params);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return { duplicates: [], count: 0 };
    }
    
    const duplicateHashes = result[0].values.map(row => row[0]);
    const duplicates = [];
    
    for (const hash of duplicateHashes) {
      const filesResult = db.exec(
        'SELECT id, filename, filepath, size FROM files WHERE file_hash = ?',
        [hash]
      );
      
      if (filesResult.length > 0 && filesResult[0].values.length > 0) {
        duplicates.push({
          hash,
          files: filesResult[0].values.map(row => ({
            id: row[0],
            filename: row[1],
            filepath: row[2],
            size: row[3]
          }))
        });
      }
    }
    
    return { duplicates, count: duplicates.length };
  } catch (error) {
    console.error('Find duplicates failed:', error);
    return { duplicates: [], count: 0, error: error.message };
  }
}

/**
 * Update file hash in database
 */
async function updateFileHash(fileId, filePath) {
  try {
    const hash = await calculateFileHash(filePath);
    const db = getDatabase();
    
    db.exec('UPDATE files SET file_hash = ? WHERE id = ?', [hash, fileId]);
    saveDatabase();
    
    return { success: true, hash };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  calculateFileHash,
  findDuplicates,
  updateFileHash
};