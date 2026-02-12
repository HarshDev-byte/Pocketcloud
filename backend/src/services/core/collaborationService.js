/**
 * Collaboration Service
 * Handles sharing, comments, and activity tracking
 */

const { getDatabase, saveDatabase } = require('../../config/database');

class CollaborationService {
  /**
   * Share a resource with another user
   */
  shareResource(userId, resourceType, resourceId, sharedWithUserId, permission = 'view', expiresAt = null) {
    try {
      const db = getDatabase();
      
      // Verify resource ownership
      const table = resourceType === 'file' ? 'files' : 'folders';
      const ownerStmt = db.prepare(`SELECT user_id FROM ${table} WHERE id = ?`);
      ownerStmt.bind([resourceId]);
      
      if (!ownerStmt.step()) {
        ownerStmt.free();
        return { success: false, error: 'Resource not found' };
      }
      
      const owner = ownerStmt.getAsObject();
      ownerStmt.free();
      
      if (owner.user_id !== userId) {
        return { success: false, error: 'Not authorized to share this resource' };
      }
      
      // Check if already shared
      const checkStmt = db.prepare(`
        SELECT id FROM shares 
        WHERE resource_type = ? AND resource_id = ? AND shared_with_user_id = ?
      `);
      checkStmt.bind([resourceType, resourceId, sharedWithUserId]);
      const exists = checkStmt.step();
      checkStmt.free();
      
      if (exists) {
        // Update existing share
        const updateStmt = db.prepare(`
          UPDATE shares 
          SET permission = ?, expires_at = ?
          WHERE resource_type = ? AND resource_id = ? AND shared_with_user_id = ?
        `);
        updateStmt.bind([permission, expiresAt, resourceType, resourceId, sharedWithUserId]);
        updateStmt.step();
        updateStmt.free();
      } else {
        // Create new share
        const insertStmt = db.prepare(`
          INSERT INTO shares (user_id, shared_with_user_id, resource_type, resource_id, permission, expires_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        insertStmt.bind([userId, sharedWithUserId, resourceType, resourceId, permission, expiresAt]);
        insertStmt.step();
        insertStmt.free();
      }
      
      // Log activity
      this.logActivity(userId, 'share', resourceType, resourceId, {
        sharedWith: sharedWithUserId,
        permission
      });
      
      saveDatabase();
      return { success: true };
    } catch (error) {
      console.error('Share resource error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Unshare a resource
   */
  unshareResource(userId, resourceType, resourceId, sharedWithUserId) {
    try {
      const db = getDatabase();
      
      const stmt = db.prepare(`
        DELETE FROM shares 
        WHERE user_id = ? AND resource_type = ? AND resource_id = ? AND shared_with_user_id = ?
      `);
      stmt.bind([userId, resourceType, resourceId, sharedWithUserId]);
      stmt.step();
      stmt.free();
      
      // Log activity
      this.logActivity(userId, 'unshare', resourceType, resourceId, {
        unsharedWith: sharedWithUserId
      });
      
      saveDatabase();
      return { success: true };
    } catch (error) {
      console.error('Unshare resource error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get shares for a resource
   */
  getResourceShares(resourceType, resourceId) {
    try {
      const db = getDatabase();
      
      const stmt = db.prepare(`
        SELECT 
          s.*,
          u.username,
          u.email,
          u.avatar
        FROM shares s
        JOIN users u ON s.shared_with_user_id = u.id
        WHERE s.resource_type = ? AND s.resource_id = ?
        AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
      `);
      stmt.bind([resourceType, resourceId]);
      
      const shares = [];
      while (stmt.step()) {
        shares.push(stmt.getAsObject());
      }
      stmt.free();
      
      return { success: true, shares };
    } catch (error) {
      console.error('Get shares error:', error);
      return { success: false, error: error.message, shares: [] };
    }
  }
  
  /**
   * Get resources shared with user
   */
  getSharedWithMe(userId, resourceType = null) {
    try {
      const db = getDatabase();
      
      let sql = `
        SELECT 
          s.*,
          u.username as owner_username,
          CASE 
            WHEN s.resource_type = 'file' THEN f.filename
            WHEN s.resource_type = 'folder' THEN fo.name
          END as resource_name,
          CASE 
            WHEN s.resource_type = 'file' THEN f.size
            ELSE NULL
          END as size,
          CASE 
            WHEN s.resource_type = 'file' THEN f.mimetype
            ELSE NULL
          END as mimetype
        FROM shares s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN files f ON s.resource_type = 'file' AND s.resource_id = f.id
        LEFT JOIN folders fo ON s.resource_type = 'folder' AND s.resource_id = fo.id
        WHERE s.shared_with_user_id = ?
        AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
      `;
      
      const params = [userId];
      
      if (resourceType) {
        sql += ' AND s.resource_type = ?';
        params.push(resourceType);
      }
      
      sql += ' ORDER BY s.created_at DESC';
      
      const stmt = db.prepare(sql);
      stmt.bind(params);
      
      const shared = [];
      while (stmt.step()) {
        shared.push(stmt.getAsObject());
      }
      stmt.free();
      
      return { success: true, shared };
    } catch (error) {
      console.error('Get shared with me error:', error);
      return { success: false, error: error.message, shared: [] };
    }
  }
  
  /**
   * Check if user has access to resource
   */
  hasAccess(userId, resourceType, resourceId, requiredPermission = 'view') {
    try {
      const db = getDatabase();
      
      // Check ownership
      const table = resourceType === 'file' ? 'files' : 'folders';
      const ownerStmt = db.prepare(`SELECT user_id FROM ${table} WHERE id = ?`);
      ownerStmt.bind([resourceId]);
      
      if (ownerStmt.step()) {
        const owner = ownerStmt.getAsObject();
        ownerStmt.free();
        
        if (owner.user_id === userId) {
          return { hasAccess: true, permission: 'owner' };
        }
      } else {
        ownerStmt.free();
        return { hasAccess: false };
      }
      
      // Check shares
      const shareStmt = db.prepare(`
        SELECT permission FROM shares 
        WHERE resource_type = ? AND resource_id = ? AND shared_with_user_id = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `);
      shareStmt.bind([resourceType, resourceId, userId]);
      
      if (shareStmt.step()) {
        const share = shareStmt.getAsObject();
        shareStmt.free();
        
        const permissionLevel = { view: 1, edit: 2, admin: 3 };
        const hasPermission = permissionLevel[share.permission] >= permissionLevel[requiredPermission];
        
        return { hasAccess: hasPermission, permission: share.permission };
      }
      shareStmt.free();
      
      return { hasAccess: false };
    } catch (error) {
      console.error('Check access error:', error);
      return { hasAccess: false, error: error.message };
    }
  }
  
  /**
   * Add a comment
   */
  addComment(userId, resourceType, resourceId, content, parentId = null) {
    try {
      const db = getDatabase();
      
      // Extract mentions (@username)
      const mentions = content.match(/@(\w+)/g) || [];
      const mentionsStr = mentions.join(',');
      
      const stmt = db.prepare(`
        INSERT INTO comments (user_id, resource_type, resource_id, parent_id, content, mentions)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.bind([userId, resourceType, resourceId, parentId, content, mentionsStr]);
      stmt.step();
      stmt.free();
      
      const commentId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
      
      // Log activity
      this.logActivity(userId, 'comment', resourceType, resourceId, {
        commentId,
        mentions: mentions.length
      });
      
      saveDatabase();
      return { success: true, commentId };
    } catch (error) {
      console.error('Add comment error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get comments for a resource
   */
  getComments(resourceType, resourceId) {
    try {
      const db = getDatabase();
      
      const stmt = db.prepare(`
        SELECT 
          c.*,
          u.username,
          u.avatar
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.resource_type = ? AND c.resource_id = ?
        ORDER BY c.created_at ASC
      `);
      stmt.bind([resourceType, resourceId]);
      
      const comments = [];
      while (stmt.step()) {
        const comment = stmt.getAsObject();
        comment.mentions = comment.mentions ? comment.mentions.split(',').filter(m => m) : [];
        comments.push(comment);
      }
      stmt.free();
      
      return { success: true, comments };
    } catch (error) {
      console.error('Get comments error:', error);
      return { success: false, error: error.message, comments: [] };
    }
  }
  
  /**
   * Update a comment
   */
  updateComment(userId, commentId, content) {
    try {
      const db = getDatabase();
      
      // Verify ownership
      const checkStmt = db.prepare('SELECT user_id FROM comments WHERE id = ?');
      checkStmt.bind([commentId]);
      
      if (!checkStmt.step()) {
        checkStmt.free();
        return { success: false, error: 'Comment not found' };
      }
      
      const comment = checkStmt.getAsObject();
      checkStmt.free();
      
      if (comment.user_id !== userId) {
        return { success: false, error: 'Not authorized' };
      }
      
      // Extract mentions
      const mentions = content.match(/@(\w+)/g) || [];
      const mentionsStr = mentions.join(',');
      
      const updateStmt = db.prepare(`
        UPDATE comments 
        SET content = ?, mentions = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateStmt.bind([content, mentionsStr, commentId]);
      updateStmt.step();
      updateStmt.free();
      
      saveDatabase();
      return { success: true };
    } catch (error) {
      console.error('Update comment error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Delete a comment
   */
  deleteComment(userId, commentId) {
    try {
      const db = getDatabase();
      
      // Verify ownership
      const checkStmt = db.prepare('SELECT user_id FROM comments WHERE id = ?');
      checkStmt.bind([commentId]);
      
      if (!checkStmt.step()) {
        checkStmt.free();
        return { success: false, error: 'Comment not found' };
      }
      
      const comment = checkStmt.getAsObject();
      checkStmt.free();
      
      if (comment.user_id !== userId) {
        return { success: false, error: 'Not authorized' };
      }
      
      const deleteStmt = db.prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?');
      deleteStmt.bind([commentId, commentId]);
      deleteStmt.step();
      deleteStmt.free();
      
      saveDatabase();
      return { success: true };
    } catch (error) {
      console.error('Delete comment error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Log activity
   */
  logActivity(userId, action, resourceType = null, resourceId = null, details = {}, req = null) {
    try {
      const db = getDatabase();
      
      const stmt = db.prepare(`
        INSERT INTO activity_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.bind([
        userId,
        action,
        resourceType,
        resourceId,
        JSON.stringify(details),
        req ? req.ip : null,
        req ? req.get('user-agent') : null
      ]);
      stmt.step();
      stmt.free();
      
      saveDatabase();
      return { success: true };
    } catch (error) {
      console.error('Log activity error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get activity log
   */
  getActivity(userId, options = {}) {
    try {
      const db = getDatabase();
      const { limit = 50, offset = 0, action = null, resourceType = null } = options;
      
      let sql = `
        SELECT 
          a.*,
          u.username,
          u.avatar
        FROM activity_log a
        JOIN users u ON a.user_id = u.id
        WHERE a.user_id = ?
      `;
      
      const params = [userId];
      
      if (action) {
        sql += ' AND a.action = ?';
        params.push(action);
      }
      
      if (resourceType) {
        sql += ' AND a.resource_type = ?';
        params.push(resourceType);
      }
      
      sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const stmt = db.prepare(sql);
      stmt.bind(params);
      
      const activities = [];
      while (stmt.step()) {
        const activity = stmt.getAsObject();
        activity.details = activity.details ? JSON.parse(activity.details) : {};
        activities.push(activity);
      }
      stmt.free();
      
      return { success: true, activities };
    } catch (error) {
      console.error('Get activity error:', error);
      return { success: false, error: error.message, activities: [] };
    }
  }
}

module.exports = new CollaborationService();
