import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { updaterService } from '../services/updater.service';
import { LoggerService } from '../services/logger.service';

const router = Router();

/**
 * Middleware to require admin role
 */
const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * GET /api/admin/updates/check
 * Check for available updates
 */
router.get('/check', requireAuth, requireAdmin, async (req, res) => {
  try {
    LoggerService.info('updater', 'Admin checking for updates', req.user?.id);
    
    const updateInfo = await updaterService.checkForUpdates();
    
    res.json({
      success: true,
      ...updateInfo
    });

  } catch (error) {
    LoggerService.error('updater', 'Failed to check for updates', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to check for updates',
      message: (error as Error).message
    });
  }
});

/**
 * POST /api/admin/updates/apply
 * Start the update process
 */
router.post('/apply', requireAuth, requireAdmin, async (req, res) => {
  try {
    LoggerService.info('updater', 'Admin starting update process', req.user?.id);
    
    // Check if update is already in progress
    const currentStatus = updaterService.getStatus();
    if (currentStatus.phase !== 'idle' && currentStatus.phase !== 'complete' && currentStatus.phase !== 'error') {
      return res.status(409).json({
        success: false,
        error: 'Update already in progress',
        status: currentStatus
      });
    }

    // Start update process asynchronously
    updaterService.applyUpdate().then(success => {
      if (success) {
        LoggerService.info('updater', 'Update completed successfully', req.user?.id);
      } else {
        LoggerService.error('updater', 'Update failed', req.user?.id);
      }
    }).catch(error => {
      LoggerService.error('updater', 'Update process error', req.user?.id, { 
        error: error.message 
      });
    });

    res.json({
      success: true,
      message: 'Update process started',
      status: updaterService.getStatus()
    });

  } catch (error) {
    LoggerService.error('updater', 'Failed to start update', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to start update',
      message: (error as Error).message
    });
  }
});

/**
 * GET /api/admin/updates/status
 * Get current update status
 */
router.get('/status', requireAuth, requireAdmin, (req, res) => {
  try {
    const status = updaterService.getStatus();
    
    res.json({
      success: true,
      status
    });

  } catch (error) {
    LoggerService.error('updater', 'Failed to get update status', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get update status'
    });
  }
});

/**
 * POST /api/admin/updates/rollback
 * Rollback to previous version
 */
router.post('/rollback', requireAuth, requireAdmin, async (req, res) => {
  try {
    LoggerService.info('updater', 'Admin starting rollback process', req.user?.id);
    
    // Check if rollback is possible
    const currentStatus = updaterService.getStatus();
    if (currentStatus.phase !== 'idle' && currentStatus.phase !== 'complete' && currentStatus.phase !== 'error') {
      return res.status(409).json({
        success: false,
        error: 'Cannot rollback while update is in progress',
        status: currentStatus
      });
    }

    // Start rollback process asynchronously
    updaterService.rollback().then(success => {
      if (success) {
        LoggerService.info('updater', 'Rollback completed successfully', req.user?.id);
      } else {
        LoggerService.error('updater', 'Rollback failed', req.user?.id);
      }
    }).catch(error => {
      LoggerService.error('updater', 'Rollback process error', req.user?.id, { 
        error: error.message 
      });
    });

    res.json({
      success: true,
      message: 'Rollback process started',
      status: updaterService.getStatus()
    });

  } catch (error) {
    LoggerService.error('updater', 'Failed to start rollback', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to start rollback',
      message: (error as Error).message
    });
  }
});

/**
 * GET /api/admin/updates/history
 * Get update history
 */
router.get('/history', requireAuth, requireAdmin, (req, res) => {
  try {
    // Get update history from logs
    const history = LoggerService.queryLogs({
      service: 'updater',
      limit: 50,
      startTime: Date.now() - (30 * 24 * 60 * 60 * 1000) // Last 30 days
    });

    res.json({
      success: true,
      history: history.filter(log => 
        log.message.includes('Update completed') || 
        log.message.includes('Rollback completed') ||
        log.message.includes('Update failed')
      )
    });

  } catch (error) {
    LoggerService.error('updater', 'Failed to get update history', req.user?.id, { 
      error: (error as Error).message 
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get update history'
    });
  }
});

/**
 * GET /api/updates/client/:platform/latest.json
 * Client update endpoint for desktop apps
 */
router.get('/client/:platform/latest.json', (req, res) => {
  try {
    const { platform } = req.params;
    const supportedPlatforms = ['mac-arm64', 'mac-x64', 'win-x64', 'linux-x64'];
    
    if (!supportedPlatforms.includes(platform)) {
      return res.status(404).json({ error: 'Platform not supported' });
    }

    // Get current server version
    const serverVersion = updaterService.getCurrentVersion();
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // Client update info
    const clientUpdateInfo = {
      version: serverVersion,
      url: `${baseUrl}/downloads/${platform}.${platform.startsWith('mac') ? 'dmg' : platform.startsWith('win') ? 'exe' : 'AppImage'}`,
      sha512: '', // Would be calculated during build
      releaseDate: new Date().toISOString(),
      releaseNotes: `Pocket Cloud Drive v${serverVersion}\n\nSynchronized with server version.`
    };

    res.json(clientUpdateInfo);

  } catch (error) {
    LoggerService.error('updater', 'Failed to get client update info', undefined, { 
      error: (error as Error).message,
      platform: req.params.platform
    });

    res.status(500).json({
      error: 'Failed to get client update info'
    });
  }
});

export { router as updateRoutes };