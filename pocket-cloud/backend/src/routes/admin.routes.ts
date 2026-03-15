/**
 * Admin routes for system management
 * Requires admin authentication for all endpoints
 */

import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// All admin routes require admin privileges
router.use(requireAdmin);

/**
 * GET /api/admin/dashboard
 * Get admin dashboard data (system stats, recent activity, etc.)
 */
router.get('/dashboard', adminController.getDashboard);

/**
 * GET /api/admin/system/stats
 * Get detailed system statistics
 */
router.get('/system/stats', adminController.getSystemStats);

/**
 * GET /api/admin/system/health
 * Get system health check results
 */
router.get('/system/health', adminController.getSystemHealth);

/**
 * POST /api/admin/system/restart
 * Restart system services or entire system
 */
router.post('/system/restart', adminController.restartSystem);

/**
 * GET /api/admin/users
 * List all users with pagination
 */
router.get('/users', adminController.listUsers);

/**
 * POST /api/admin/users
 * Create a new user
 */
router.post('/users', adminController.createUser);

/**
 * GET /api/admin/users/:id
 * Get user details
 */
router.get('/users/:id', adminController.getUser);

/**
 * PUT /api/admin/users/:id
 * Update user information
 */
router.put('/users/:id', adminController.updateUser);

/**
 * DELETE /api/admin/users/:id
 * Delete user account
 */
router.delete('/users/:id', adminController.deleteUser);

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password
 */
router.post('/users/:id/reset-password', adminController.resetUserPassword);

/**
 * GET /api/admin/storage
 * Get storage usage statistics
 */
router.get('/storage', adminController.getStorageStats);

/**
 * POST /api/admin/storage/cleanup
 * Run storage cleanup tasks
 */
router.post('/storage/cleanup', adminController.runStorageCleanup);

/**
 * GET /api/admin/logs
 * Get system logs
 */
router.get('/logs', adminController.getLogs);

/**
 * GET /api/admin/audit
 * Get audit log entries
 */
router.get('/audit', adminController.getAuditLog);

/**
 * GET /api/admin/settings
 * Get system settings
 */
router.get('/settings', adminController.getSettings);

/**
 * PUT /api/admin/settings
 * Update system settings
 */
router.put('/settings', adminController.updateSettings);

/**
 * POST /api/admin/backup
 * Create system backup
 */
router.post('/backup', adminController.createBackup);

/**
 * GET /api/admin/backups
 * List available backups
 */
router.get('/backups', adminController.listBackups);

/**
 * POST /api/admin/backups/:id/restore
 * Restore from backup
 */
router.post('/backups/:id/restore', adminController.restoreBackup);

export default router;