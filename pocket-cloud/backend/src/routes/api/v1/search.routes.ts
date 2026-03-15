import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { requireScope, ApiKeyRequest } from '../../../middleware/apikey.middleware';
import { db } from '../../../db';
import { LoggerService } from '../../../services/logger.service';

const router = Router();

// Validation schemas
const searchSchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(['files', 'folders', 'all']).optional().default('all'),
  mimeType: z.string().optional(),
  folderId: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0)
});

/**
 * GET /api/v1/search - Search files and folders
 */
router.get('/', requireScope('files:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Validate query parameters
    const validation = searchSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid search parameters',
          details: validation.error.errors
        }
      });
    }

    const { q, type, mimeType, folderId, limit, offset } = validation.data;

    const results: any[] = [];
    let totalCount = 0;

    // Search files
    if (type === 'files' || type === 'all') {
      let fileWhereClause = 'owner_id = ? AND is_deleted = 0 AND name LIKE ?';
      const fileParams: any[] = [userId, `%${q}%`];

      if (mimeType) {
        fileWhereClause += ' AND mime_type LIKE ?';
        fileParams.push(`${mimeType}%`);
      }

      if (folderId) {
        fileWhereClause += ' AND folder_id = ?';
        fileParams.push(folderId);
      }

      const fileStmt = db.prepare(`
        SELECT id, name, size, mime_type, folder_id, created_at, updated_at, is_encrypted, 'file' as type
        FROM files
        WHERE ${fileWhereClause}
        ORDER BY name ASC
        LIMIT ? OFFSET ?
      `);

      const files = fileStmt.all(...fileParams, limit, offset) as any[];
      
      const fileCountStmt = db.prepare(`SELECT COUNT(*) as count FROM files WHERE ${fileWhereClause}`);
      const fileCount = (fileCountStmt.get(...fileParams) as { count: number }).count;

      results.push(...files.map(file => ({
        id: file.id,
        name: file.name,
        type: 'file',
        size: file.size,
        mimeType: file.mime_type,
        folderId: file.folder_id,
        createdAt: file.created_at,
        updatedAt: file.updated_at,
        isEncrypted: Boolean(file.is_encrypted),
        downloadUrl: `/api/v1/files/${file.id}/download`
      })));

      totalCount += fileCount;
    }

    // Search folders
    if (type === 'folders' || type === 'all') {
      let folderWhereClause = 'owner_id = ? AND is_deleted = 0 AND name LIKE ?';
      const folderParams: any[] = [userId, `%${q}%`];

      if (folderId) {
        folderWhereClause += ' AND parent_id = ?';
        folderParams.push(folderId);
      }

      const folderStmt = db.prepare(`
        SELECT id, name, parent_id, created_at, updated_at, is_vault, 'folder' as type
        FROM folders
        WHERE ${folderWhereClause}
        ORDER BY name ASC
        LIMIT ? OFFSET ?
      `);

      const folders = folderStmt.all(...folderParams, limit, offset) as any[];
      
      const folderCountStmt = db.prepare(`SELECT COUNT(*) as count FROM folders WHERE ${folderWhereClause}`);
      const folderCount = (folderCountStmt.get(...folderParams) as { count: number }).count;

      results.push(...folders.map(folder => ({
        id: folder.id,
        name: folder.name,
        type: 'folder',
        parentId: folder.parent_id,
        createdAt: folder.created_at,
        updatedAt: folder.updated_at,
        isVault: Boolean(folder.is_vault)
      })));

      totalCount += folderCount;
    }

    // Sort combined results by name
    results.sort((a, b) => a.name.localeCompare(b.name));

    LoggerService.info('api-search', 'Search performed', userId, { 
      query: q,
      type,
      resultCount: results.length
    });

    res.json({
      success: true,
      data: results.slice(0, limit),
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0',
        search: {
          query: q,
          type,
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        }
      }
    });
  } catch (error) {
    LoggerService.error('api-search', 'Search failed', req.user?.id, { 
      error: (error as Error).message,
      query: req.query.q
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Search failed',
        details: {}
      }
    });
  }
});

/**
 * GET /api/v1/search/suggestions - Get search suggestions
 */
router.get('/suggestions', requireScope('files:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.json({
        success: true,
        data: [],
        meta: {
          requestId: crypto.randomBytes(8).toString('hex'),
          timestamp: Date.now(),
          version: '1.0'
        }
      });
    }

    // Get file name suggestions
    const fileStmt = db.prepare(`
      SELECT DISTINCT name
      FROM files
      WHERE owner_id = ? AND is_deleted = 0 AND name LIKE ?
      ORDER BY name ASC
      LIMIT 10
    `);

    const fileSuggestions = fileStmt.all(userId, `${q}%`) as { name: string }[];

    // Get folder name suggestions
    const folderStmt = db.prepare(`
      SELECT DISTINCT name
      FROM folders
      WHERE owner_id = ? AND is_deleted = 0 AND name LIKE ?
      ORDER BY name ASC
      LIMIT 10
    `);

    const folderSuggestions = folderStmt.all(userId, `${q}%`) as { name: string }[];

    // Combine and deduplicate
    const allSuggestions = [...fileSuggestions, ...folderSuggestions];
    const uniqueSuggestions = Array.from(new Set(allSuggestions.map(s => s.name)))
      .slice(0, 10);

    res.json({
      success: true,
      data: uniqueSuggestions,
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-search', 'Failed to get suggestions', req.user?.id, { 
      error: (error as Error).message,
      query: req.query.q
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to get search suggestions',
        details: {}
      }
    });
  }
});

export default router;