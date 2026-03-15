import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createReadStream, statSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { requireScope, ApiKeyRequest } from '../../../middleware/apikey.middleware';
import { db } from '../../../db';
import { LoggerService } from '../../../services/logger.service';

const router = Router();

// Validation schemas
const moveFileSchema = z.object({
  folderId: z.string().optional(),
  name: z.string().min(1).max(255).optional()
});

const copyFileSchema = z.object({
  folderId: z.string().optional(),
  name: z.string().min(1).max(255)
});

/**
 * GET /api/v1/files - List files
 */
router.get('/', requireScope('files:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { folderId, limit = 50, offset = 0, sort = 'name', order = 'asc' } = req.query;

    // Validate query parameters
    const limitNum = Math.min(parseInt(limit as string) || 50, 1000);
    const offsetNum = parseInt(offset as string) || 0;
    const sortField = ['name', 'size', 'created_at', 'updated_at'].includes(sort as string) ? sort : 'name';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

    let whereClause = 'owner_id = ? AND is_deleted = 0';
    const params: any[] = [userId];

    if (folderId) {
      whereClause += ' AND folder_id = ?';
      params.push(folderId);
    } else {
      whereClause += ' AND folder_id IS NULL';
    }

    const stmt = db.prepare(`
      SELECT id, name, size, mime_type, folder_id, created_at, updated_at, is_encrypted
      FROM files
      WHERE ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT ? OFFSET ?
    `);

    const files = stmt.all(...params, limitNum, offsetNum) as any[];

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM files WHERE ${whereClause}`);
    const { count } = countStmt.get(...params) as { count: number };

    const response = files.map(file => ({
      id: file.id,
      name: file.name,
      size: file.size,
      mimeType: file.mime_type,
      folderId: file.folder_id,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      isEncrypted: Boolean(file.is_encrypted),
      downloadUrl: `/api/v1/files/${file.id}/download`,
      previewUrl: file.mime_type?.startsWith('image/') ? `/api/v1/files/${file.id}/preview` : null
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
    LoggerService.error('api-files', 'Failed to list files', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve files',
        details: {}
      }
    });
  }
});

/**
 * GET /api/v1/files/:id - Get file metadata
 */
router.get('/:id', requireScope('files:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const fileId = req.params.id;

    const stmt = db.prepare(`
      SELECT id, name, size, mime_type, folder_id, created_at, updated_at, is_encrypted, encryption_hint
      FROM files
      WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `);

    const file = stmt.get(fileId, userId) as any;

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

    res.json({
      success: true,
      data: {
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mime_type,
        folderId: file.folder_id,
        createdAt: file.created_at,
        updatedAt: file.updated_at,
        isEncrypted: Boolean(file.is_encrypted),
        encryptionHint: file.encryption_hint,
        downloadUrl: `/api/v1/files/${file.id}/download`,
        previewUrl: file.mime_type?.startsWith('image/') ? `/api/v1/files/${file.id}/preview` : null
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-files', 'Failed to get file', req.user?.id, { 
      error: (error as Error).message,
      fileId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve file',
        details: {}
      }
    });
  }
});

/**
 * GET /api/v1/files/:id/download - Download file
 */
router.get('/:id/download', requireScope('files:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const fileId = req.params.id;

    const stmt = db.prepare(`
      SELECT id, name, size, mime_type, storage_path
      FROM files
      WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `);

    const file = stmt.get(fileId, userId) as any;

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

    const filePath = join(process.env.STORAGE_PATH || '/mnt/pocketcloud/files', file.storage_path);

    try {
      const stats = statSync(filePath);
      
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
      
      // Support range requests for large files
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        
        if (start >= stats.size || end >= stats.size) {
          res.status(416).json({
            success: false,
            error: {
              code: 'RANGE_NOT_SATISFIABLE',
              message: 'Requested range not satisfiable',
              details: {}
            }
          });
          return;
        }
        
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', end - start + 1);
        
        const stream = createReadStream(filePath, { start, end });
        stream.pipe(res);
      } else {
        const stream = createReadStream(filePath);
        stream.pipe(res);
      }
    } catch (fsError) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found on disk',
          details: {}
        }
      });
    }
  } catch (error) {
    LoggerService.error('api-files', 'Failed to download file', req.user?.id, { 
      error: (error as Error).message,
      fileId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to download file',
        details: {}
      }
    });
  }
});

/**
 * PATCH /api/v1/files/:id - Update file (move/rename)
 */
router.patch('/:id', requireScope('files:write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const fileId = req.params.id;

    // Validate request body
    const validation = moveFileSchema.safeParse(req.body);
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

    const { folderId, name } = validation.data;

    // Check if file exists and belongs to user
    const fileStmt = db.prepare(`
      SELECT id, name, folder_id
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

    // If moving to a folder, verify folder exists and belongs to user
    if (folderId) {
      const folderStmt = db.prepare(`
        SELECT id FROM folders
        WHERE id = ? AND owner_id = ? AND is_deleted = 0
      `);

      const folder = folderStmt.get(folderId, userId);

      if (!folder) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Target folder not found',
            details: {}
          }
        });
      }
    }

    // Check for name conflicts if renaming or moving
    const newName = name || file.name;
    const newFolderId = folderId !== undefined ? folderId : file.folder_id;

    if (newName !== file.name || newFolderId !== file.folder_id) {
      const conflictStmt = db.prepare(`
        SELECT id FROM files
        WHERE name = ? AND folder_id ${newFolderId ? '= ?' : 'IS NULL'} AND owner_id = ? AND is_deleted = 0 AND id != ?
      `);

      const params = newFolderId 
        ? [newName, newFolderId, userId, fileId]
        : [newName, userId, fileId];

      const conflict = conflictStmt.get(...params);

      if (conflict) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'A file with this name already exists in the target location',
            details: {}
          }
        });
      }
    }

    // Update file
    const updateStmt = db.prepare(`
      UPDATE files
      SET name = ?, folder_id = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `);

    updateStmt.run(newName, newFolderId, Date.now(), fileId, userId);

    LoggerService.info('api-files', 'File updated', userId, { 
      fileId,
      oldName: file.name,
      newName,
      oldFolderId: file.folder_id,
      newFolderId
    });

    res.json({
      success: true,
      data: {
        message: 'File updated successfully'
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-files', 'Failed to update file', req.user?.id, { 
      error: (error as Error).message,
      fileId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update file',
        details: {}
      }
    });
  }
});

/**
 * POST /api/v1/files/:id/copy - Copy file
 */
router.post('/:id/copy', requireScope('files:write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const fileId = req.params.id;

    // Validate request body
    const validation = copyFileSchema.safeParse(req.body);
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

    const { folderId, name } = validation.data;

    // Get original file
    const fileStmt = db.prepare(`
      SELECT id, name, size, mime_type, storage_path, is_encrypted, encryption_hint
      FROM files
      WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `);

    const originalFile = fileStmt.get(fileId, userId) as any;

    if (!originalFile) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'File not found',
          details: {}
        }
      });
    }

    // Verify target folder if specified
    if (folderId) {
      const folderStmt = db.prepare(`
        SELECT id FROM folders
        WHERE id = ? AND owner_id = ? AND is_deleted = 0
      `);

      const folder = folderStmt.get(folderId, userId);

      if (!folder) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Target folder not found',
            details: {}
          }
        });
      }
    }

    // Check for name conflicts
    const conflictStmt = db.prepare(`
      SELECT id FROM files
      WHERE name = ? AND folder_id ${folderId ? '= ?' : 'IS NULL'} AND owner_id = ? AND is_deleted = 0
    `);

    const params = folderId ? [name, folderId, userId] : [name, userId];
    const conflict = conflictStmt.get(...params);

    if (conflict) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A file with this name already exists in the target location',
          details: {}
        }
      });
    }

    // Create copy (this is a simplified version - in production you'd copy the actual file)
    const newFileId = crypto.randomBytes(16).toString('hex');
    const now = Date.now();

    const insertStmt = db.prepare(`
      INSERT INTO files (id, owner_id, name, size, mime_type, folder_id, storage_path, is_encrypted, encryption_hint, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      newFileId,
      userId,
      name,
      originalFile.size,
      originalFile.mime_type,
      folderId || null,
      originalFile.storage_path, // In production, copy to new path
      originalFile.is_encrypted,
      originalFile.encryption_hint,
      now,
      now
    );

    LoggerService.info('api-files', 'File copied', userId, { 
      originalFileId: fileId,
      newFileId,
      name,
      folderId
    });

    res.status(201).json({
      success: true,
      data: {
        id: newFileId,
        message: 'File copied successfully'
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-files', 'Failed to copy file', req.user?.id, { 
      error: (error as Error).message,
      fileId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to copy file',
        details: {}
      }
    });
  }
});

/**
 * DELETE /api/v1/files/:id - Delete file (move to trash)
 */
router.delete('/:id', requireScope('files:delete'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const fileId = req.params.id;

    // Check if file exists and belongs to user
    const fileStmt = db.prepare(`
      SELECT id, name FROM files
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

    // Move to trash (soft delete)
    const updateStmt = db.prepare(`
      UPDATE files
      SET is_deleted = 1, deleted_at = ?
      WHERE id = ? AND owner_id = ?
    `);

    updateStmt.run(Date.now(), fileId, userId);

    LoggerService.info('api-files', 'File deleted', userId, { 
      fileId,
      name: file.name
    });

    res.json({
      success: true,
      data: {
        message: 'File moved to trash successfully'
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-files', 'Failed to delete file', req.user?.id, { 
      error: (error as Error).message,
      fileId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to delete file',
        details: {}
      }
    });
  }
});

export default router;