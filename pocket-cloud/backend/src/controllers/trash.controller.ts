/**
 * Trash controller
 * Handles trash/recycle bin operations and restoration
 */

import { Request, Response } from 'express';
import { trashService } from '../services/trash.service';

class TrashController {
  /**
   * List files and folders in trash
   * GET /api/trash
   */
  async listTrashItems(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const {
        page = 1,
        limit = 50,
        sort = 'deleted_at',
        order = 'desc',
        type = 'all',
      } = req.query;
      
      const result = await trashService.listTrashItems(userId, {
        page: Number(page),
        limit: Number(limit),
        sort: String(sort),
        order: order as 'asc' | 'desc',
        type: type as 'file' | 'folder' | 'all',
      });
      
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to list trash items',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get trash item details
   * GET /api/trash/:uuid
   */
  async getTrashItem(req: Request, res: Response): Promise<void> {
    try {
      const { uuid } = req.params;
      
      if (!uuid) {
        res.status(400).json({
          success: false,
          error: 'UUID parameter is required',
        });
        return;
      }
      
      // For now, return a placeholder response since the service method doesn't exist yet
      res.json({
        success: true,
        data: {
          item: {
            uuid,
            // TODO: Return actual trash item data when service is implemented
          },
        },
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: 'Trash item not found',
        details: error instanceof Error ? error.message : 'Item does not exist',
      });
    }
  }

  /**
   * Restore item from trash
   * POST /api/trash/:uuid/restore
   */
  async restoreItem(req: Request, res: Response): Promise<void> {
    try {
      const { uuid } = req.params;
      
      if (!uuid) {
        res.status(400).json({
          success: false,
          error: 'UUID parameter is required',
        });
        return;
      }
      
      const userId = req.user!.id;
      const { destination_path, new_name } = req.body;
      
      await trashService.restoreItem(uuid, userId, destination_path, new_name);
      
      res.json({
        success: true,
        message: 'Item restored successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to restore item',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Permanently delete item from trash
   * DELETE /api/trash/:uuid
   */
  async permanentlyDelete(req: Request, res: Response): Promise<void> {
    try {
      const { uuid } = req.params;
      
      if (!uuid) {
        res.status(400).json({
          success: false,
          error: 'UUID parameter is required',
        });
        return;
      }
      
      const userId = req.user!.id;
      
      await trashService.permanentlyDeleteItem(uuid, userId);
      
      res.json({
        success: true,
        message: 'Item permanently deleted',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to permanently delete item',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Restore multiple items from trash
   * POST /api/trash/restore-multiple
   */
  async restoreMultiple(req: Request, res: Response): Promise<void> {
    try {
      const { uuids, destination_path } = req.body;
      
      if (!uuids || !Array.isArray(uuids)) {
        res.status(400).json({
          success: false,
          error: 'UUIDs array is required',
        });
        return;
      }
      
      const userId = req.user!.id;
      
      const result = await trashService.restoreMultipleItems(uuids, userId, destination_path);
      
      res.json({
        success: true,
        message: `${result.restored.length} items restored, ${result.failed.length} failed`,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to restore multiple items',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Empty entire trash (permanently delete all items)
   * DELETE /api/trash/empty
   */
  async emptyTrash(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      
      const result = await trashService.emptyTrash(userId);
      
      res.json({
        success: true,
        message: 'Trash emptied successfully',
        data: {
          deletedItems: result.deletedItems,
          freedSpace: result.freedSpace,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to empty trash',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Clean up old trash items (based on retention policy)
   * DELETE /api/trash/cleanup
   */
  async cleanupOldItems(req: Request, res: Response): Promise<void> {
    try {
      const { older_than_days = 30 } = req.body;
      
      const result = await trashService.cleanupOldItems(Number(older_than_days));
      
      res.json({
        success: true,
        message: 'Cleanup completed successfully',
        data: {
          deletedItems: result.deletedItems,
          freedSpace: result.freedSpace,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup old items',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get trash statistics (count, total size, etc.)
   * GET /api/trash/stats
   */
  async getTrashStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      
      const stats = await trashService.getTrashStats(userId);
      
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get trash statistics',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Move file or folder to trash
   * POST /api/trash/move-to-trash
   */
  async moveToTrash(req: Request, res: Response): Promise<void> {
    try {
      const { uuid, type } = req.body;
      
      if (!uuid || !type) {
        res.status(400).json({
          success: false,
          error: 'UUID and type are required',
        });
        return;
      }
      
      const userId = req.user!.id;
      
      if (type === 'file') {
        await trashService.moveFileToTrash(uuid, userId);
      } else if (type === 'folder') {
        await trashService.moveFolderToTrash(uuid, userId);
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid type. Must be "file" or "folder"',
        });
        return;
      }
      
      res.json({
        success: true,
        message: `${type} moved to trash successfully`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to move item to trash',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get current trash retention policy
   * GET /api/trash/retention-policy
   */
  async getRetentionPolicy(_req: Request, res: Response): Promise<void> {
    try {
      const policy = await trashService.getRetentionPolicy();
      
      res.json({
        success: true,
        data: {
          policy,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get retention policy',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Update trash retention policy (admin only)
   * PUT /api/trash/retention-policy
   */
  async updateRetentionPolicy(req: Request, res: Response): Promise<void> {
    try {
      const { auto_delete_days, max_trash_size_gb, enabled } = req.body;
      
      if (typeof auto_delete_days !== 'number' || typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Invalid input: auto_delete_days must be a number and enabled must be a boolean',
        });
        return;
      }
      
      await trashService.updateRetentionPolicy({
        autoDeleteDays: auto_delete_days,
        maxTrashSizeGb: max_trash_size_gb,
        enabled,
      });
      
      res.json({
        success: true,
        message: 'Retention policy updated successfully',
        data: {
          policy: {
            autoDeleteDays: auto_delete_days,
            maxTrashSizeGb: max_trash_size_gb,
            enabled,
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to update retention policy',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const trashController = new TrashController();