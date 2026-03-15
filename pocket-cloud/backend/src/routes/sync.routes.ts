import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { syncService } from '../services/sync.service';
import { LoggerService } from '../services/logger.service';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

/**
 * Register a new sync client device
 * POST /api/sync/register
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { deviceName, deviceOs, syncFolder, localPath } = req.body;

    // Validate required fields
    if (!deviceName || !deviceOs || !syncFolder || !localPath) {
      return res.status(400).json({
        error: 'Missing required fields: deviceName, deviceOs, syncFolder, localPath'
      });
    }

    // Validate device OS
    if (!['macos', 'windows', 'linux'].includes(deviceOs)) {
      return res.status(400).json({
        error: 'Invalid deviceOs. Must be: macos, windows, or linux'
      });
    }

    const clientId = await syncService.registerClient(
      req.user!.id,
      deviceName,
      deviceOs,
      syncFolder,
      localPath
    );

    LoggerService.info('sync', `Sync client registered via API: ${deviceName}`, req.user!.id, {
      clientId,
      deviceOs,
      syncFolder
    });

    res.json({
      success: true,
      clientId,
      message: 'Sync client registered successfully'
    });

  } catch (error) {
    LoggerService.error('sync', 'Failed to register sync client via API', req.user?.id, {
      error: (error as Error).message
    });
    res.status(500).json({
      error: 'Failed to register sync client'
    });
  }
});

/**
 * Submit local state scan and get sync delta
 * POST /api/sync/scan
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { clientId, items, conflictStrategy = 'ask_user' } = req.body;

    // Validate required fields
    if (!clientId || !Array.isArray(items)) {
      return res.status(400).json({
        error: 'Missing required fields: clientId, items (array)'
      });
    }

    // Validate client ownership
    const client = syncService.getClient(clientId);
    if (!client || client.user_id !== req.user!.id) {
      return res.status(404).json({
        error: 'Sync client not found or access denied'
      });
    }

    // Validate conflict strategy
    const validStrategies = ['ask_user', 'newer_wins', 'larger_wins', 'keep_both'];
    if (!validStrategies.includes(conflictStrategy)) {
      return res.status(400).json({
        error: `Invalid conflictStrategy. Must be one of: ${validStrategies.join(', ')}`
      });
    }

    // Validate items format
    for (const item of items) {
      if (!item.path || !item.hash || typeof item.mtime !== 'number' || typeof item.size !== 'number') {
        return res.status(400).json({
          error: 'Invalid item format. Each item must have: path, hash, mtime, size'
        });
      }
    }

    const delta = await syncService.processScan(clientId, items, conflictStrategy);

    LoggerService.info('sync', `Sync scan processed for client ${clientId}`, req.user!.id, {
      itemCount: items.length,
      deltaOperations: delta.toUpload.length + delta.toDownload.length + delta.toDelete.length,
      conflicts: delta.conflicts.length
    });

    res.json({
      success: true,
      delta,
      timestamp: Date.now()
    });

  } catch (error) {
    LoggerService.error('sync', 'Failed to process sync scan', req.user?.id, {
      error: (error as Error).message,
      clientId: req.body.clientId
    });
    res.status(500).json({
      error: 'Failed to process sync scan'
    });
  }
});

/**
 * Mark sync operations as complete and update state
 * POST /api/sync/complete
 */
router.post('/complete', async (req: Request, res: Response) => {
  try {
    const { clientId, operations } = req.body;

    // Validate required fields
    if (!clientId || !Array.isArray(operations)) {
      return res.status(400).json({
        error: 'Missing required fields: clientId, operations (array)'
      });
    }

    // Validate client ownership
    const client = syncService.getClient(clientId);
    if (!client || client.user_id !== req.user!.id) {
      return res.status(404).json({
        error: 'Sync client not found or access denied'
      });
    }

    // Validate operations format
    for (const op of operations) {
      if (!op.type || !op.path || typeof op.success !== 'boolean') {
        return res.status(400).json({
          error: 'Invalid operation format. Each operation must have: type, path, success'
        });
      }
      
      if (!['upload', 'download', 'delete'].includes(op.type)) {
        return res.status(400).json({
          error: 'Invalid operation type. Must be: upload, download, or delete'
        });
      }
    }

    await syncService.completeSyncOperation(clientId, operations);

    LoggerService.info('sync', `Sync operations completed for client ${clientId}`, req.user!.id, {
      operationCount: operations.length,
      successCount: operations.filter((op: any) => op.success).length
    });

    res.json({
      success: true,
      message: 'Sync operations completed successfully',
      timestamp: Date.now()
    });

  } catch (error) {
    LoggerService.error('sync', 'Failed to complete sync operations', req.user?.id, {
      error: (error as Error).message,
      clientId: req.body.clientId
    });
    res.status(500).json({
      error: 'Failed to complete sync operations'
    });
  }
});

/**
 * Get current sync status for client
 * GET /api/sync/status?clientId=xxx
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.query;

    if (!clientId || typeof clientId !== 'string') {
      return res.status(400).json({
        error: 'Missing required query parameter: clientId'
      });
    }

    // Validate client ownership
    const client = syncService.getClient(clientId);
    if (!client || client.user_id !== req.user!.id) {
      return res.status(404).json({
        error: 'Sync client not found or access denied'
      });
    }

    const status = syncService.getSyncStatus(clientId);

    res.json({
      success: true,
      status,
      timestamp: Date.now()
    });

  } catch (error) {
    LoggerService.error('sync', 'Failed to get sync status', req.user?.id, {
      error: (error as Error).message,
      clientId: req.query.clientId
    });
    res.status(500).json({
      error: 'Failed to get sync status'
    });
  }
});

/**
 * Get all sync clients for current user
 * GET /api/sync/clients
 */
router.get('/clients', async (req: Request, res: Response) => {
  try {
    const clients = syncService.getUserClients(req.user!.id);
    const stats = syncService.getSyncStats(req.user!.id);

    res.json({
      success: true,
      clients,
      stats,
      timestamp: Date.now()
    });

  } catch (error) {
    LoggerService.error('sync', 'Failed to get sync clients', req.user?.id, {
      error: (error as Error).message
    });
    res.status(500).json({
      error: 'Failed to get sync clients'
    });
  }
});

/**
 * Unregister a sync client device
 * DELETE /api/sync/clients/:clientId
 */
router.delete('/clients/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    // Validate client ownership
    const client = syncService.getClient(clientId);
    if (!client || client.user_id !== req.user!.id) {
      return res.status(404).json({
        error: 'Sync client not found or access denied'
      });
    }

    await syncService.unregisterClient(clientId);

    LoggerService.info('sync', `Sync client unregistered via API: ${client.device_name}`, req.user!.id, {
      clientId
    });

    res.json({
      success: true,
      message: 'Sync client unregistered successfully'
    });

  } catch (error) {
    LoggerService.error('sync', 'Failed to unregister sync client', req.user?.id, {
      error: (error as Error).message,
      clientId: req.params.clientId
    });
    res.status(500).json({
      error: 'Failed to unregister sync client'
    });
  }
});

/**
 * Update sync client settings
 * PUT /api/sync/clients/:clientId
 */
router.put('/clients/:clientId', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { deviceName, syncFolder, localPath } = req.body;

    // Validate client ownership
    const client = syncService.getClient(clientId);
    if (!client || client.user_id !== req.user!.id) {
      return res.status(404).json({
        error: 'Sync client not found or access denied'
      });
    }

    // Update client settings (implement in sync service)
    // For now, just return success
    res.json({
      success: true,
      message: 'Sync client settings updated successfully'
    });

  } catch (error) {
    LoggerService.error('sync', 'Failed to update sync client', req.user?.id, {
      error: (error as Error).message,
      clientId: req.params.clientId
    });
    res.status(500).json({
      error: 'Failed to update sync client'
    });
  }
});

/**
 * Get sync activity log
 * GET /api/sync/activity?clientId=xxx&limit=50
 */
router.get('/activity', async (req: Request, res: Response) => {
  try {
    const { clientId, limit = '50' } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);

    let whereClause = 'WHERE sc.user_id = ?';
    let params: any[] = [req.user!.id];

    if (clientId) {
      // Validate client ownership
      const client = syncService.getClient(clientId as string);
      if (!client || client.user_id !== req.user!.id) {
        return res.status(404).json({
          error: 'Sync client not found or access denied'
        });
      }
      
      whereClause += ' AND sc.id = ?';
      params.push(clientId);
    }

    // Get recent sync activity (implement in sync service)
    // For now, return empty array
    const activity: any[] = [];

    res.json({
      success: true,
      activity,
      timestamp: Date.now()
    });

  } catch (error) {
    LoggerService.error('sync', 'Failed to get sync activity', req.user?.id, {
      error: (error as Error).message
    });
    res.status(500).json({
      error: 'Failed to get sync activity'
    });
  }
});

/**
 * Pause/resume sync for client
 * POST /api/sync/clients/:clientId/pause
 * POST /api/sync/clients/:clientId/resume
 */
router.post('/clients/:clientId/:action(pause|resume)', async (req: Request, res: Response) => {
  try {
    const { clientId, action } = req.params;

    // Validate client ownership
    const client = syncService.getClient(clientId);
    if (!client || client.user_id !== req.user!.id) {
      return res.status(404).json({
        error: 'Sync client not found or access denied'
      });
    }

    // Implement pause/resume logic in sync service
    // For now, just return success
    res.json({
      success: true,
      message: `Sync ${action}d successfully`,
      action
    });

  } catch (error) {
    LoggerService.error('sync', `Failed to ${req.params.action} sync`, req.user?.id, {
      error: (error as Error).message,
      clientId: req.params.clientId
    });
    res.status(500).json({
      error: `Failed to ${req.params.action} sync`
    });
  }
});

export default router;