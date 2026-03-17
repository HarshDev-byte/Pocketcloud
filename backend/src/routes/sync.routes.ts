import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { SyncService } from '../services/sync.service';
import { logger } from '../utils/logger';

const router = Router();

// Register new sync client
router.post('/register', requireAuth, async (req: Request, res: Response) => {
  try {
    const { deviceName, deviceOs, remoteFolderId } = req.body;

    if (!deviceName || !deviceOs) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await SyncService.registerClient(
      req.user!.id,
      deviceName,
      deviceOs,
      remoteFolderId
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to register sync client', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get full snapshot for initial sync
router.get('/list', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.query;

    if (!clientId || typeof clientId !== 'string') {
      return res.status(400).json({ error: 'Missing clientId' });
    }

    const snapshot = await SyncService.getFullSnapshot(clientId);

    res.json(snapshot);
  } catch (error: any) {
    logger.error('Failed to get full snapshot', { error: error.message });
    
    if (error.message === 'Sync client not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Get delta changes since cursor
router.get('/delta', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId, cursor } = req.query;

    if (!clientId || typeof clientId !== 'string') {
      return res.status(400).json({ error: 'Missing clientId' });
    }

    if (!cursor || typeof cursor !== 'string') {
      return res.status(400).json({ error: 'Missing cursor' });
    }

    const delta = await SyncService.getDelta(clientId, cursor);

    res.json(delta);
  } catch (error: any) {
    logger.error('Failed to get delta', { error: error.message });
    
    if (error.message === 'Sync client not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Report local changes from client
router.post('/changes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId, changes } = req.body;

    if (!clientId || !Array.isArray(changes)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await SyncService.reportLocalChanges(clientId, changes);

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to process local changes', { error: error.message });
    
    if (error.message === 'Sync client not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Resolve conflict
router.post('/conflict/resolve', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId, path, resolution } = req.body;

    if (!clientId || !path || !resolution) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validResolutions = ['keep_server', 'keep_client', 'keep_both'];
    if (!validResolutions.includes(resolution)) {
      return res.status(400).json({ error: 'Invalid resolution' });
    }

    const result = await SyncService.resolveConflict(clientId, path, resolution);

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to resolve conflict', { error: error.message });
    
    if (error.message === 'Sync client not found' || error.message === 'File not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// List registered sync clients
router.get('/clients', requireAuth, async (req: Request, res: Response) => {
  try {
    const clients = SyncService.listClients(req.user!.id);
    res.json({ clients });
  } catch (error: any) {
    logger.error('Failed to list sync clients', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Unregister sync client
router.delete('/clients/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await SyncService.unregisterClient(id, req.user!.id);

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to unregister sync client', { error: error.message });
    
    if (error.message === 'Sync client not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

export default router;
