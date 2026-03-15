/**
 * Folder management routes
 * Handles folder operations: create, list, rename, move, delete
 */

import { Router } from 'express';
import { foldersController } from '../controllers/folders.controller.js';
// Mock express-validator functions
const body = (field: string) => ({ run: () => Promise.resolve() });
const param = (field: string) => ({ run: () => Promise.resolve() });
const query = (field: string) => ({ run: () => Promise.resolve() });

const router = Router();

/**
 * GET /api/folders
 * List folders with optional filtering and pagination
 */
router.get('/', [
  query('path')
    .optional()
    .isString()
    .withMessage('Path must be a string'),
  
  query('parent_id')
    .optional()
    .isInt()
    .withMessage('Parent ID must be an integer'),
  
  query('recursive')
    .optional()
    .isBoolean()
    .withMessage('Recursive must be a boolean'),
], foldersController.listFolders);

/**
 * POST /api/folders
 * Create a new folder
 */
router.post('/', [
  body('name')
    .isString()
    .isLength({ min: 1, max: 255 })
    .matches(/^[^<>:"/\\|?*]+$/)
    .withMessage('Folder name must be 1-255 characters and not contain invalid characters'),
  
  body('path')
    .isString()
    .withMessage('Path is required'),
  
  body('parent_folder_id')
    .optional()
    .isInt()
    .withMessage('Parent folder ID must be an integer'),
], foldersController.createFolder);

/**
 * GET /api/folders/:uuid
 * Get folder information by UUID
 */
router.get('/:uuid', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
], foldersController.getFolder);

/**
 * PUT /api/folders/:uuid
 * Update folder (rename, move)
 */
router.put('/:uuid', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
  
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 255 })
    .matches(/^[^<>:"/\\|?*]+$/)
    .withMessage('Folder name must be 1-255 characters and not contain invalid characters'),
  
  body('path')
    .optional()
    .isString()
    .withMessage('Path must be a string'),
  
  body('parent_folder_id')
    .optional()
    .isInt()
    .withMessage('Parent folder ID must be an integer'),
], foldersController.updateFolder);

/**
 * DELETE /api/folders/:uuid
 * Delete folder (move to trash)
 */
router.delete('/:uuid', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
  
  query('recursive')
    .optional()
    .isBoolean()
    .withMessage('Recursive must be a boolean'),
], foldersController.deleteFolder);

/**
 * GET /api/folders/:uuid/contents
 * Get folder contents (files and subfolders)
 */
router.get('/:uuid/contents', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
  
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
    .isIn(['name', 'size', 'type', 'created_at', 'updated_at'])
    .withMessage('Sort must be one of: name, size, type, created_at, updated_at'),
  
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be asc or desc'),
  
  query('type')
    .optional()
    .isIn(['file', 'folder', 'all'])
    .withMessage('Type must be file, folder, or all'),
], foldersController.getFolderContents);

/**
 * POST /api/folders/:uuid/copy
 * Copy folder to another location
 */
router.post('/:uuid/copy', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
  
  body('destination_path')
    .isString()
    .withMessage('Destination path is required'),
  
  body('new_name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('New name must be 1-255 characters'),
  
  body('recursive')
    .optional()
    .isBoolean()
    .withMessage('Recursive must be a boolean'),
], foldersController.copyFolder);

/**
 * POST /api/folders/:uuid/move
 * Move folder to another location
 */
router.post('/:uuid/move', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
  
  body('destination_path')
    .isString()
    .withMessage('Destination path is required'),
], foldersController.moveFolder);

/**
 * GET /api/folders/:uuid/size
 * Calculate total size of folder and contents
 */
router.get('/:uuid/size', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
], foldersController.getFolderSize);

/**
 * POST /api/folders/:uuid/zip
 * Create ZIP archive of folder contents
 */
router.post('/:uuid/zip', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
  
  body('include_subfolders')
    .optional()
    .isBoolean()
    .withMessage('Include subfolders must be a boolean'),
  
  body('compression_level')
    .optional()
    .isInt({ min: 0, max: 9 })
    .withMessage('Compression level must be between 0 and 9'),
], foldersController.createZip);

/**
 * GET /api/folders/:uuid/share
 * Get folder sharing information
 */
router.get('/:uuid/share', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
], foldersController.getShareInfo);

/**
 * POST /api/folders/:uuid/share
 * Create folder share link
 */
router.post('/:uuid/share', [
  param('uuid')
    .isUUID()
    .withMessage('Valid UUID required'),
  
  body('share_type')
    .optional()
    .isIn(['link', 'password', 'user'])
    .withMessage('Share type must be link, password, or user'),
  
  body('password')
    .optional()
    .isString()
    .withMessage('Password must be a string'),
  
  body('expires_at')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be valid ISO 8601 date'),
  
  body('download_limit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Download limit must be a positive integer'),
], foldersController.createShare);

export default router;