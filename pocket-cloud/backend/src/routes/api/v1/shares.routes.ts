import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { requireScope, ApiKeyRequest } from '../../../middleware/apikey.middleware';
import { db } from '../../../db';
import { LoggerService } from '../../../services/logger.service';

const router = Router();

// Validation schemas
const createShareSchema = z.object({
  fileId: z.string(),
  expiresAt: z.number().optional(),
  password: z.string().optional(),
  allowDownload: z.boolean().optional().default(true),
  allowPreview: z.boolean().optional().default(true)
});

/**
 * GET /api/v1/shares - List user's shares
 */
router.get('/', requireScope('shares:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { limit = 50, offset = 0 } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 50, 1000);
    const offsetNum = parseInt(offset as string) || 0;

    const stmt = db.prepare(`
      SELECT s.id, s.file_id, s.token, s.expires_at, s.password_hash, s.allow_download, s.allow_preview, 
             s.download_count, s.created_at, f.name as file_name, f.size as file_size, f.mime_type
      FROM shares s
      JOIN files f ON s.file_id = f.id
      WHERE s.owner_id = ? AND s.is_active = 1
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `);

    const shares = stmt.all(userId, limitNum, offsetNum) as any[];

    const countStmt = db.prepare('SELECT COUNT(*) as count FROM shares WHERE owner_id = ? AND is_active = 1');
    const { count } = countStmt.get(userId) as { count: number };

    const response = shares.map(share => ({
      id: share.id,
      fileId: share.file_id,
      fileName: share.file_name,
      fileSize: share.file_size,
      mimeType: share.mime_type,
      token: share.token,
      shareUrl: `${req.protocol}://${req.get('host')}/share/${share.token}`,
      expiresAt: share.expires_at,
      hasPassword: Boolean(share.password_hash),
      allowDownload: Boolean(share.allow_download),
      allowPreview: Boolean(share.allow_preview),
      downloadCount: share.download_count,
      createdAt: share.created_at
    }));

    res.json({
      success: true,
      data: response,
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0',
        pagination: {
          total: count,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < count
        }
      }
    });
  } catch (error) {
    LoggerService.error('api-shares', 'Failed to list shares', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve shares',
        details: {}
      }
    });
  }
});

/**
 * POST /api/v1/shares - Create new share
 */
router.post('/', requireScope('shares:write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Validate request body
    const validation = createShareSchema.safeParse(req.body);
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

    const { fileId, expiresAt, password, allowDownload, allowPreview } = validation.data;

    // Verify file exists and belongs to user
    const fileStmt = db.prepare(`
      SELECT id, name, size, mime_type
      FROM files
      WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `);

    const file = fileStmt.get(fileId, userId) as any;

    if (!file) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
          details: {}
        }
      });
    }

    // Generate share token
    const shareId = crypto.randomBytes(16).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');
    const passwordHash = password ? crypto.createHash('sha256').update(password).digest('hex') : null;
    const now = Date.now();

    // Create share
    const insertStmt = db.prepare(`
      INSERT INTO shares (id, owner_id, file_id, token, expires_at, password_hash, allow_download, allow_preview, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      shareId,
      userId,
      fileId,
      token,
      expiresAt || null,
      passwordHash,
      allowDownload ? 1 : 0,
      allowPreview ? 1 : 0,
      now
    );

    LoggerService.info('api-shares', 'Share created', userId, { 
      shareId,
      fileId,
      fileName: file.name,
      expiresAt
    });

    res.status(201).json({
      success: true,
      data: {
        id: shareId,
        fileId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.mime_type,
        token,
        shareUrl: `${req.protocol}://${req.get('host')}/share/${token}`,
        expiresAt,
        hasPassword: Boolean(password),
        allowDownload,
        allowPreview,
        downloadCount: 0,
        createdAt: now
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-shares', 'Failed to create share', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to create share',
        details: {}
      }
    });
  }
});

/**
 * DELETE /api/v1/shares/:id - Delete share
 */
router.delete('/:id', requireScope('shares:write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const shareId = req.params.id;

    // Verify share exists and belongs to user
    const shareStmt = db.prepare(`
      SELECT id FROM shares
      WHERE id = ? AND owner_id = ? AND is_active = 1
    `);

    const share = shareStmt.get(shareId, userId);

    if (!share) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Share not found',
          details: {}
        }
      });
    }

    // Deactivate share
    const updateStmt = db.prepare('UPDATE shares SET is_active = 0 WHERE id = ? AND owner_id = ?');
    updateStmt.run(shareId, userId);

    LoggerService.info('api-shares', 'Share deleted', userId, { shareId });

    res.json({
      success: true,
      data: {
        message: 'Share deleted successfully'
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-shares', 'Failed to delete share', req.user?.id, { 
      error: (error as Error).message,
      shareId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to delete share',
        details: {}
      }
    });
  }
});

export default router;