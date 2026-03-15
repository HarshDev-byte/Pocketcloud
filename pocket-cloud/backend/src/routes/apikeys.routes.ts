import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth';
import { generateApiKey, ApiKeyRequest } from '../middleware/apikey.middleware';
import { db } from '../db';
import { LoggerService } from '../services/logger.service';

const router = Router();

// Apply authentication to all API key routes
router.use(requireAuth);

// Available scopes for API keys
const AVAILABLE_SCOPES = [
  'files:read',      // list, download, search files
  'files:write',     // upload, rename, move, copy
  'files:delete',    // delete files (to trash)
  'folders:read',    // list folders
  'folders:write',   // create, rename, move folders
  'shares:read',     // list shares
  'shares:write',    // create, delete shares
  'admin'            // admin operations (requires admin user role)
] as const;

// Validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(AVAILABLE_SCOPES)).min(1),
  expiresInDays: z.number().min(1).max(365).optional()
});

const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100)
});

/**
 * GET /api/developer/keys - List user's API keys
 */
router.get('/keys', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const stmt = db.prepare(`
      SELECT id, name, key_prefix, scopes, last_used_at, expires_at, created_at, is_active
      FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
    `);

    const keys = stmt.all(userId) as any[];

    const response = keys.map(key => ({
      id: key.id,
      name: key.name,
      prefix: key.key_prefix,
      scopes: JSON.parse(key.scopes),
      lastUsedAt: key.last_used_at,
      expiresAt: key.expires_at,
      createdAt: key.created_at,
      isActive: Boolean(key.is_active)
    }));

    res.json({
      success: true,
      data: response,
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('apikeys', 'Failed to list API keys', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve API keys',
        details: {}
      }
    });
  }
});

/**
 * POST /api/developer/keys - Create new API key
 */
router.post('/keys', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;

    // Validate request body
    const validation = createApiKeySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validation.error.errors
        }
      });
    }

    const { name, scopes, expiresInDays } = validation.data;

    // Check if user is trying to create admin scope without admin role
    if (scopes.includes('admin') && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin role required to create API keys with admin scope',
          details: {}
        }
      });
    }

    // Check if user already has too many API keys (limit: 10)
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE user_id = ? AND is_active = 1');
    const { count } = countStmt.get(userId) as { count: number };

    if (count >= 10) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: 'Maximum number of API keys reached (10)',
          details: {}
        }
      });
    }

    // Generate API key
    const { key, hash, prefix } = generateApiKey();
    const keyId = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    const expiresAt = expiresInDays ? now + (expiresInDays * 24 * 60 * 60 * 1000) : null;

    // Insert into database
    const insertStmt = db.prepare(`
      INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes, expires_at, created_at, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    insertStmt.run(keyId, userId, name, hash, prefix, JSON.stringify(scopes), expiresAt, now);

    LoggerService.info('apikeys', 'API key created', userId, { 
      keyId, 
      name, 
      scopes,
      expiresAt 
    });

    res.status(201).json({
      success: true,
      data: {
        id: keyId,
        key: key, // ⚠️ Raw key returned ONCE only, never stored
        name,
        prefix,
        scopes,
        expiresAt,
        createdAt: now
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('apikeys', 'Failed to create API key', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to create API key',
        details: {}
      }
    });
  }
});

/**
 * DELETE /api/developer/keys/:id - Revoke API key
 */
router.delete('/keys/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const keyId = req.params.id;

    // Verify key belongs to user
    const selectStmt = db.prepare('SELECT id, name FROM api_keys WHERE id = ? AND user_id = ?');
    const existingKey = selectStmt.get(keyId, userId) as any;

    if (!existingKey) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found',
          details: {}
        }
      });
    }

    // Soft delete (deactivate) the key
    const updateStmt = db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ?');
    const result = updateStmt.run(keyId, userId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found',
          details: {}
        }
      });
    }

    LoggerService.info('apikeys', 'API key revoked', userId, { 
      keyId, 
      name: existingKey.name 
    });

    res.json({
      success: true,
      data: {
        message: 'API key revoked successfully'
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('apikeys', 'Failed to revoke API key', req.user?.id, { 
      error: (error as Error).message,
      keyId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to revoke API key',
        details: {}
      }
    });
  }
});

/**
 * PATCH /api/developer/keys/:id - Update API key name
 */
router.patch('/keys/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const keyId = req.params.id;

    // Validate request body
    const validation = updateApiKeySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validation.error.errors
        }
      });
    }

    const { name } = validation.data;

    // Verify key belongs to user and update
    const updateStmt = db.prepare('UPDATE api_keys SET name = ? WHERE id = ? AND user_id = ? AND is_active = 1');
    const result = updateStmt.run(name, keyId, userId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found',
          details: {}
        }
      });
    }

    LoggerService.info('apikeys', 'API key updated', userId, { 
      keyId, 
      newName: name 
    });

    res.json({
      success: true,
      data: {
        message: 'API key updated successfully'
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('apikeys', 'Failed to update API key', req.user?.id, { 
      error: (error as Error).message,
      keyId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update API key',
        details: {}
      }
    });
  }
});

/**
 * GET /api/developer/scopes - Get available API scopes
 */
router.get('/scopes', async (req: Request, res: Response) => {
  try {
    const userRole = req.user!.role;

    const scopes = AVAILABLE_SCOPES.map(scope => ({
      name: scope,
      description: getScopeDescription(scope),
      requiresAdmin: scope === 'admin'
    })).filter(scope => {
      // Filter out admin scope for non-admin users
      return userRole === 'admin' || scope.name !== 'admin';
    });

    res.json({
      success: true,
      data: scopes,
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('apikeys', 'Failed to get scopes', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve scopes',
        details: {}
      }
    });
  }
});

/**
 * GET /api/developer/usage/:keyId - Get API key usage statistics
 */
router.get('/usage/:keyId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const keyId = req.params.keyId;

    // Verify key belongs to user
    const keyStmt = db.prepare('SELECT id FROM api_keys WHERE id = ? AND user_id = ?');
    const keyExists = keyStmt.get(keyId, userId);

    if (!keyExists) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found',
          details: {}
        }
      });
    }

    // Get usage statistics
    const usageStmt = db.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status >= 200 AND status < 300 THEN 1 END) as successful_requests,
        COUNT(CASE WHEN status >= 400 THEN 1 END) as error_requests,
        MIN(timestamp) as first_used,
        MAX(timestamp) as last_used
      FROM api_key_usage 
      WHERE api_key_id = ?
    `);

    const usage = usageStmt.get(keyId) as any;

    // Get recent usage (last 24 hours)
    const recentStmt = db.prepare(`
      SELECT endpoint, method, COUNT(*) as count
      FROM api_key_usage 
      WHERE api_key_id = ? AND timestamp > ?
      GROUP BY endpoint, method
      ORDER BY count DESC
      LIMIT 10
    `);

    const recentUsage = recentStmt.all(keyId, Date.now() - 24 * 60 * 60 * 1000) as any[];

    res.json({
      success: true,
      data: {
        totalRequests: usage.total_requests || 0,
        successfulRequests: usage.successful_requests || 0,
        errorRequests: usage.error_requests || 0,
        firstUsed: usage.first_used,
        lastUsed: usage.last_used,
        recentEndpoints: recentUsage
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('apikeys', 'Failed to get API key usage', req.user?.id, { 
      error: (error as Error).message,
      keyId: req.params.keyId 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve usage statistics',
        details: {}
      }
    });
  }
});

/**
 * Get human-readable description for API scope
 */
function getScopeDescription(scope: string): string {
  const descriptions: Record<string, string> = {
    'files:read': 'List, download, and search files',
    'files:write': 'Upload, rename, move, and copy files',
    'files:delete': 'Delete files (move to trash)',
    'folders:read': 'List and browse folders',
    'folders:write': 'Create, rename, and move folders',
    'shares:read': 'View shared files and folders',
    'shares:write': 'Create and manage file shares',
    'admin': 'Full administrative access'
  };

  return descriptions[scope] || 'Unknown scope';
}

export default router;