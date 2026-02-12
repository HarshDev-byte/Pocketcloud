/**
 * User Management Service with Role Support
 */

const { getDatabase, saveDatabase } = require('../../config/database');
const bcrypt = require('bcryptjs');
const { ROLES, isValidRole, getRoleLevel } = require('../../config/roles');

class UserService {
  /**
   * Create a new user
   */
  async createUser(username, password, email, role = ROLES.VIEWER, createdBy = null) {
    try {
      const db = getDatabase();
      
      // Validate role
      if (!isValidRole(role)) {
        return { success: false, error: 'Invalid role' };
      }
      
      // Check if username exists
      const checkStmt = db.prepare('SELECT id FROM users WHERE username = ?');
      checkStmt.bind([username]);
      if (checkStmt.step()) {
        checkStmt.free();
        return { success: false, error: 'Username already exists' };
      }
      checkStmt.free();
      
      // Check if email exists
      if (email) {
        const emailStmt = db.prepare('SELECT id FROM users WHERE email = ?');
        emailStmt.bind([email]);
        if (emailStmt.step()) {
          emailStmt.free();
          return { success: false, error: 'Email already exists' };
        }
        emailStmt.free();
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      const stmt = db.prepare(`
        INSERT INTO users (username, password, email, role, status)
        VALUES (?, ?, ?, ?, 'active')
      `);
      stmt.bind([username, hashedPassword, email, role]);
      stmt.step();
      stmt.free();
      
      const userId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
      
      saveDatabase();
      
      return { success: true, userId };
    } catch (error) {
      console.error('Create user error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get user by ID
   */
  getUser(userId) {
    try {
      const db = getDatabase();
      
      const stmt = db.prepare(`
        SELECT id, username, email, role, avatar, status, last_login, created_at
        FROM users WHERE id = ?
      `);
      stmt.bind([userId]);
      
      if (!stmt.step()) {
        stmt.free();
        return { success: false, error: 'User not found' };
      }
      
      const user = stmt.getAsObject();
      stmt.free();
      
      return { success: true, user };
    } catch (error) {
      console.error('Get user error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get all users (admin only)
   */
  getAllUsers(options = {}) {
    try {
      const db = getDatabase();
      const { limit = 50, offset = 0, role = null, status = null } = options;
      
      let sql = `
        SELECT id, username, email, role, avatar, status, last_login, created_at
        FROM users
        WHERE 1=1
      `;
      const params = [];
      
      if (role) {
        sql += ' AND role = ?';
        params.push(role);
      }
      
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const stmt = db.prepare(sql);
      stmt.bind(params);
      
      const users = [];
      while (stmt.step()) {
        users.push(stmt.getAsObject());
      }
      stmt.free();
      
      return { success: true, users };
    } catch (error) {
      console.error('Get all users error:', error);
      return { success: false, error: error.message, users: [] };
    }
  }
  
  /**
   * Update user
   */
  async updateUser(userId, updates, updatedBy = null) {
    try {
      const db = getDatabase();
      
      // Check if user exists
      const checkStmt = db.prepare('SELECT id, role FROM users WHERE id = ?');
      checkStmt.bind([userId]);
      if (!checkStmt.step()) {
        checkStmt.free();
        return { success: false, error: 'User not found' };
      }
      const currentUser = checkStmt.getAsObject();
      checkStmt.free();
      
      const allowedFields = ['email', 'avatar', 'status'];
      const updateFields = [];
      const params = [];
      
      // Handle password update
      if (updates.password) {
        const hashedPassword = await bcrypt.hash(updates.password, 10);
        updateFields.push('password = ?');
        params.push(hashedPassword);
      }
      
      // Handle role update (requires permission check in route)
      if (updates.role && isValidRole(updates.role)) {
        updateFields.push('role = ?');
        params.push(updates.role);
      }
      
      // Handle other fields
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateFields.push(`${field} = ?`);
          params.push(updates[field]);
        }
      }
      
      if (updateFields.length === 0) {
        return { success: false, error: 'No valid fields to update' };
      }
      
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(userId);
      
      const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
      const stmt = db.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
      
      saveDatabase();
      
      return { success: true };
    } catch (error) {
      console.error('Update user error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Delete user
   */
  deleteUser(userId, deletedBy = null) {
    try {
      const db = getDatabase();
      
      // Check if user exists
      const checkStmt = db.prepare('SELECT id FROM users WHERE id = ?');
      checkStmt.bind([userId]);
      if (!checkStmt.step()) {
        checkStmt.free();
        return { success: false, error: 'User not found' };
      }
      checkStmt.free();
      
      // Soft delete (set status to deleted)
      const stmt = db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      stmt.bind(['deleted', userId]);
      stmt.step();
      stmt.free();
      
      saveDatabase();
      
      return { success: true };
    } catch (error) {
      console.error('Delete user error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Change user role
   */
  changeRole(userId, newRole, changedBy) {
    try {
      const db = getDatabase();
      
      // Validate role
      if (!isValidRole(newRole)) {
        return { success: false, error: 'Invalid role' };
      }
      
      // Get current user role
      const userStmt = db.prepare('SELECT role FROM users WHERE id = ?');
      userStmt.bind([userId]);
      if (!userStmt.step()) {
        userStmt.free();
        return { success: false, error: 'User not found' };
      }
      const currentRole = userStmt.getAsObject().role;
      userStmt.free();
      
      // Get changer's role
      const changerStmt = db.prepare('SELECT role FROM users WHERE id = ?');
      changerStmt.bind([changedBy]);
      if (!changerStmt.step()) {
        changerStmt.free();
        return { success: false, error: 'Unauthorized' };
      }
      const changerRole = changerStmt.getAsObject().role;
      changerStmt.free();
      
      // Check if changer has permission (must have higher role)
      if (getRoleLevel(changerRole) <= getRoleLevel(currentRole)) {
        return { success: false, error: 'Insufficient permissions to change this user\'s role' };
      }
      
      // Update role
      const updateStmt = db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      updateStmt.bind([newRole, userId]);
      updateStmt.step();
      updateStmt.free();
      
      saveDatabase();
      
      return { success: true };
    } catch (error) {
      console.error('Change role error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Update last login
   */
  updateLastLogin(userId) {
    try {
      const db = getDatabase();
      
      const stmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
      stmt.bind([userId]);
      stmt.step();
      stmt.free();
      
      saveDatabase();
      
      return { success: true };
    } catch (error) {
      console.error('Update last login error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Search users
   */
  searchUsers(query, options = {}) {
    try {
      const db = getDatabase();
      const { limit = 20 } = options;
      
      const stmt = db.prepare(`
        SELECT id, username, email, avatar, role
        FROM users
        WHERE (username LIKE ? OR email LIKE ?) AND status = 'active'
        ORDER BY username
        LIMIT ?
      `);
      
      const searchPattern = `%${query}%`;
      stmt.bind([searchPattern, searchPattern, limit]);
      
      const users = [];
      while (stmt.step()) {
        users.push(stmt.getAsObject());
      }
      stmt.free();
      
      return { success: true, users };
    } catch (error) {
      console.error('Search users error:', error);
      return { success: false, error: error.message, users: [] };
    }
  }
  
  /**
   * Get user statistics
   */
  getUserStats(userId) {
    try {
      const db = getDatabase();
      
      // Get file count and total size
      const filesStmt = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size
        FROM files WHERE user_id = ?
      `);
      filesStmt.bind([userId]);
      filesStmt.step();
      const fileStats = filesStmt.getAsObject();
      filesStmt.free();
      
      // Get folder count
      const foldersStmt = db.prepare('SELECT COUNT(*) as count FROM folders WHERE user_id = ?');
      foldersStmt.bind([userId]);
      foldersStmt.step();
      const folderStats = foldersStmt.getAsObject();
      foldersStmt.free();
      
      // Get share count
      const sharesStmt = db.prepare('SELECT COUNT(*) as count FROM shares WHERE user_id = ?');
      sharesStmt.bind([userId]);
      sharesStmt.step();
      const shareStats = sharesStmt.getAsObject();
      sharesStmt.free();
      
      return {
        success: true,
        stats: {
          files: fileStats.count,
          totalSize: fileStats.total_size,
          folders: folderStats.count,
          shares: shareStats.count
        }
      };
    } catch (error) {
      console.error('Get user stats error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new UserService();
