/**
 * Advanced Search Service with Full-Text Indexing
 */

const { getDatabase, saveDatabase } = require('../../config/database');
const path = require('path');
const fs = require('fs').promises;

class SearchService {
  /**
   * Index a file for search
   */
  async indexFile(fileId, userId) {
    try {
      const db = getDatabase();
      
      // Get file details
      const fileStmt = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?');
      fileStmt.bind([fileId, userId]);
      
      if (!fileStmt.step()) {
        fileStmt.free();
        return { success: false, error: 'File not found' };
      }
      
      const file = fileStmt.getAsObject();
      fileStmt.free();
      
      // Extract searchable content
      const content = await this.extractContent(file);
      
      // Check if already indexed
      const checkStmt = db.prepare(
        'SELECT id FROM search_index WHERE resource_type = ? AND resource_id = ?'
      );
      checkStmt.bind(['file', fileId]);
      const exists = checkStmt.step();
      checkStmt.free();
      
      if (exists) {
        // Update existing index
        const updateStmt = db.prepare(`
          UPDATE search_index 
          SET title = ?, content = ?, tags = ?, metadata = ?, indexed_at = CURRENT_TIMESTAMP
          WHERE resource_type = ? AND resource_id = ?
        `);
        updateStmt.bind([
          file.filename,
          content,
          file.tags || '',
          JSON.stringify({
            mimetype: file.mimetype,
            size: file.size,
            description: file.description
          }),
          'file',
          fileId
        ]);
        updateStmt.step();
        updateStmt.free();
      } else {
        // Create new index
        const insertStmt = db.prepare(`
          INSERT INTO search_index (resource_type, resource_id, user_id, title, content, tags, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        insertStmt.bind([
          'file',
          fileId,
          userId,
          file.filename,
          content,
          file.tags || '',
          JSON.stringify({
            mimetype: file.mimetype,
            size: file.size,
            description: file.description
          })
        ]);
        insertStmt.step();
        insertStmt.free();
      }
      
      saveDatabase();
      return { success: true };
    } catch (error) {
      console.error('Index file error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Index a folder for search
   */
  async indexFolder(folderId, userId) {
    try {
      const db = getDatabase();
      
      const folderStmt = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?');
      folderStmt.bind([folderId, userId]);
      
      if (!folderStmt.step()) {
        folderStmt.free();
        return { success: false, error: 'Folder not found' };
      }
      
      const folder = folderStmt.getAsObject();
      folderStmt.free();
      
      // Check if already indexed
      const checkStmt = db.prepare(
        'SELECT id FROM search_index WHERE resource_type = ? AND resource_id = ?'
      );
      checkStmt.bind(['folder', folderId]);
      const exists = checkStmt.step();
      checkStmt.free();
      
      if (exists) {
        const updateStmt = db.prepare(`
          UPDATE search_index 
          SET title = ?, content = ?, metadata = ?, indexed_at = CURRENT_TIMESTAMP
          WHERE resource_type = ? AND resource_id = ?
        `);
        updateStmt.bind([
          folder.name,
          folder.description || '',
          JSON.stringify({ color: folder.color }),
          'folder',
          folderId
        ]);
        updateStmt.step();
        updateStmt.free();
      } else {
        const insertStmt = db.prepare(`
          INSERT INTO search_index (resource_type, resource_id, user_id, title, content, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        insertStmt.bind([
          'folder',
          folderId,
          userId,
          folder.name,
          folder.description || '',
          JSON.stringify({ color: folder.color })
        ]);
        insertStmt.step();
        insertStmt.free();
      }
      
      saveDatabase();
      return { success: true };
    } catch (error) {
      console.error('Index folder error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Extract searchable content from file
   */
  async extractContent(file) {
    // For text files, extract content
    if (file.mimetype && file.mimetype.startsWith('text/')) {
      try {
        const content = await fs.readFile(file.filepath, 'utf-8');
        // Limit to first 10KB for indexing
        return content.substring(0, 10240);
      } catch (error) {
        console.error('Content extraction error:', error);
      }
    }
    
    // For other files, use filename and description
    return `${file.filename} ${file.description || ''}`;
  }
  
  /**
   * Search files and folders
   */
  search(userId, query, options = {}) {
    try {
      const db = getDatabase();
      const {
        type = 'all', // 'all', 'files', 'folders'
        tags = [],
        mimetype = null,
        dateFrom = null,
        dateTo = null,
        sizeMin = null,
        sizeMax = null,
        limit = 50,
        offset = 0
      } = options;
      
      // Build search query
      let sql = `
        SELECT 
          si.resource_type,
          si.resource_id,
          si.title,
          si.content,
          si.tags,
          si.metadata,
          si.indexed_at,
          CASE 
            WHEN si.resource_type = 'file' THEN f.uploaded_at
            WHEN si.resource_type = 'folder' THEN fo.created_at
          END as created_at,
          CASE 
            WHEN si.resource_type = 'file' THEN f.size
            ELSE 0
          END as size,
          CASE 
            WHEN si.resource_type = 'file' THEN f.mimetype
            ELSE NULL
          END as mimetype
        FROM search_index si
        LEFT JOIN files f ON si.resource_type = 'file' AND si.resource_id = f.id
        LEFT JOIN folders fo ON si.resource_type = 'folder' AND si.resource_id = fo.id
        WHERE si.user_id = ?
      `;
      
      const params = [userId];
      
      // Add type filter
      if (type !== 'all') {
        sql += ' AND si.resource_type = ?';
        params.push(type === 'files' ? 'file' : 'folder');
      }
      
      // Add search query
      if (query && query.trim()) {
        const searchTerms = query.trim().toLowerCase().split(/\s+/);
        const searchConditions = searchTerms.map(() => 
          '(LOWER(si.title) LIKE ? OR LOWER(si.content) LIKE ? OR LOWER(si.tags) LIKE ?)'
        ).join(' AND ');
        
        sql += ` AND (${searchConditions})`;
        searchTerms.forEach(term => {
          const pattern = `%${term}%`;
          params.push(pattern, pattern, pattern);
        });
      }
      
      // Add tag filter
      if (tags.length > 0) {
        const tagConditions = tags.map(() => 'si.tags LIKE ?').join(' OR ');
        sql += ` AND (${tagConditions})`;
        tags.forEach(tag => params.push(`%${tag}%`));
      }
      
      // Add mimetype filter
      if (mimetype) {
        sql += ' AND f.mimetype LIKE ?';
        params.push(`${mimetype}%`);
      }
      
      // Add date range filter
      if (dateFrom) {
        sql += ' AND created_at >= ?';
        params.push(dateFrom);
      }
      if (dateTo) {
        sql += ' AND created_at <= ?';
        params.push(dateTo);
      }
      
      // Add size range filter
      if (sizeMin !== null) {
        sql += ' AND size >= ?';
        params.push(sizeMin);
      }
      if (sizeMax !== null) {
        sql += ' AND size <= ?';
        params.push(sizeMax);
      }
      
      // Add ordering and pagination
      sql += ' ORDER BY indexed_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const stmt = db.prepare(sql);
      stmt.bind(params);
      
      const results = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          type: row.resource_type,
          id: row.resource_id,
          title: row.title,
          content: row.content ? row.content.substring(0, 200) : '',
          tags: row.tags ? row.tags.split(',').filter(t => t) : [],
          metadata: row.metadata ? JSON.parse(row.metadata) : {},
          createdAt: row.created_at,
          indexedAt: row.indexed_at,
          size: row.size,
          mimetype: row.mimetype
        });
      }
      stmt.free();
      
      return { success: true, results, count: results.length };
    } catch (error) {
      console.error('Search error:', error);
      return { success: false, error: error.message, results: [] };
    }
  }
  
  /**
   * Get search suggestions
   */
  getSuggestions(userId, query, limit = 10) {
    try {
      const db = getDatabase();
      
      const stmt = db.prepare(`
        SELECT DISTINCT title
        FROM search_index
        WHERE user_id = ? AND LOWER(title) LIKE ?
        ORDER BY indexed_at DESC
        LIMIT ?
      `);
      
      stmt.bind([userId, `%${query.toLowerCase()}%`, limit]);
      
      const suggestions = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        suggestions.push(row.title);
      }
      stmt.free();
      
      return { success: true, suggestions };
    } catch (error) {
      console.error('Suggestions error:', error);
      return { success: false, error: error.message, suggestions: [] };
    }
  }
  
  /**
   * Remove from index
   */
  removeFromIndex(resourceType, resourceId) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('DELETE FROM search_index WHERE resource_type = ? AND resource_id = ?');
      stmt.bind([resourceType, resourceId]);
      stmt.step();
      stmt.free();
      saveDatabase();
      return { success: true };
    } catch (error) {
      console.error('Remove from index error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Reindex all user content
   */
  async reindexAll(userId) {
    try {
      const db = getDatabase();
      
      // Clear existing index for user
      const clearStmt = db.prepare('DELETE FROM search_index WHERE user_id = ?');
      clearStmt.bind([userId]);
      clearStmt.step();
      clearStmt.free();
      
      // Index all files
      const filesStmt = db.prepare('SELECT id FROM files WHERE user_id = ?');
      filesStmt.bind([userId]);
      
      const fileIds = [];
      while (filesStmt.step()) {
        const row = filesStmt.getAsObject();
        fileIds.push(row.id);
      }
      filesStmt.free();
      
      for (const fileId of fileIds) {
        await this.indexFile(fileId, userId);
      }
      
      // Index all folders
      const foldersStmt = db.prepare('SELECT id FROM folders WHERE user_id = ?');
      foldersStmt.bind([userId]);
      
      const folderIds = [];
      while (foldersStmt.step()) {
        const row = foldersStmt.getAsObject();
        folderIds.push(row.id);
      }
      foldersStmt.free();
      
      for (const folderId of folderIds) {
        await this.indexFolder(folderId, userId);
      }
      
      return { 
        success: true, 
        indexed: { files: fileIds.length, folders: folderIds.length }
      };
    } catch (error) {
      console.error('Reindex error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SearchService();
