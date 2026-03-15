import { Router } from 'express';
import { hardwareService } from '../services/hardware.service';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

/**
 * Get current hardware statistics
 * GET /api/admin/hardware
 */
router.get('/', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const stats = hardwareService.getCurrentStats();
    
    if (!stats) {
      return res.status(503).json({
        error: 'Hardware monitoring not available',
        message: 'Hardware service is not running or no data collected yet'
      });
    }

    res.json(stats);
  } catch (error) {
    console.error('Error getting hardware stats:', error);
    res.status(500).json({
      error: 'Failed to get hardware statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get hardware statistics history (last 5 minutes)
 * GET /api/admin/hardware/history
 */
router.get('/history', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const history = hardwareService.getStatsHistory();
    
    res.json({
      history,
      count: history.length,
      timeRange: '5 minutes',
      interval: '5 seconds'
    });
  } catch (error) {
    console.error('Error getting hardware history:', error);
    res.status(500).json({
      error: 'Failed to get hardware history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get thermal status
 * GET /api/admin/hardware/thermal
 */
router.get('/thermal', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const thermalStatus = hardwareService.getThermalStatus();
    
    res.json(thermalStatus);
  } catch (error) {
    console.error('Error getting thermal status:', error);
    res.status(500).json({
      error: 'Failed to get thermal status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get system information summary
 * GET /api/admin/hardware/summary
 */
router.get('/summary', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const stats = hardwareService.getCurrentStats();
    const thermalStatus = hardwareService.getThermalStatus();
    
    if (!stats) {
      return res.status(503).json({
        error: 'Hardware monitoring not available'
      });
    }

    // Create a summary with key metrics
    const summary = {
      status: thermalStatus.warningLevel === 'normal' ? 'healthy' : 'warning',
      cpu: {
        temperature: stats.cpuTemp,
        usage: stats.cpuUsage,
        thermalStatus: thermalStatus.warningLevel
      },
      memory: {
        usagePercent: Math.round((stats.memInfo.used / stats.memInfo.total) * 100),
        used: stats.memInfo.used,
        total: stats.memInfo.total
      },
      disk: {
        usagePercent: Math.round((stats.diskUsage.used / stats.diskUsage.total) * 100),
        used: stats.diskUsage.used,
        total: stats.diskUsage.total
      },
      network: {
        wifiClients: stats.wifiClients.length,
        rxSpeed: stats.networkIO.rxSpeed,
        txSpeed: stats.networkIO.txSpeed
      },
      uptime: stats.uptime,
      loadAvg: stats.loadAvg[0], // 1-minute load average
      timestamp: stats.timestamp
    };

    res.json(summary);
  } catch (error) {
    console.error('Error getting hardware summary:', error);
    res.status(500).json({
      error: 'Failed to get hardware summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get WiFi clients information
 * GET /api/admin/hardware/wifi-clients
 */
router.get('/wifi-clients', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const stats = hardwareService.getCurrentStats();
    
    if (!stats) {
      return res.status(503).json({
        error: 'Hardware monitoring not available'
      });
    }

    res.json({
      clients: stats.wifiClients,
      count: stats.wifiClients.length,
      timestamp: stats.timestamp
    });
  } catch (error) {
    console.error('Error getting WiFi clients:', error);
    res.status(500).json({
      error: 'Failed to get WiFi clients',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Start hardware monitoring
 * POST /api/admin/hardware/start
 */
router.post('/start', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    hardwareService.startMonitoring();
    
    res.json({
      message: 'Hardware monitoring started',
      status: 'running'
    });
  } catch (error) {
    console.error('Error starting hardware monitoring:', error);
    res.status(500).json({
      error: 'Failed to start hardware monitoring',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Stop hardware monitoring
 * POST /api/admin/hardware/stop
 */
router.post('/stop', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    hardwareService.stopMonitoring();
    
    res.json({
      message: 'Hardware monitoring stopped',
      status: 'stopped'
    });
  } catch (error) {
    console.error('Error stopping hardware monitoring:', error);
    res.status(500).json({
      error: 'Failed to stop hardware monitoring',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;