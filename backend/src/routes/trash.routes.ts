import { Router, Request, Response } from 'express';
import { TrashService } from '../services/trash.service';
import { requireAuth } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

const router = Router();

// GET /api/trash - List trash items
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { sort, limit, offset } = req.query;
    
    // Validate sortBy parameter
    const validSortOptions = ['deleted_at', 'name', 'size'] as const;
    const sortBy = validSortOptions.includes(sort as any) ? (sort as 'deleted_at' | 'name' | 'size') : 'deleted_at';
    
    const options = {
      sortBy,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0
    };
    
    // Validate limit and offset
    if (options.limit < 1 || options.limit > 100) {
      options.limit = 50;
    }
    if (options.offset < 0) {
      options.offset = 0;
    }
    
    const result = await TrashService.listTrash(userId, options);
    const stats = await TrashService.getTrashStats(userId);
    
    res.json({
      success: true,
      ...result,
      stats
    });
    
  } catch (error: any) {
    logger.error('List trash failed', { error: error.message });
    throw error;
  }
});

// GET /api/trash/stats - Get trash statistics
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await TrashService.getTrashStats(userId);
    
    res.json({
      success: true,
      ...stats
    });
    
  } catch (error: any) {
    logger.error('Get trash stats failed', { error: error.message });
    throw error;
  }
});

// POST /api/trash/:id/restore - Restore item from trash
router.post('/:id/restore', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    
    if (!type || !['file', 'folder'].includes(type)) {
      throw new ValidationError('Type must be "file" or "folder"');
    }
    
    const userId = req.user!.id;
    let result;
    
    if (type === 'file') {
      result = await TrashService.restoreFile(id, userId);
    } else {
      result = await TrashService.restoreFolder(id, userId);
    }
    
    res.json({
      success: true,
      item: result.item,
      restoredToRoot: result.restoredToRoot
    });
    
  } catch (error: any) {
    logger.error('Restore failed', { 
      itemId: req.params.id, 
      type: req.body.type, 
      error: error.message 
    });
    throw error;
  }
});

// POST /api/trash/restore-all - Restore all items from trash
router.post('/restore-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const result = await TrashService.restoreAll(userId);
    
    res.json({
      success: true,
      message: `Restored ${result.restored} items`,
      restored: result.restored,
      failed: result.failed
    });
    
  } catch (error: any) {
    logger.error('Restore all failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// DELETE /api/trash/empty - Permanently delete all items in trash
router.delete('/empty', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const result = await TrashService.emptyTrash(userId);
    
    res.json({
      success: true,
      message: `Permanently deleted ${result.filesDeleted + result.foldersDeleted} items`,
      deleted: result.filesDeleted + result.foldersDeleted,
      bytesFreed: result.bytesFreed
    });
    
  } catch (error: any) {
    logger.error('Empty trash failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

export default router;