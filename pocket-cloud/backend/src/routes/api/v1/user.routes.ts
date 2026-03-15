import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { ApiKeyRequest } from '../../../middleware/apikey.middleware';
import { db } from '../../../db';
import { LoggerService } from '../../../services/logger.service';

const router = Router();

/**
 * GET /api/v1/user - Get current user info
 */
router.get('/', async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const stmt = db.prepare(`
      SELECT id, username, email, role, created_at, last_login_at
      FROM users
      WHERE id = ?
    `);

    const user = stmt.get(userId) as any;

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
          details: {}
        }
      });
    }

    // Get storage usage
    const storageStmt = db.prepare(`
      SELECT COALESCE(SUM(size), 0) as used_bytes
      FROM files
      WHERE owner_id = ? AND is_deleted = 0
    `);

    const { used_bytes } = storageStmt.get(userId) as { used_bytes: number };

    // Get file counts
    const countsStmt = db.prepare(`
      SELECT 
        COUNT(*) as total_files,
        COUNT(CASE WHEN is_encrypted = 1 THEN 1 END) as encrypted_files
      FROM files
      WHERE owner_id = ? AND is_deleted = 0
    `);

    const counts = countsStmt.get(userId) as any;

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        authMethod: req.user!.authMethod,
        storage: {
          usedBytes: used_bytes,
          totalFiles: counts.total_files,
          encryptedFiles: counts.encrypted_files
        }
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-user', 'Failed to get user info', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve user information',
        details: {}
      }
    });
  }
});

export default router;