import { Router } from 'express';
import { powerService } from '../services/power.service.js';
import { logger } from '../services/logger.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Get current power status
router.get('/api/system/power', async (req, res) => {
  try {
    const status = powerService.getPowerStatus();
    const hardwareType = powerService.getHardwareType();
    const powerSaveMode = powerService.isPowerSaveModeEnabled();
    
    res.json({
      ...status,
      hardwareType,
      powerSaveMode,
      success: true
    });
    
  } catch (error) {
    logger.error('Failed to get power status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get power status'
    });
  }
});

// Get battery health report (admin only)
router.get('/api/admin/power/health-report', authMiddleware, async (req, res) => {
  try {
    const report = await powerService.getBatteryHealthReport();
    
    res.json({
      success: true,
      report
    });
    
  } catch (error) {
    logger.error('Failed to get battery health report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate battery health report'
    });
  }
});

// Enable/disable power save mode (admin only)
router.post('/api/admin/power/save-mode', authMiddleware, async (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean'
      });
    }
    
    await powerService.setPowerSaveMode(enabled);
    
    res.json({
      success: true,
      message: `Power save mode ${enabled ? 'enabled' : 'disabled'}`,
      powerSaveMode: enabled
    });
    
  } catch (error) {
    logger.error('Failed to set power save mode:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set power save mode'
    });
  }
});

// Graceful shutdown (admin only)
router.post('/api/admin/power/shutdown', authMiddleware, async (req, res) => {
  try {
    logger.warn('Shutdown requested via API');
    
    // Respond immediately before shutdown
    res.json({
      success: true,
      message: 'Shutdown initiated'
    });
    
    // Delay shutdown to allow response to be sent
    setTimeout(async () => {
      try {
        await powerService.forceShutdown();
      } catch (error) {
        logger.error('API shutdown failed:', error);
      }
    }, 1000);
    
  } catch (error) {
    logger.error('Failed to initiate shutdown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate shutdown'
    });
  }
});

// Graceful reboot (admin only)
router.post('/api/admin/power/reboot', authMiddleware, async (req, res) => {
  try {
    logger.warn('Reboot requested via API');
    
    // Respond immediately before reboot
    res.json({
      success: true,
      message: 'Reboot initiated'
    });
    
    // Delay reboot to allow response to be sent
    setTimeout(async () => {
      try {
        await powerService.forceReboot();
      } catch (error) {
        logger.error('API reboot failed:', error);
      }
    }, 1000);
    
  } catch (error) {
    logger.error('Failed to initiate reboot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate reboot'
    });
  }
});

// Cancel scheduled shutdown (admin only)
router.post('/api/admin/power/cancel-shutdown', authMiddleware, async (req, res) => {
  try {
    const cancelled = powerService.cancelShutdown();
    
    res.json({
      success: true,
      cancelled,
      message: cancelled ? 'Shutdown cancelled' : 'No shutdown was scheduled'
    });
    
  } catch (error) {
    logger.error('Failed to cancel shutdown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel shutdown'
    });
  }
});

export default router;