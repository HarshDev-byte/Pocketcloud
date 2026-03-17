import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { AnalyticsService } from '../services/analytics.service';
import { logger } from '../utils/logger';

const router = Router();

// Get storage growth over time
router.get('/storage', requireAuth, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const growth = AnalyticsService.getStorageGrowth(req.user!.id, days);
    res.json(growth);
  } catch (error: any) {
    logger.error('Failed to get storage growth', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get current storage breakdown
router.get('/breakdown', requireAuth, async (req: Request, res: Response) => {
  try {
    const breakdown = AnalyticsService.getStorageBreakdown(req.user!.id);
    res.json(breakdown);
  } catch (error: any) {
    logger.error('Failed to get storage breakdown', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get largest files
router.get('/largest', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const files = AnalyticsService.getLargestFiles(req.user!.id, limit);
    res.json({ files });
  } catch (error: any) {
    logger.error('Failed to get largest files', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get duplicate file groups
router.get('/duplicates', requireAuth, async (req: Request, res: Response) => {
  try {
    const duplicates = AnalyticsService.getDuplicateGroups(req.user!.id);
    res.json({ duplicates });
  } catch (error: any) {
    logger.error('Failed to get duplicates', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get smart recommendations
router.get('/recommendations', requireAuth, async (req: Request, res: Response) => {
  try {
    const recommendations = AnalyticsService.getSmartRecommendations(req.user!.id);
    res.json({ recommendations });
  } catch (error: any) {
    logger.error('Failed to get recommendations', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get upload activity heatmap
router.get('/activity', requireAuth, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const activity = AnalyticsService.getUploadActivity(req.user!.id, days);
    res.json(activity);
  } catch (error: any) {
    logger.error('Failed to get upload activity', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get analytics for all users
router.get('/admin', requireAdmin, async (req: Request, res: Response) => {
  try {
    const analytics = AnalyticsService.getAdminAnalytics();
    res.json(analytics);
  } catch (error: any) {
    logger.error('Failed to get admin analytics', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
