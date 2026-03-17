import { Router, Request, Response } from 'express';
import { AdminService } from '../services/admin.service';
import { requireAuth } from '../middleware/auth.middleware';
import { createActivityLogger } from '../middleware/activity.middleware';
import { Actions } from '../services/activity.service';
import { logger } from '../utils/logger';
import { ValidationError, ForbiddenError } from '../utils/errors';

const router = Router();

// Middleware to check admin role
const requireAdmin = (req: Request, res: Response, next: Function) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  next();
};

// Apply admin requirement to all routes
router.use(requireAuth);
router.use(requireAdmin);

// ===== USER MANAGEMENT =====

// GET /api/admin/users - Get all users with statistics
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await AdminService.getUsers();
    
    res.json({
      success: true,
      users
    });

  } catch (error: any) {
    logger.error('Get users failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// POST /api/admin/users - Create new user
router.post('/users',
  createActivityLogger(Actions.ADMIN_USER_CREATE, (req, res) => ({
    resourceType: 'user',
    resourceName: req.body.username,
    details: {
      role: req.body.role,
      quotaBytes: req.body.quotaBytes
    }
  })),
  async (req: Request, res: Response) => {
    try {
      const { username, password, role, quotaBytes } = req.body;

      // Validate input
      if (!username || typeof username !== 'string') {
        throw new ValidationError('Username is required');
      }

      if (!password || typeof password !== 'string') {
        throw new ValidationError('Password is required');
      }

      if (!role || !['admin', 'user'].includes(role)) {
        throw new ValidationError('Role must be "admin" or "user"');
      }

      if (quotaBytes !== undefined && (typeof quotaBytes !== 'number' || quotaBytes < 0)) {
        throw new ValidationError('Quota must be a positive number');
      }

      const user = await AdminService.createUser({
        username,
        password,
        role,
        quotaBytes
      });

      res.json({
        success: true,
        user
      });

    } catch (error: any) {
      logger.error('Create user failed', { 
        adminId: req.user?.id,
        username: req.body.username,
        error: error.message 
      });
      throw error;
    }
  });

// PATCH /api/admin/users/:id - Update user
router.patch('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role, quotaBytes, isActive, username } = req.body;
    const adminId = req.user!.id;

    const updates: any = {};
    if (role !== undefined) updates.role = role;
    if (quotaBytes !== undefined) updates.quotaBytes = quotaBytes;
    if (isActive !== undefined) updates.isActive = isActive;
    if (username !== undefined) updates.username = username;

    await AdminService.updateUser(id, updates, adminId);

    res.json({
      success: true,
      message: 'User updated successfully'
    });

  } catch (error: any) {
    logger.error('Update user failed', { 
      adminId: req.user?.id,
      userId: req.params.id,
      error: error.message 
    });
    throw error;
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id',
  createActivityLogger(Actions.ADMIN_USER_DELETE, (req) => {
    return {
      resourceType: 'user',
      resourceId: req.params.id,
      details: {
        deletedBy: req.user?.id
      }
    };
  }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminId = req.user!.id;

      // Require confirmation header
      if (req.headers['x-confirm-delete'] !== 'yes') {
        throw new ValidationError('Confirmation required: add header X-Confirm-Delete: yes');
      }

      await AdminService.deleteUser(id, adminId);

      res.json({
        success: true,
        message: 'User deleted successfully'
      });

    } catch (error: any) {
      logger.error('Delete user failed', { 
        adminId: req.user?.id,
        userId: req.params.id,
        error: error.message 
      });
      throw error;
    }
  });

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string') {
      throw new ValidationError('New password is required');
    }

    if (newPassword.length < 6) {
      throw new ValidationError('Password must be at least 6 characters');
    }

    await AdminService.resetUserPassword(id, newPassword);

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error: any) {
    logger.error('Reset password failed', { 
      adminId: req.user?.id,
      userId: req.params.id,
      error: error.message 
    });
    throw error;
  }
});

// POST /api/admin/users/:id/set-quota - Set user quota
router.post('/users/:id/set-quota', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { quotaBytes } = req.body;

    if (quotaBytes !== null && (typeof quotaBytes !== 'number' || quotaBytes < 0)) {
      throw new ValidationError('Quota must be null (unlimited) or a positive number');
    }

    await AdminService.setUserQuota(id, quotaBytes);

    res.json({
      success: true,
      message: 'Quota updated successfully'
    });

  } catch (error: any) {
    logger.error('Set quota failed', { 
      adminId: req.user?.id,
      userId: req.params.id,
      quotaBytes: req.body.quotaBytes,
      error: error.message 
    });
    throw error;
  }
});

// ===== STORAGE MANAGEMENT =====

// GET /api/admin/storage - Get comprehensive storage information
router.get('/storage', async (req: Request, res: Response) => {
  try {
    const storageInfo = await AdminService.getStorageInfo();
    
    res.json({
      success: true,
      storage: storageInfo
    });

  } catch (error: any) {
    logger.error('Get storage info failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// POST /api/admin/storage/scan-orphans - Scan for orphaned files
router.post('/storage/scan-orphans', async (req: Request, res: Response) => {
  try {
    const result = await AdminService.scanOrphanedFiles();
    
    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    logger.error('Scan orphans failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// POST /api/admin/storage/cleanup-orphans - Clean up orphaned files
router.post('/storage/cleanup-orphans', async (req: Request, res: Response) => {
  try {
    // Require confirmation header
    if (req.headers['x-confirm'] !== 'yes') {
      throw new ValidationError('Confirmation required: add header X-Confirm: yes');
    }

    const result = await AdminService.cleanupOrphanedFiles();
    
    res.json({
      success: true,
      message: 'Orphaned files cleaned up',
      ...result
    });

  } catch (error: any) {
    logger.error('Cleanup orphans failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// ===== SYSTEM MONITORING =====

// GET /api/admin/system - Get system information
router.get('/system', async (req: Request, res: Response) => {
  try {
    const systemInfo = await AdminService.getSystemInfo();
    
    res.json({
      success: true,
      system: systemInfo
    });

  } catch (error: any) {
    logger.error('Get system info failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// GET /api/admin/system/logs - Get system logs
router.get('/system/logs', async (req: Request, res: Response) => {
  try {
    const { limit, level } = req.query;
    
    const limitNum = limit ? Math.min(parseInt(limit as string, 10), 1000) : 100;
    const levelStr = level as string;

    const logs = await AdminService.getSystemLogs(limitNum, levelStr);
    
    res.json({
      success: true,
      ...logs
    });

  } catch (error: any) {
    logger.error('Get system logs failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// POST /api/admin/system/cleanup - Trigger manual cleanup
router.post('/system/cleanup',
  createActivityLogger(Actions.SYSTEM_CLEANUP, (req) => ({
    resourceType: 'system',
    details: {
      triggeredBy: req.user?.id,
      manual: true
    }
  })),
  async (req: Request, res: Response) => {
    try {
      const result = await AdminService.triggerCleanup();
      
      res.json({
        success: true,
        message: 'Cleanup completed',
        result
      });

    } catch (error: any) {
      logger.error('Manual cleanup failed', { 
        adminId: req.user?.id,
        error: error.message 
      });
      throw error;
    }
  });

// POST /api/admin/system/restart-backend - Restart backend service
router.post('/system/restart-backend', async (req: Request, res: Response) => {
  try {
    // Create restart flag file for systemd watchdog
    const flagPath = '/opt/pocketcloud/restart.flag';
    
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Ensure directory exists
      fs.mkdirSync(path.dirname(flagPath), { recursive: true });
      
      // Write restart flag
      fs.writeFileSync(flagPath, Date.now().toString());
      
      logger.info('Backend restart initiated by admin', { adminId: req.user?.id });
      
      res.json({
        success: true,
        message: 'Restart initiated — reconnect in 10 seconds'
      });
      
    } catch (error) {
      logger.warn('Failed to create restart flag, attempting graceful shutdown', { error });
      
      // Fallback: graceful shutdown
      setTimeout(() => {
        process.exit(0);
      }, 1000);
      
      res.json({
        success: true,
        message: 'Graceful restart initiated — reconnect in 10 seconds'
      });
    }

  } catch (error: any) {
    logger.error('Restart backend failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// ===== DASHBOARD STATS =====

// GET /api/admin/dashboard - Get all dashboard statistics
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const stats = await AdminService.getDashboardStats();
    
    res.json({
      success: true,
      dashboard: stats
    });

  } catch (error: any) {
    logger.error('Get dashboard stats failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// ===== QUOTA MANAGEMENT =====

// GET /api/admin/quota/overview - Get quota overview for all users
router.get('/quota/overview', async (req: Request, res: Response) => {
  try {
    const { QuotaService } = require('../services/quota.service');
    
    const allUsers = QuotaService.getMultiUserQuotaInfo();
    const statistics = QuotaService.getStorageStatistics();
    const usersNearQuota = QuotaService.getUsersNearQuota(0.8);
    
    res.json({
      success: true,
      quota: {
        users: allUsers,
        statistics,
        alerts: usersNearQuota
      }
    });

  } catch (error: any) {
    logger.error('Get quota overview failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// GET /api/admin/quota/alerts - Get users near or over quota
router.get('/quota/alerts', async (req: Request, res: Response) => {
  try {
    const { threshold } = req.query;
    const { QuotaService } = require('../services/quota.service');
    
    const warningThreshold = threshold ? parseFloat(threshold as string) : 0.8;
    const alerts = QuotaService.getUsersNearQuota(warningThreshold);
    
    res.json({
      success: true,
      alerts
    });

  } catch (error: any) {
    logger.error('Get quota alerts failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// ===== DEDUPLICATION MANAGEMENT =====

// GET /api/admin/storage/dedup-stats - Get deduplication statistics
router.get('/storage/dedup-stats', async (req: Request, res: Response) => {
  try {
    const { DedupService } = require('../services/dedup.service');
    const stats = DedupService.getDedupStats();
    
    res.json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    logger.error('Get dedup stats failed', { 
      adminId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// POST /api/admin/storage/dedup-scan - Scan and clean up orphaned content
router.post('/storage/dedup-scan', 
  createActivityLogger(Actions.ADMIN_SYSTEM_MAINTENANCE, (req, res) => ({
    resourceType: 'system',
    resourceName: 'deduplication-scan',
    details: { action: 'orphan-cleanup' }
  })),
  async (req: Request, res: Response) => {
    try {
      const { DedupService } = require('../services/dedup.service');
      const result = DedupService.scanOrphans();
      
      res.json({
        success: true,
        data: result
      });

      logger.info('Deduplication scan completed', {
        adminId: req.user?.id,
        orphansFound: result.orphansFound,
        orphansCleaned: result.orphansCleaned,
        bytesFreed: result.bytesFreed
      });

    } catch (error: any) {
      logger.error('Dedup scan failed', { 
        adminId: req.user?.id,
        error: error.message 
      });
      throw error;
    }
  }
);

export default router;