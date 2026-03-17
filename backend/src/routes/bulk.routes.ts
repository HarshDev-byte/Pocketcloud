import { Router, Request, Response } from 'express';
import { BulkService } from '../services/bulk.service';
import { requireAuth } from '../middleware/auth.middleware';
import { createActivityLogger } from '../middleware/activity.middleware';
import { Actions } from '../services/activity.service';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

// ===== BULK OPERATIONS =====

// POST /api/bulk/move - Bulk move files and folders
router.post('/move',
  createActivityLogger(Actions.FILE_MOVE, (req) => ({
    resourceType: 'bulk',
    details: {
      operation: 'move',
      itemCount: req.body.items?.length || 0,
      targetFolderId: req.body.targetFolderId
    }
  })),
  async (req: Request, res: Response) => {
    try {
      const { items, targetFolderId } = req.body;
      const userId = req.user!.id;

      // Validate input
      if (!Array.isArray(items) || items.length === 0) {
        throw new ValidationError('Items array is required and cannot be empty');
      }

      if (items.length > 500) {
        throw new ValidationError('Maximum 500 items allowed per bulk operation');
      }

      // Validate item structure
      for (const item of items) {
        if (!item.id || !item.type || !['file', 'folder'].includes(item.type)) {
          throw new ValidationError('Each item must have id and type (file or folder)');
        }
      }

      const result = await BulkService.bulkMove(userId, items, targetFolderId || null);

      res.json({
        success: true,
        ...result
      });

    } catch (error: any) {
      logger.error('Bulk move failed', { 
        userId: req.user?.id,
        error: error.message 
      });
      throw error;
    }
  });

// POST /api/bulk/delete - Bulk delete files and folders
router.post('/delete',
  createActivityLogger(Actions.FILE_DELETE, (req) => ({
    resourceType: 'bulk',
    details: {
      operation: 'delete',
      itemCount: req.body.items?.length || 0
    }
  })),
  async (req: Request, res: Response) => {
    try {
      const { items } = req.body;
      const userId = req.user!.id;
      // Validate input
      if (!Array.isArray(items) || items.length === 0) {
        throw new ValidationError('Items array is required and cannot be empty');
      }

      if (items.length > 500) {
        throw new ValidationError('Maximum 500 items allowed per bulk operation');
      }

      // Validate item structure
      for (const item of items) {
        if (!item.id || !item.type || !['file', 'folder'].includes(item.type)) {
          throw new ValidationError('Each item must have id and type (file or folder)');
        }
      }

      const result = await BulkService.bulkDelete(userId, items);

      res.json({
        success: true,
        ...result
      });

    } catch (error: any) {
      logger.error('Bulk delete failed', { 
        userId: req.user?.id,
        error: error.message 
      });
      throw error;
    }
  });

// POST /api/bulk/copy - Bulk copy files
router.post('/copy', async (req: Request, res: Response) => {
  try {
    const { fileIds, targetFolderId } = req.body;
    const userId = req.user!.id;

    // Validate input
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new ValidationError('File IDs array is required and cannot be empty');
    }

    if (fileIds.length > 500) {
      throw new ValidationError('Maximum 500 files allowed per bulk operation');
    }

    const result = await BulkService.bulkCopy(userId, fileIds, targetFolderId || null);

    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    logger.error('Bulk copy failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// POST /api/bulk/tag - Bulk tag files
router.post('/tag', async (req: Request, res: Response) => {
  try {
    const { fileIds, tagIds } = req.body;
    const userId = req.user!.id;

    // Validate input
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new ValidationError('File IDs array is required and cannot be empty');
    }

    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      throw new ValidationError('Tag IDs array is required and cannot be empty');
    }

    const result = await BulkService.bulkTag(userId, fileIds, tagIds);

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error('Bulk tag failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// POST /api/bulk/untag - Bulk untag files
router.post('/untag', async (req: Request, res: Response) => {
  try {
    const { fileIds, tagIds } = req.body;
    const userId = req.user!.id;

    // Validate input
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new ValidationError('File IDs array is required and cannot be empty');
    }

    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      throw new ValidationError('Tag IDs array is required and cannot be empty');
    }

    const result = await BulkService.bulkUntag(userId, fileIds, tagIds);

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error('Bulk untag failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// GET /api/bulk/jobs/:id - Get bulk job status
router.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const job = BulkService.getBulkJobStatus(id, userId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Parse errors JSON
    const errors = JSON.parse(job.errors || '[]');

    res.json({
      success: true,
      job: {
        ...job,
        errors
      }
    });

  } catch (error: any) {
    logger.error('Get bulk job status failed', { 
      jobId: req.params.id,
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// ===== TAG MANAGEMENT =====

// GET /api/tags - List all tags for current user
router.get('/tags', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const tags = BulkService.listTags(userId);

    res.json({
      success: true,
      tags
    });

  } catch (error: any) {
    logger.error('List tags failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// POST /api/tags - Create new tag
router.post('/tags', async (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;
    const userId = req.user!.id;

    if (!name) {
      throw new ValidationError('Tag name is required');
    }

    const tag = BulkService.createTag(userId, name, color);

    res.json({
      success: true,
      tag
    });

  } catch (error: any) {
    logger.error('Create tag failed', { 
      userId: req.user?.id,
      tagName: req.body.name,
      error: error.message 
    });
    throw error;
  }
});

// PATCH /api/tags/:id - Update tag
router.patch('/tags/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    const userId = req.user!.id;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (color !== undefined) updates.color = color;

    const tag = BulkService.updateTag(id, userId, updates);

    res.json({
      success: true,
      tag
    });

  } catch (error: any) {
    logger.error('Update tag failed', { 
      tagId: req.params.id,
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// DELETE /api/tags/:id - Delete tag
router.delete('/tags/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    BulkService.deleteTag(id, userId);

    res.json({
      success: true,
      message: 'Tag deleted successfully'
    });

  } catch (error: any) {
    logger.error('Delete tag failed', { 
      tagId: req.params.id,
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// GET /api/tags/:id/files - Get files with specific tag
router.get('/tags/:id/files', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { page = '1', limit = '50' } = req.query;
    const userId = req.user!.id;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

    const result = BulkService.getFilesWithTag(id, userId, pageNum, limitNum);

    res.json({
      success: true,
      ...result,
      page: pageNum,
      limit: limitNum
    });

  } catch (error: any) {
    logger.error('Get files with tag failed', { 
      tagId: req.params.id,
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// PATCH /api/files/:id/tags - Set tags for a file (replaces all existing tags)
router.patch('/files/:id/tags', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tagIds } = req.body;
    const userId = req.user!.id;

    if (!Array.isArray(tagIds)) {
      throw new ValidationError('Tag IDs must be an array');
    }

    BulkService.setFileTags(id, userId, tagIds);

    res.json({
      success: true,
      message: 'File tags updated successfully'
    });

  } catch (error: any) {
    logger.error('Set file tags failed', { 
      fileId: req.params.id,
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// GET /api/files/:id/tags - Get tags for a file
router.get('/files/:id/tags', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const tags = BulkService.getFileTags(id, userId);

    res.json({
      success: true,
      tags
    });

  } catch (error: any) {
    logger.error('Get file tags failed', { 
      fileId: req.params.id,
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

export default router;