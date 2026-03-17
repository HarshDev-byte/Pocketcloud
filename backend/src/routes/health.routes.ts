import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/auth.middleware';
import { HealthService } from '../services/health.service';
import { logger } from '../utils/logger';

const router = Router();

// Public health endpoint (no auth required)
router.get('/', (req: Request, res: Response) => {
  try {
    const status = HealthService.getPublicStatus();
    res.json(status);
  } catch (error: any) {
    logger.error('Public health check failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Health check failed'
    });
  }
});

// Admin: Get full health report
router.get('/admin', requireAdmin, async (req: Request, res: Response) => {
  try {
    const report = await HealthService.runAllChecks();
    res.json(report);
  } catch (error: any) {
    logger.error('Admin health check failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get health history for a specific check
router.get('/admin/history/:type', requireAdmin, (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const hours = parseInt(req.query.hours as string) || 24;
    
    const history = HealthService.getHealthHistory(type, hours);
    res.json({ history });
  } catch (error: any) {
    logger.error('Failed to get health history', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get incidents
router.get('/admin/incidents', requireAdmin, (req: Request, res: Response) => {
  try {
    const active = req.query.active === 'true';
    const incidents = active 
      ? HealthService.getActiveIncidents()
      : HealthService.getAllIncidents();
    
    res.json({ incidents });
  } catch (error: any) {
    logger.error('Failed to get incidents', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Admin: Trigger immediate health check
router.post('/admin/run', requireAdmin, async (req: Request, res: Response) => {
  try {
    const report = await HealthService.runAllChecks();
    res.json(report);
  } catch (error: any) {
    logger.error('Failed to run health check', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Admin: Manually trigger auto-heal for a specific check
router.post('/admin/heal/:checkType', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { checkType } = req.params;
    
    // Get current value for the check
    const report = await HealthService.runAllChecks();
    const check = report.checks.find(c => c.type === checkType);
    
    if (!check) {
      return res.status(404).json({ error: 'Check type not found' });
    }

    if (check.status === 'ok') {
      return res.json({ 
        success: false, 
        message: 'Check is healthy, no healing needed' 
      });
    }

    // Attempt heal
    const result = await HealthService.attemptAutoHeal(
      checkType, 
      check.status, 
      check.value || 0
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to heal check', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Admin: Acknowledge incident
router.post('/admin/incidents/:id/acknowledge', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    HealthService.acknowledgeIncident(id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to acknowledge incident', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;