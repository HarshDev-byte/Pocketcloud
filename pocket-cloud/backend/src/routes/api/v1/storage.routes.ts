import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireScope, ApiKeyRequest } from '../../../middleware/apikey.middleware';
import { db } from '../../../db';
import { LoggerService } from '../../../services/logger.service';

const router = Router();

/**
 * GET /api/v1/storage - Get storage information
 */
router.get('/', requireScope('files:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get user storage usage
    const userStorageStmt = db.prepare(`
      SELECT 
        COALESCE(SUM(size), 0) as used_bytes,
        COUNT(*) as total_files
      FROM files
      WHERE owner_id = ? AND is_deleted = 0
    `);

    const userStorage = userStorageStmt.get(userId) as any;

    // Get storage by file type
    const typeStmt = db.prepare(`
      SELECT 
        CASE 
          WHEN mime_type LIKE 'image/%' THEN 'images'
          WHEN mime_type LIKE 'video/%' THEN 'videos'
          WHEN mime_type LIKE 'audio/%' THEN 'audio'
          WHEN mime_type LIKE 'text/%' OR mime_type = 'application/pdf' THEN 'documents'
          ELSE 'other'
        END as category,
        COALESCE(SUM(size), 0) as bytes,
        COUNT(*) as count
      FROM files
      WHERE owner_id = ? AND is_deleted = 0
      GROUP BY category
    `);

    const typeBreakdown = typeStmt.all(userId) as any[];

    // Get recent uploads (last 30 days)
    const recentStmt = db.prepare(`
      SELECT 
        DATE(created_at / 1000, 'unixepoch') as date,
        COUNT(*) as files,
        COALESCE(SUM(size), 0) as bytes
      FROM files
      WHERE owner_id = ? AND is_deleted = 0 AND created_at > ?
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `);

    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentUploads = recentStmt.all(userId, thirtyDaysAgo) as any[];

    // Get largest files
    const largestStmt = db.prepare(`
      SELECT id, name, size, mime_type, created_at
      FROM files
      WHERE owner_id = ? AND is_deleted = 0
      ORDER BY size DESC
      LIMIT 10
    `);

    const largestFiles = largestStmt.all(userId) as any[];

    // System storage info (admin only)
    let systemStorage = null;
    if (req.user!.role === 'admin') {
      try {
        const { statSync } = require('fs');
        const storagePath = process.env.STORAGE_PATH || '/mnt/pocketcloud';
        const stats = statSync(storagePath);
        
        // This is simplified - in reality you'd use statvfs or similar
        systemStorage = {
          totalBytes: 1000 * 1024 * 1024 * 1024, // 1TB placeholder
          usedBytes: 500 * 1024 * 1024 * 1024,   // 500GB placeholder
          freeBytes: 500 * 1024 * 1024 * 1024    // 500GB placeholder
        };
      } catch (error) {
        // Ignore system storage errors
      }
    }

    res.json({
      success: true,
      data: {
        user: {
          usedBytes: userStorage.used_bytes,
          totalFiles: userStorage.total_files,
          breakdown: typeBreakdown.reduce((acc: any, item: any) => {
            acc[item.category] = {
              bytes: item.bytes,
              count: item.count
            };
            return acc;
          }, {})
        },
        recentActivity: recentUploads,
        largestFiles: largestFiles.map((file: any) => ({
          id: file.id,
          name: file.name,
          size: file.size,
          mimeType: file.mime_type,
          createdAt: file.created_at
        })),
        system: systemStorage
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-storage', 'Failed to get storage info', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve storage information',
        details: {}
      }
    });
  }
});

/**
 * GET /api/v1/storage/quota - Get storage quota information
 */
router.get('/quota', requireScope('files:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get current usage
    const usageStmt = db.prepare(`
      SELECT COALESCE(SUM(size), 0) as used_bytes
      FROM files
      WHERE owner_id = ? AND is_deleted = 0
    `);

    const { used_bytes } = usageStmt.get(userId) as { used_bytes: number };

    // Default quota (could be stored per user in database)
    const quotaBytes = 100 * 1024 * 1024 * 1024; // 100GB default
    const remainingBytes = quotaBytes - used_bytes;
    const usagePercent = Math.round((used_bytes / quotaBytes) * 100);

    res.json({
      success: true,
      data: {
        quotaBytes,
        usedBytes: used_bytes,
        remainingBytes: Math.max(0, remainingBytes),
        usagePercent: Math.min(100, usagePercent),
        isNearLimit: usagePercent > 90,
        isOverLimit: used_bytes > quotaBytes
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-storage', 'Failed to get quota info', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve quota information',
        details: {}
      }
    });
  }
});

export default router;