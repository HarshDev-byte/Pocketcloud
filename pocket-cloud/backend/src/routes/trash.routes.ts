/**
 * Trash/recycle bin routes
 * Handles deleted file management and restoration
 */

import { Router } from 'express';
import { trashController } from '../controllers/trash.controller.js';
// Mock express-validator functions
const body = (field: string) => ({ run: () => Promise.resolve() });
const param = (field: string) => ({ run: () => Promise.resolve() });
const query = (field: string) => ({ run: () => Promise.resolve() });

const router = Router();

/**
 * GET /api/trash
 * List files and folders in trash
 */
router.get('/', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000'),
  
  query('sort')
    .optional()
    .isIn(['name', 'size', 'deleted_at', 'type'])
    .withMessage('Sort must be one of: name, size, deleted_at, type'),
  
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be asc or desc'),
  
  query('type')
    .optional()
    .isIn(['file', 'folder', 'all'])
    .withMessage('Type must be file, folder, or all'),
], trashController.listTrashItems);

/**
 * GET /api/trash/:uuid
 * Get trash item details
 */
router.get('/:uuid', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
], trashController.getTrashItem);

/**
 * POST /api/trash/:uuid/restore
 * Restore item from trash
 */
router.post('/:uuid/restore', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
  
  body('destination_path')
    .optional()
    .isString()
    .withMessage('Destination path must be a string'),
  
  body('new_name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('New name must be 1-255 characters'),
  
  body('overwrite')
    .optional()
    .isBoolean()
    .withMessage('Overwrite must be a boolean'),
], trashController.restoreItem);

/**
 * DELETE /api/trash/:uuid
 * Permanently delete item from trash
 */
router.delete('/:uuid', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
], trashController.permanentlyDelete);

/**
 * POST /api/trash/restore-multiple
 * Restore multiple items from trash
 */
router.post('/restore-multiple', [
  body('uuids')
    .isArray({ min: 1 })
    .withMessage('UUIDs array is required'),
  
  body('uuids.*')
    .isUUID()
    .withMessage('All UUIDs must be valid'),
  
  body('destination_path')
    .optional()
    .isString()
    .withMessage('Destination path must be a string'),
  
  body('overwrite')
    .optional()
    .isBoolean()
    .withMessage('Overwrite must be a boolean'),
], trashController.restoreMultiple);

/**
 * DELETE /api/trash/empty
 * Empty entire trash (permanently delete all items)
 */
router.delete('/empty', [
  body('confirm')
    .equals('DELETE_ALL')
    .withMessage('Confirmation required: confirm must equal "DELETE_ALL"'),
], trashController.emptyTrash);

/**
 * DELETE /api/trash/cleanup
 * Clean up old trash items (based on retention policy)
 */
router.delete('/cleanup', [
  body('older_than_days')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Older than days must be a positive integer'),
], trashController.cleanupOldItems);

/**
 * GET /api/trash/stats
 * Get trash statistics (count, total size, etc.)
 */
router.get('/stats', trashController.getTrashStats);

/**
 * POST /api/trash/move-to-trash
 * Move file or folder to trash (alternative to DELETE on files/folders)
 */
router.post('/move-to-trash', [
  body('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
  
  body('type')
    .isIn(['file', 'folder'])
    .withMessage('Type must be file or folder'),
], trashController.moveToTrash);

/**
 * GET /api/trash/retention-policy
 * Get current trash retention policy
 */
router.get('/retention-policy', trashController.getRetentionPolicy);

/**
 * PUT /api/trash/retention-policy
 * Update trash retention policy (admin only)
 */
router.put('/retention-policy', [
  body('auto_delete_days')
    .isInt({ min: 1, max: 365 })
    .withMessage('Auto delete days must be between 1 and 365'),
  
  body('max_trash_size_gb')
    .optional()
    .isFloat({ min: 0.1 })
    .withMessage('Max trash size must be at least 0.1 GB'),
  
  body('enabled')
    .isBoolean()
    .withMessage('Enabled must be a boolean'),
], trashController.updateRetentionPolicy);

export default router;