/**
 * File upload routes
 * Handles file uploads with progress tracking and validation
 */

import { Router, Request, Response, NextFunction } from 'express';
import { uploadController } from '../controllers/upload.controller.js';
import { 
  uploadSingle, 
  uploadMultiple, 
  uploadRateLimit, 
  uploadErrorHandler,
  validateUpload,
  processUpload 
} from '../middleware/upload.middleware.js';

// Manual validation helpers
const validateString = (value: any, fieldName: string, optional = false): string | null => {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== 'string') return `${fieldName} must be a string`;
  return null;
};

const validateInteger = (value: any, fieldName: string, min?: number, max?: number, optional = false): string | null => {
  if (optional && (value === undefined || value === null)) return null;
  const num = parseInt(value);
  if (isNaN(num)) return `${fieldName} must be an integer`;
  if (min !== undefined && num < min) return `${fieldName} must be at least ${min}`;
  if (max !== undefined && num > max) return `${fieldName} must be at most ${max}`;
  return null;
};

const validateBoolean = (value: any, fieldName: string, optional = false): string | null => {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
    return `${fieldName} must be a boolean`;
  }
  return null;
};

const validateUUID = (value: any, fieldName: string): string | null => {
  if (!value) return `${fieldName} is required`;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) return `${fieldName} must be a valid UUID`;
  return null;
};

const validateURL = (value: any, fieldName: string): string | null => {
  if (!value) return `${fieldName} is required`;
  try {
    new URL(value);
    return null;
  } catch {
    return `${fieldName} must be a valid URL`;
  }
};

const validateLength = (value: any, fieldName: string, min: number, max: number): string | null => {
  if (typeof value !== 'string') return `${fieldName} must be a string`;
  if (value.length < min || value.length > max) {
    return `${fieldName} must be ${min}-${max} characters`;
  }
  return null;
};

// Validation middleware factory
const createValidationMiddleware = (validations: Array<(req: Request) => string | null>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];
    
    for (const validation of validations) {
      const error = validation(req);
      if (error) errors.push(error);
    }
    
    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
      return;
    }
    
    next();
  };
};

const router = Router();

// Apply upload rate limiting to all upload routes
router.use(uploadRateLimit);

/**
 * POST /api/upload/single
 * Upload a single file
 */
router.post('/single', [
  validateUpload,
  uploadSingle('file'),
  processUpload,
  
  createValidationMiddleware([
    (req) => validateString(req.body.destination_path, 'Destination path', true),
    (req) => validateInteger(req.body.parent_folder_id, 'Parent folder ID', undefined, undefined, true),
    (req) => validateBoolean(req.body.encrypt, 'Encrypt', true),
    (req) => validateString(req.body.encryption_password, 'Encryption password', true)
  ])
], uploadController.uploadSingle, uploadErrorHandler);

/**
 * POST /api/upload/multiple
 * Upload multiple files
 */
router.post('/multiple', [
  validateUpload,
  uploadMultiple('files', 50), // Max 50 files per request
  processUpload,
  
  createValidationMiddleware([
    (req) => validateString(req.body.destination_path, 'Destination path', true),
    (req) => validateInteger(req.body.parent_folder_id, 'Parent folder ID', undefined, undefined, true),
    (req) => validateBoolean(req.body.create_folder, 'Create folder', true),
    (req) => req.body.folder_name ? validateLength(req.body.folder_name, 'Folder name', 1, 255) : null
  ])
], uploadController.uploadMultiple, uploadErrorHandler);

/**
 * POST /api/upload/chunk
 * Upload file chunk for resumable uploads
 */
router.post('/chunk', [
  validateUpload,
  
  createValidationMiddleware([
    (req) => validateInteger(req.body.chunk_index, 'Chunk index', 0),
    (req) => validateInteger(req.body.total_chunks, 'Total chunks', 1),
    (req) => validateUUID(req.body.file_uuid, 'File UUID'),
    (req) => validateString(req.body.chunk_hash, 'Chunk hash')
  ])
], uploadController.uploadChunk, uploadErrorHandler);

/**
 * POST /api/upload/complete
 * Complete chunked upload and assemble file
 */
router.post('/complete', [
  createValidationMiddleware([
    (req) => validateUUID(req.body.file_uuid, 'File UUID'),
    (req) => validateInteger(req.body.total_chunks, 'Total chunks', 1),
    (req) => validateString(req.body.file_hash, 'File hash'),
    (req) => validateString(req.body.destination_path, 'Destination path', true)
  ])
], uploadController.completeUpload);

/**
 * GET /api/upload/progress/:uuid
 * Get upload progress for a file
 */
router.get('/progress/:uuid', uploadController.getUploadProgress);

/**
 * DELETE /api/upload/:uuid
 * Cancel ongoing upload
 */
router.delete('/:uuid', uploadController.cancelUpload);

/**
 * POST /api/upload/url
 * Upload file from URL
 */
router.post('/url', [
  createValidationMiddleware([
    (req) => validateURL(req.body.url, 'URL'),
    (req) => validateString(req.body.destination_path, 'Destination path', true),
    (req) => req.body.filename ? validateLength(req.body.filename, 'Filename', 1, 255) : null
  ])
], uploadController.uploadFromUrl);

/**
 * POST /api/upload/extract
 * Extract uploaded archive (ZIP, TAR, etc.)
 */
router.post('/extract', [
  uploadSingle('archive'),
  
  createValidationMiddleware([
    (req) => validateString(req.body.destination_path, 'Destination path', true),
    (req) => validateBoolean(req.body.overwrite, 'Overwrite', true),
    (req) => validateBoolean(req.body.create_folder, 'Create folder', true)
  ])
], uploadController.extractArchive, uploadErrorHandler);

/**
 * GET /api/upload/quota
 * Get user's storage quota and usage
 */
router.get('/quota', uploadController.getStorageQuota);

/**
 * POST /api/upload/validate
 * Validate file before upload (check quota, permissions, etc.)
 */
router.post('/validate', [
  createValidationMiddleware([
    (req) => validateString(req.body.filename, 'Filename'),
    (req) => validateInteger(req.body.filesize, 'File size', 0),
    (req) => validateString(req.body.mimetype, 'MIME type', true),
    (req) => validateString(req.body.destination_path, 'Destination path', true)
  ])
], uploadController.validateUpload);

/**
 * GET /api/upload/recent
 * Get recently uploaded files
 */
router.get('/recent', [
  createValidationMiddleware([
    (req) => validateInteger(req.query.limit, 'Limit', 1, 100, true),
    (req) => validateInteger(req.query.days, 'Days', 1, 30, true)
  ])
], uploadController.getRecentUploads);

export default router;