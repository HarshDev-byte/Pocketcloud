import { Router, Request, Response } from 'express';
import { ActivityService } from '../services/activity.service';
import { requireAuth } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

const router = Router();

// Middleware to check admin role
const requireAdmin = (req: Request, res: Response, next: Function) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required'
      }
    });
  }
  next();
};

// GET /api/activity - Get user's own activity log
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { action, dateFrom, dateTo, limit, offset } = req.query;
    
    const options = {
      userId: req.user!.id, // Users can only see their own activity
      action: action as string,
      dateFrom: dateFrom ? parseInt(dateFrom as string, 10) : undefined,
      dateTo: dateTo ? parseInt(dateTo as string, 10) : undefined,
      limit: limit ? Math.min(parseInt(limit as string, 10), 100) : 50,
      offset: offset ? Math.max(parseInt(offset as string, 10), 0) : 0
    };

    const result = await ActivityService.getActivityLog(options);
    
    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    logger.error('Get activity log failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// GET /api/activity/recent - Get recent activity for dashboard
router.get('/recent', requireAuth, async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const userId = req.user!.id;
    
    const limitNum = limit ? Math.min(parseInt(limit as string, 10), 50) : 20;
    const entries = await ActivityService.getRecentActivity(userId, limitNum);
    
    res.json({
      success: true,
      entries
    });

  } catch (error: any) {
    logger.error('Get recent activity failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// GET /api/activity/stats - Get activity statistics
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await ActivityService.getActivityStats(userId);
    
    res.json({
      success: true,
      stats
    });

  } catch (error: any) {
    logger.error('Get activity stats failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// ADMIN ROUTES

// GET /api/admin/activity - Get all users' activity (admin only)
router.get('/admin/activity', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, action, resourceType, dateFrom, dateTo, limit, offset } = req.query;
    
    const options = {
      userId: userId as string, // Admin can filter by any user
      action: action as string,
      resourceType: resourceType as string,
      dateFrom: dateFrom ? parseInt(dateFrom as string, 10) : undefined,
      dateTo: dateTo ? parseInt(dateTo as string, 10) : undefined,
      limit: limit ? Math.min(parseInt(limit as string, 10), 200) : 50,
      offset: offset ? Math.max(parseInt(offset as string, 10), 0) : 0
    };

    const result = await ActivityService.getActivityLog(options);
    
    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    logger.error('Get admin activity log failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// GET /api/admin/activity/stats - Get system-wide activity statistics (admin only)
router.get('/admin/activity/stats', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await ActivityService.getActivityStats(); // No userId = system-wide
    
    res.json({
      success: true,
      stats
    });

  } catch (error: any) {
    logger.error('Get admin activity stats failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

export default router;