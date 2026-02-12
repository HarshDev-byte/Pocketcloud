/**
 * Role-Based Access Control Middleware
 */

const { hasPermission, hasAnyPermission, hasAllPermissions, PERMISSIONS } = require('../config/roles');
const { getDatabase } = require('../config/database');

/**
 * Middleware to check if user has required permission
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const db = getDatabase();
      const result = db.exec('SELECT role FROM users WHERE id = ?', [req.session.userId]);
      
      if (result.length === 0 || result[0].values.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      const userRole = result[0].values[0][0] || 'viewer';
      
      if (!hasPermission(userRole, permission)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: permission,
          role: userRole
        });
      }
      
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Middleware to check if user has any of the required permissions
 */
function requireAnyPermission(permissions) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const db = getDatabase();
      const result = db.exec('SELECT role FROM users WHERE id = ?', [req.session.userId]);
      
      if (result.length === 0 || result[0].values.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      const userRole = result[0].values[0][0] || 'viewer';
      
      if (!hasAnyPermission(userRole, permissions)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: permissions,
          role: userRole
        });
      }
      
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Middleware to check if user has all of the required permissions
 */
function requireAllPermissions(permissions) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const db = getDatabase();
      const result = db.exec('SELECT role FROM users WHERE id = ?', [req.session.userId]);
      
      if (result.length === 0 || result[0].values.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      const userRole = result[0].values[0][0] || 'viewer';
      
      if (!hasAllPermissions(userRole, permissions)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: permissions,
          role: userRole
        });
      }
      
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Middleware to check if user is admin
 */
function requireAdmin(req, res, next) {
  return requirePermission(PERMISSIONS.SYSTEM_SETTINGS)(req, res, next);
}

/**
 * Middleware to attach user role to request
 */
function attachUserRole(req, res, next) {
  if (!req.session.userId) {
    return next();
  }
  
  try {
    const db = getDatabase();
    const result = db.exec('SELECT role FROM users WHERE id = ?', [req.session.userId]);
    
    if (result.length > 0 && result[0].values.length > 0) {
      req.userRole = result[0].values[0][0] || 'viewer';
    }
    
    next();
  } catch (error) {
    console.error('Attach role error:', error);
    next();
  }
}

/**
 * Check if user owns a resource
 */
function checkOwnership(resourceType, resourceIdParam = 'id') {
  return async (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const resourceId = req.params[resourceIdParam] || req.body[resourceIdParam];
    
    if (!resourceId) {
      return res.status(400).json({ error: 'Resource ID required' });
    }
    
    try {
      const db = getDatabase();
      let query;
      
      switch (resourceType) {
        case 'file':
          query = 'SELECT user_id FROM files WHERE id = ?';
          break;
        case 'folder':
          query = 'SELECT user_id FROM folders WHERE id = ?';
          break;
        case 'comment':
          query = 'SELECT user_id FROM comments WHERE id = ?';
          break;
        default:
          return res.status(400).json({ error: 'Invalid resource type' });
      }
      
      const result = db.exec(query, [resourceId]);
      
      if (result.length === 0 || result[0].values.length === 0) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      
      const userId = result[0].values[0][0];
      req.isOwner = userId === req.session.userId;
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({ error: 'Ownership check failed' });
    }
  };
}

module.exports = {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireAdmin,
  attachUserRole,
  checkOwnership
};
