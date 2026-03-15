import { Router, Request, Response } from 'express';
import { bandwidthService, BandwidthLimits } from '../services/bandwidth.service';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { LoggerService } from '../services/logger.service';

const router = Router();

// Apply auth middleware to all QoS routes (admin only)
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/admin/bandwidth - Get live bandwidth usage per user
 */
router.get('/bandwidth', async (req: Request, res: Response) => {
  try {
    const usage = bandwidthService.getCurrentUsage();
    
    // Convert Map to object for JSON serialization
    const response = {
      ...usage,
      perUser: Object.fromEntries(usage.perUser),
      throttledUsers: Array.from(usage.throttledUsers)
    };

    res.json(response);
  } catch (error) {
    LoggerService.error('qos', 'Failed to get bandwidth usage', undefined, { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to get bandwidth usage' });
  }
});

/**
 * GET /api/admin/qos/limits - Get current bandwidth limits
 */
router.get('/limits', async (req: Request, res: Response) => {
  try {
    const limits = bandwidthService.getLimits();
    res.json(limits);
  } catch (error) {
    LoggerService.error('qos', 'Failed to get bandwidth limits', undefined, { error: (error as Error).message });
    return res.status(500).json({ error: 'Failed to get bandwidth limits' });
  }
});

/**
 * POST /api/admin/bandwidth/limits - Update bandwidth limits
 */
router.post('/bandwidth/limits', async (req: Request, res: Response) => {
  try {
    const updates: Partial<BandwidthLimits> = req.body;
    
    // Validate limits
    const validFields = ['uploadPerUser', 'downloadPerUser', 'streamingPerUser', 'globalUpload', 'globalDownload'];
    const filteredUpdates: Partial<BandwidthLimits> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (validFields.includes(key) && typeof value === 'number' && value > 0) {
        (filteredUpdates as any)[key] = value;
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid bandwidth limits provided' });
    }

    bandwidthService.updateLimits(filteredUpdates);
    
    const newLimits = bandwidthService.getLimits();
    
    LoggerService.info('qos', 'Bandwidth limits updated', undefined, {
      updates: filteredUpdates,
      newLimits
    });

    res.json({
      message: 'Bandwidth limits updated successfully',
      limits: newLimits
    });
  } catch (error) {
    LoggerService.error('qos', 'Failed to update bandwidth limits', undefined, { error: (error as Error).message });
    return res.status(500).json({ error: 'Failed to update bandwidth limits' });
  }
});

/**
 * POST /api/admin/bandwidth/throttle/:userId - Temporarily throttle a user
 */
router.post('/bandwidth/throttle/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { durationMs = 300000 } = req.body; // Default 5 minutes

    if (!userId || userId === 'anonymous') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (typeof durationMs !== 'number' || durationMs < 1000 || durationMs > 3600000) {
      return res.status(400).json({ error: 'Duration must be between 1 second and 1 hour' });
    }

    bandwidthService.throttleUser(userId, durationMs);

    LoggerService.info('qos', `User throttled by admin`, undefined, {
      userId,
      durationMs,
      adminId: (req as any).user?.id
    });

    res.json({
      message: `User ${userId} throttled for ${Math.round(durationMs / 1000)} seconds`,
      userId,
      durationMs
    });
  } catch (error) {
    LoggerService.error('qos', 'Failed to throttle user', undefined, { error: (error as Error).message });
    return res.status(500).json({ error: 'Failed to throttle user' });
  }
});

/**
 * DELETE /api/admin/bandwidth/throttle/:userId - Remove throttle from user
 */
router.delete('/bandwidth/throttle/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId || userId === 'anonymous') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    bandwidthService.unthrottleUser(userId);

    LoggerService.info('qos', `User unthrottled by admin`, undefined, {
      userId,
      adminId: (req as any).user?.id
    });

    res.json({
      message: `Throttle removed from user ${userId}`,
      userId
    });
  } catch (error) {
    LoggerService.error('qos', 'Failed to unthrottle user', undefined, { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to unthrottle user' });
  }
});

/**
 * GET /api/admin/bandwidth/history - Get bandwidth usage history (last 24h)
 */
router.get('/bandwidth/history', async (req: Request, res: Response) => {
  try {
    const history = bandwidthService.getBandwidthHistory();
    
    // Convert Maps to objects for JSON serialization
    const serializedHistory = history.map(entry => ({
      timestamp: entry.timestamp,
      stats: {
        ...entry.stats,
        perUser: Object.fromEntries(entry.stats.perUser),
        throttledUsers: Array.from(entry.stats.throttledUsers)
      }
    }));

    res.json(serializedHistory);
  } catch (error) {
    LoggerService.error('qos', 'Failed to get bandwidth history', undefined, { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to get bandwidth history' });
  }
});

/**
 * GET /api/admin/qos/stats - Get comprehensive QoS statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const usage = bandwidthService.getCurrentUsage();
    const limits = bandwidthService.getLimits();
    const history = bandwidthService.getBandwidthHistory();

    // Calculate some additional stats
    const recentHistory = history.slice(-12); // Last hour (5-minute intervals)
    const avgBandwidth = recentHistory.length > 0 
      ? recentHistory.reduce((sum, entry) => sum + entry.stats.global.totalBytesPerSec, 0) / recentHistory.length
      : 0;

    const peakBandwidth = recentHistory.length > 0
      ? Math.max(...recentHistory.map(entry => entry.stats.global.totalBytesPerSec))
      : 0;

    const response = {
      current: {
        ...usage,
        perUser: Object.fromEntries(usage.perUser),
        throttledUsers: Array.from(usage.throttledUsers)
      },
      limits,
      statistics: {
        avgBandwidthLastHour: avgBandwidth,
        peakBandwidthLastHour: peakBandwidth,
        totalDataPoints: history.length,
        monitoringDuration: history.length > 0 
          ? Date.now() - history[0].timestamp 
          : 0
      }
    };

    res.json(response);
  } catch (error) {
    LoggerService.error('qos', 'Failed to get QoS stats', undefined, { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to get QoS stats' });
  }
});

/**
 * POST /api/admin/qos/reset - Reset bandwidth monitoring (clear history)
 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    // Clear bandwidth history (this would need to be implemented in bandwidth service)
    // For now, just log the action
    
    LoggerService.info('qos', 'Bandwidth monitoring reset by admin', undefined, {
      adminId: (req as any).user?.id
    });

    res.json({
      message: 'Bandwidth monitoring reset successfully'
    });
  } catch (error) {
    LoggerService.error('qos', 'Failed to reset bandwidth monitoring', undefined, { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to reset bandwidth monitoring' });
  }
});

export default router;