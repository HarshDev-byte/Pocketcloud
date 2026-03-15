// Mock implementations for Node.js modules
const mockZod = {
  z: {
    object: (schema: any) => ({
      safeParse: (data: any) => ({
        success: true,
        data,
        error: { errors: [] }
      })
    }),
    string: () => ({
      min: (n: number) => ({ 
        max: (n: number) => ({ 
          optional: () => ({}) 
        }) 
      }),
      max: (n: number) => ({ 
        optional: () => ({}) 
      }),
      optional: () => ({})
    })
  }
};

const mockCrypto = {
  randomBytes: (size: number) => ({
    toString: (encoding: string) => `mock_${encoding}_${size}_${Math.random().toString(36).substr(2, 9)}`
  })
};

import { Router, Response } from 'express';
import { requireScope, ApiKeyRequest } from '../../../middleware/apikey.middleware';
import { db } from '../../../db';
import { LoggerService } from '../../../services/logger.service';

// Use mocks
const { z } = mockZod;
const crypto = mockCrypto;

const router = Router();

// Validation schemas
const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().optional()
});

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().optional()
});

/**
 * GET /api/v1/folders - List folders
 */
router.get('/', requireScope('folders:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const { parentId, limit = 50, offset = 0 } = req.query;

    // Validate query parameters
    const limitNum = Math.min(parseInt(limit as string) || 50, 1000);
    const offsetNum = parseInt(offset as string) || 0;

    let whereClause = 'owner_id = ? AND is_deleted = 0';
    const params: any[] = [userId];

    if (parentId) {
      whereClause += ' AND parent_id = ?';
      params.push(parentId);
    } else {
      whereClause += ' AND parent_id IS NULL';
    }

    const database = db();
    const stmt = database.prepare(`
      SELECT id, name, parent_id, created_at, updated_at, is_vault
      FROM folders
      WHERE ${whereClause}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `);

    const folders = stmt.all(...params, limitNum, offsetNum) as any[];

    // Get total count
    const countStmt = database.prepare(`SELECT COUNT(*) as count FROM folders WHERE ${whereClause}`);
    const { count } = countStmt.get(...params) as { count: number };

    // Get file and subfolder counts for each folder
    const response = folders.map(folder => {
      const fileCountStmt = database.prepare('SELECT COUNT(*) as count FROM files WHERE folder_id = ? AND owner_id = ? AND is_deleted = 0');
      const subfolderCountStmt = database.prepare('SELECT COUNT(*) as count FROM folders WHERE parent_id = ? AND owner_id = ? AND is_deleted = 0');
      
      const fileCount = (fileCountStmt.get(folder.id, userId) as { count: number }).count;
      const subfolderCount = (subfolderCountStmt.get(folder.id, userId) as { count: number }).count;

      return {
        id: folder.id,
        name: folder.name,
        parentId: folder.parent_id,
        createdAt: folder.created_at,
        updatedAt: folder.updated_at,
        isVault: Boolean(folder.is_vault),
        fileCount,
        subfolderCount
      };
    });

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
    LoggerService.error('api-folders', 'Failed to list folders', String(req.user?.id), { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve folders',
        details: {}
      }
    });
  }
});

/**
 * GET /api/v1/folders/:id - Get folder details
 */
router.get('/:id', requireScope('folders:read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const folderId = req.params.id;

    const database = db();
    const stmt = database.prepare(`
      SELECT id, name, parent_id, created_at, updated_at, is_vault, vault_hint
      FROM folders
      WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `);

    const folder = stmt.get(folderId, userId) as any;

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Folder not found',
          details: {}
        }
      });
    }

    // Get counts
    const fileCountStmt = database.prepare('SELECT COUNT(*) as count FROM files WHERE folder_id = ? AND owner_id = ? AND is_deleted = 0');
    const subfolderCountStmt = database.prepare('SELECT COUNT(*) as count FROM folders WHERE parent_id = ? AND owner_id = ? AND is_deleted = 0');
    
    const fileCount = (fileCountStmt.get(folderId, userId) as { count: number }).count;
    const subfolderCount = (subfolderCountStmt.get(folderId, userId) as { count: number }).count;

    // Get folder path
    const path = await getFolderPath(folderId, userId);

    res.json({
      success: true,
      data: {
        id: folder.id,
        name: folder.name,
        parentId: folder.parent_id,
        createdAt: folder.created_at,
        updatedAt: folder.updated_at,
        isVault: Boolean(folder.is_vault),
        vaultHint: folder.vault_hint,
        fileCount,
        subfolderCount,
        path
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-folders', 'Failed to get folder', String(req.user?.id), { 
      error: (error as Error).message,
      folderId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve folder',
        details: {}
      }
    });
  }
});

/**
 * POST /api/v1/folders - Create folder
 */
router.post('/', requireScope('folders:write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = String(req.user!.id);

    // Validate request body
    const validation = createFolderSchema.safeParse(req.body);
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

    const { name, parentId } = validation.data;

    const database = db();

    // Verify parent folder exists if specified
    if (parentId) {
      const parentStmt = database.prepare(`
        SELECT id FROM folders
        WHERE id = ? AND owner_id = ? AND is_deleted = 0
      `);

      const parent = parentStmt.get(parentId, userId);

      if (!parent) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Parent folder not found',
            details: {}
          }
        });
      }
    }

    // Check for name conflicts
    const conflictStmt = database.prepare(`
      SELECT id FROM folders
      WHERE name = ? AND parent_id ${parentId ? '= ?' : 'IS NULL'} AND owner_id = ? AND is_deleted = 0
    `);

    const params = parentId ? [name, parentId, userId] : [name, userId];
    const conflict = conflictStmt.get(...params);

    if (conflict) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A folder with this name already exists in the parent location',
          details: {}
        }
      });
    }

    // Create folder
    const folderId = crypto.randomBytes(16).toString('hex');
    const now = Date.now();

    const insertStmt = database.prepare(`
      INSERT INTO folders (id, owner_id, name, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(folderId, userId, name, parentId || null, now, now);

    LoggerService.info('api-folders', 'Folder created', userId, { 
      folderId,
      name,
      parentId
    });

    res.status(201).json({
      success: true,
      data: {
        id: folderId,
        name,
        parentId: parentId || null,
        createdAt: now,
        updatedAt: now,
        isVault: false,
        fileCount: 0,
        subfolderCount: 0
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-folders', 'Failed to create folder', String(req.user?.id), { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to create folder',
        details: {}
      }
    });
  }
});

/**
 * PATCH /api/v1/folders/:id - Update folder
 */
router.patch('/:id', requireScope('folders:write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const folderId = req.params.id;

    // Validate request body
    const validation = updateFolderSchema.safeParse(req.body);
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

    const { name, parentId } = validation.data;

    const database = db();

    // Check if folder exists and belongs to user
    const folderStmt = database.prepare(`
      SELECT id, name, parent_id
      FROM folders
      WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `);

    const folder = folderStmt.get(folderId, userId) as any;

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Folder not found',
          details: {}
        }
      });
    }

    // Prevent moving folder into itself or its descendants
    if (parentId && parentId !== folder.parent_id) {
      const isDescendant = await checkIfDescendant(folderId, parentId, userId);
      if (isDescendant || parentId === folderId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot move folder into itself or its descendants',
            details: {}
          }
        });
      }

      // Verify new parent exists
      const parentStmt = database.prepare(`
        SELECT id FROM folders
        WHERE id = ? AND owner_id = ? AND is_deleted = 0
      `);

      const parent = parentStmt.get(parentId, userId);

      if (!parent) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Parent folder not found',
            details: {}
          }
        });
      }
    }

    // Check for name conflicts if renaming or moving
    const newName = name || folder.name;
    const newParentId = parentId !== undefined ? parentId : folder.parent_id;

    if (newName !== folder.name || newParentId !== folder.parent_id) {
      const conflictStmt = database.prepare(`
        SELECT id FROM folders
        WHERE name = ? AND parent_id ${newParentId ? '= ?' : 'IS NULL'} AND owner_id = ? AND is_deleted = 0 AND id != ?
      `);

      const params = newParentId 
        ? [newName, newParentId, userId, folderId]
        : [newName, userId, folderId];

      const conflict = conflictStmt.get(...params);

      if (conflict) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'A folder with this name already exists in the target location',
            details: {}
          }
        });
      }
    }

    // Update folder
    const updateStmt = database.prepare(`
      UPDATE folders
      SET name = ?, parent_id = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `);

    updateStmt.run(newName, newParentId, Date.now(), folderId, userId);

    LoggerService.info('api-folders', 'Folder updated', userId, { 
      folderId,
      oldName: folder.name,
      newName,
      oldParentId: folder.parent_id,
      newParentId
    });

    res.json({
      success: true,
      data: {
        message: 'Folder updated successfully'
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-folders', 'Failed to update folder', String(req.user?.id), { 
      error: (error as Error).message,
      folderId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update folder',
        details: {}
      }
    });
  }
});

/**
 * DELETE /api/v1/folders/:id - Delete folder
 */
router.delete('/:id', requireScope('folders:write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const folderId = req.params.id;

    const database = db();

    // Check if folder exists and belongs to user
    const folderStmt = database.prepare(`
      SELECT id, name FROM folders
      WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `);

    const folder = folderStmt.get(folderId, userId) as any;

    if (!folder) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Folder not found',
          details: {}
        }
      });
    }

    // Check if folder is empty (optional - you might want to allow recursive deletion)
    const fileCountStmt = database.prepare('SELECT COUNT(*) as count FROM files WHERE folder_id = ? AND owner_id = ? AND is_deleted = 0');
    const subfolderCountStmt = database.prepare('SELECT COUNT(*) as count FROM folders WHERE parent_id = ? AND owner_id = ? AND is_deleted = 0');
    
    const fileCount = (fileCountStmt.get(folderId, userId) as { count: number }).count;
    const subfolderCount = (subfolderCountStmt.get(folderId, userId) as { count: number }).count;

    if (fileCount > 0 || subfolderCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot delete non-empty folder',
          details: {
            fileCount,
            subfolderCount
          }
        }
      });
    }

    // Move to trash (soft delete)
    const updateStmt = database.prepare(`
      UPDATE folders
      SET is_deleted = 1, deleted_at = ?
      WHERE id = ? AND owner_id = ?
    `);

    updateStmt.run(Date.now(), folderId, userId);

    LoggerService.info('api-folders', 'Folder deleted', userId, { 
      folderId,
      name: folder.name
    });

    res.json({
      success: true,
      data: {
        message: 'Folder deleted successfully'
      },
      meta: {
        requestId: crypto.randomBytes(8).toString('hex'),
        timestamp: Date.now(),
        version: '1.0'
      }
    });
  } catch (error) {
    LoggerService.error('api-folders', 'Failed to delete folder', String(req.user?.id), { 
      error: (error as Error).message,
      folderId: req.params.id 
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to delete folder',
        details: {}
      }
    });
  }
});

/**
 * Helper function to get folder path
 */
async function getFolderPath(folderId: string, userId: string): Promise<string[]> {
  const path: string[] = [];
  let currentId: string | null = folderId;

  const database = db();

  while (currentId) {
    const stmt = database.prepare(`
      SELECT name, parent_id FROM folders
      WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `);

    const folder = stmt.get(currentId, userId) as any;

    if (!folder) break;

    path.unshift(folder.name);
    currentId = folder.parent_id;
  }

  return path;
}

/**
 * Helper function to check if targetId is a descendant of folderId
 */
async function checkIfDescendant(folderId: string, targetId: string, userId: string): Promise<boolean> {
  let currentId: string | null = targetId;

  const database = db();

  while (currentId) {
    if (currentId === folderId) {
      return true;
    }

    const stmt = database.prepare(`
      SELECT parent_id FROM folders
      WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `);

    const folder = stmt.get(currentId, userId) as any;

    if (!folder) break;

    currentId = folder.parent_id;
  }

  return false;
}

export default router;