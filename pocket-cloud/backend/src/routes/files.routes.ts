import { Router, Request, Response } from 'express';
import { promises as fs } from 'fs';
import multer from 'multer';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { fileService, NotFoundError, ForbiddenError, ValidationError } from '../services/file.service.js';
import { uploadService, UploadError, ChecksumError } from '../services/upload.service.js';
import { thumbnailService } from '../services/thumbnail.service.js';
import { File, Folder } from '../db/types.js';

const router = Router();

// Validation schemas
const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.number().optional()
});

const renameFolderSchema = z.object({
  name: z.string().min(1).max(255)
});

const moveFolderSchema = z.object({
  targetParentId: z.number().optional()
});

const renameFileSchema = z.object({
  name: z.string().min(1).max(255)
});

const moveFileSchema = z.object({
  targetFolderId: z.number().optional()
});

const copyFileSchema = z.object({
  targetFolderId: z.number().optional()
});

const initUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().min(1).max(10 * 1024 * 1024 * 1024), // 10GB max
  mimeType: z.string(),
  folderId: z.number().optional(),
  checksum: z.string().length(64) // SHA-256 hex
});

const searchSchema = z.object({
  q: z.string().min(1).max(100)
});

// Configure multer for simple uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB for simple uploads
  },
  storage: multer.memoryStorage()
});

// Folder routes
router.get('/api/folders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const contents = await fileService.listFolder(req.user!.id);
    return res.json({ success: true, data: contents });
  } catch (error) {
    console.error('List root folder error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list folder' });
  }
});

router.get('/api/folders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const folderId = req.params.id;
    const contents = await fileService.listFolder(req.user!.id, folderId);
    return res.json({ success: true, data: contents });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('List folder error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list folder' });
  }
});

router.post('/api/folders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, parentId } = createFolderSchema.parse(req.body);
    const folder = await fileService.createFolder(req.user!.id, name, parentId);
    return res.status(201).json({ success: true, data: folder });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Create folder error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create folder' });
  }
});

router.patch('/api/folders/:id/rename', authMiddleware, async (req: Request, res: Response) => {
  try {
    const folderId = parseInt(req.params.id);
    const { name } = renameFolderSchema.parse(req.body);
    const folder = await fileService.renameFolder(folderId, req.user!.id, name);
    return res.json({ success: true, data: folder });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Rename folder error:', error);
    return res.status(500).json({ success: false, error: 'Failed to rename folder' });
  }
});
router.patch('/api/folders/:id/move', authMiddleware, async (req: Request, res: Response) => {
  try {
    const folderId = parseInt(req.params.id);
    const { targetParentId } = moveFolderSchema.parse(req.body);
    const folder = await fileService.moveFolder(folderId, req.user!.id, targetParentId);
    res.json({ success: true, data: folder });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Move folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to move folder' });
  }
});

router.delete('/api/folders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const folderId = parseInt(req.params.id);
    await fileService.softDeleteFolder(folderId, req.user!.id);
    res.json({ success: true, message: 'Folder deleted successfully' });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Delete folder error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete folder' });
  }
});

// File routes
router.get('/api/files/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = await fileService.getFile(fileId, req.user!.id);
    res.json({ success: true, data: file });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Get file error:', error);
    res.status(500).json({ success: false, error: 'Failed to get file' });
  }
});

router.get('/api/files/:id/download', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.id);
    const rangeHeader = req.headers.range;
    await fileService.downloadFile(fileId, req.user!.id, res, rangeHeader);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Download file error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to download file' });
    }
  }
});

router.get('/api/files/:id/preview', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = await fileService.getFile(fileId, req.user!.id);
    
    // Generate thumbnail if not exists
    const thumbnailPath = await thumbnailService.generateThumbnail(
      file.id.toString(),
      file.full_path,
      file.mime_type || 'application/octet-stream'
    );

    if (!thumbnailPath) {
      return res.status(404).json({ success: false, error: 'Preview not available' });
    }

    // Stream thumbnail
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    
    const fs = await import('fs');
    const stream = fs.createReadStream(thumbnailPath);
    stream.pipe(res);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Preview file error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to generate preview' });
    }
  }
});

router.patch('/api/files/:id/rename', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.id);
    const { name } = renameFileSchema.parse(req.body);
    const file = await fileService.renameFile(fileId, req.user!.id, name);
    res.json({ success: true, data: file });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Rename file error:', error);
    res.status(500).json({ success: false, error: 'Failed to rename file' });
  }
});

router.patch('/api/files/:id/move', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.id);
    const { targetFolderId } = moveFileSchema.parse(req.body);
    const file = await fileService.moveFile(fileId, req.user!.id, targetFolderId);
    res.json({ success: true, data: file });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Move file error:', error);
    res.status(500).json({ success: false, error: 'Failed to move file' });
  }
});

router.post('/api/files/:id/copy', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.id);
    const { targetFolderId } = copyFileSchema.parse(req.body);
    const file = await fileService.copyFile(fileId, req.user!.id, targetFolderId);
    res.json({ success: true, data: file });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Copy file error:', error);
    res.status(500).json({ success: false, error: 'Failed to copy file' });
  }
});

router.delete('/api/files/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.id);
    await fileService.softDeleteFile(fileId, req.user!.id);
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('Delete file error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete file' });
  }
});
// Upload routes
router.post('/api/upload/init', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uploadParams = initUploadSchema.parse(req.body);
    const result = await uploadService.initUpload(req.user!.id, uploadParams);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    if (error instanceof UploadError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Init upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to initialize upload' });
  }
});

router.put('/api/upload/:id/chunk/:index', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id;
    const chunkIndex = parseInt(req.params.index);
    
    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return res.status(400).json({ success: false, error: 'Invalid chunk index' });
    }

    // Get raw buffer from request
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const data = Buffer.concat(chunks);
        await uploadService.saveChunk(uploadId, chunkIndex, data);
        res.json({ success: true, message: 'Chunk saved successfully' });
      } catch (error) {
        if (error instanceof UploadError) {
          return res.status(400).json({ success: false, error: error.message });
        }
        console.error('Save chunk error:', error);
        res.status(500).json({ success: false, error: 'Failed to save chunk' });
      }
    });
  } catch (error) {
    console.error('Upload chunk error:', error);
    res.status(500).json({ success: false, error: 'Failed to process chunk' });
  }
});

router.get('/api/upload/:id/progress', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id;
    const progress = uploadService.getProgress(uploadId);
    res.json({ success: true, data: progress });
  } catch (error) {
    if (error instanceof UploadError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    console.error('Get upload progress error:', error);
    res.status(500).json({ success: false, error: 'Failed to get upload progress' });
  }
});

router.post('/api/upload/:id/complete', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id;
    const file = await uploadService.completeUpload(uploadId);
    res.json({ success: true, data: file });
  } catch (error) {
    if (error instanceof UploadError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof ChecksumError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Complete upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete upload' });
  }
});

router.delete('/api/upload/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const uploadId = req.params.id;
    await uploadService.abortUpload(uploadId);
    res.json({ success: true, message: 'Upload aborted successfully' });
  } catch (error) {
    if (error instanceof UploadError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    console.error('Abort upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to abort upload' });
  }
});

// Simple upload for small files (< 10MB)
router.post('/api/files/simple', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const { folderId } = req.body;
    const file = req.file;
    
    // Calculate checksum
    const crypto = await import('crypto');
    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Initialize upload
    const uploadResult = await uploadService.initUpload(req.user!.id, {
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      folderId: folderId ? parseInt(folderId) : undefined,
      checksum
    });

    // Save as single chunk
    await uploadService.saveChunk(uploadResult.uploadId, 0, file.buffer);

    // Complete upload
    const completedFile = await uploadService.completeUpload(uploadResult.uploadId);

    res.status(201).json({ success: true, data: completedFile });
  } catch (error) {
    if (error instanceof UploadError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof ChecksumError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Simple upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload file' });
  }
});

// Search files
router.get('/api/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { q } = searchSchema.parse(req.query);
    
    // Simple name-based search (can be enhanced with FTS later)
    const { getDatabase } = await import('../db/client.js');
    const db = getDatabase();
    
    const files = db.prepare(`
      SELECT f.*, 'file' as type FROM files f
      WHERE f.owner_id = ? AND f.is_deleted = 0 AND f.name LIKE ?
      UNION ALL
      SELECT fo.*, 'folder' as type FROM folders fo
      WHERE fo.owner_id = ? AND fo.is_deleted = 0 AND fo.name LIKE ?
      ORDER BY name ASC
      LIMIT 50
    `).all([req.user!.id, `%${q}%`, req.user!.id, `%${q}%`]);

    return res.json({ success: true, data: files });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid search query', details: error.errors });
    }
    console.error('Search error:', error);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Storage stats
router.get('/api/storage/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await fileService.getStorageStats(req.user!.id);
    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Storage stats error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get storage stats' });
  }
});

// Trash routes
router.get('/api/trash', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { getDatabase } = await import('../db/client.js');
    const db = getDatabase();
    
    // Get deleted files and folders
    const deletedFiles = db.prepare(`
      SELECT *, 'file' as type FROM files 
      WHERE owner_id = ? AND is_deleted = 1 
      ORDER BY deleted_at DESC
    `).all([req.user!.id]);
    
    const deletedFolders = db.prepare(`
      SELECT *, 'folder' as type FROM folders 
      WHERE owner_id = ? AND is_deleted = 1 
      ORDER BY deleted_at DESC
    `).all([req.user!.id]);
    
    const items = [...deletedFiles, ...deletedFolders].sort((a, b) => 
      (b.deleted_at || 0) - (a.deleted_at || 0)
    );
    
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('List trash error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list trash items' });
  }
});

router.post('/api/trash/:id/restore', authMiddleware, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const { type } = req.body;
    
    if (!type || !['file', 'folder'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Type must be file or folder' });
    }
    
    const { getDatabase } = await import('../db/client.js');
    const db = getDatabase();
    const now = Date.now();
    
    if (type === 'file') {
      // Check file exists and is owned by user
      const file = db.prepare(`
        SELECT * FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 1
      `).get([itemId, req.user!.id]);
      
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found in trash' });
      }
      
      // Restore file
      db.prepare(`
        UPDATE files SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?
      `).run([now, itemId]);
      
    } else {
      // Check folder exists and is owned by user
      const folder = db.prepare(`
        SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 1
      `).get([itemId, req.user!.id]);
      
      if (!folder) {
        return res.status(404).json({ success: false, error: 'Folder not found in trash' });
      }
      
      // Restore folder and all its contents
      const transaction = db.transaction(() => {
        // Restore the folder
        db.prepare(`
          UPDATE folders SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?
        `).run([now, itemId]);
        
        // Restore all files in this folder and subfolders
        db.prepare(`
          UPDATE files SET is_deleted = 0, deleted_at = NULL, updated_at = ?
          WHERE owner_id = ? AND (
            parent_folder_id = ? OR 
            parent_folder_id IN (
              SELECT id FROM folders WHERE path LIKE ? AND owner_id = ?
            )
          )
        `).run([now, req.user!.id, itemId, `${folder.path}/%`, req.user!.id]);
        
        // Restore all subfolders
        db.prepare(`
          UPDATE folders SET is_deleted = 0, deleted_at = NULL, updated_at = ?
          WHERE owner_id = ? AND path LIKE ?
        `).run([now, req.user!.id, `${folder.path}/%`]);
      });
      
      transaction();
    }
    
    return res.json({ success: true, message: 'Item restored successfully' });
  } catch (error) {
    console.error('Restore item error:', error);
    return res.status(500).json({ success: false, error: 'Failed to restore item' });
  }
});

router.delete('/api/trash/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const { type } = req.body;
    
    if (!type || !['file', 'folder'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Type must be file or folder' });
    }
    
    const { getDatabase } = await import('../db/client.js');
    const db = getDatabase();
    
    if (type === 'file') {
      // Check file exists and is owned by user
      const file = db.prepare(`
        SELECT * FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 1
      `).get([itemId, req.user!.id]) as File | undefined;
      
      if (!file) {
        return res.status(404).json({ success: false, error: 'File not found in trash' });
      }
      
      // Delete file from disk
      try {
        await fs.unlink(file.full_path);
      } catch (error) {
        console.warn('Failed to delete file from disk:', error);
      }
      
      // Delete from database
      db.prepare('DELETE FROM files WHERE id = ?').run([itemId]);
      
      // Update user storage usage
      db.prepare(`
        UPDATE users SET storage_used = storage_used - ? WHERE id = ?
      `).run([file.size, req.user!.id]);
      
    } else {
      // Check folder exists and is owned by user
      const folder = db.prepare(`
        SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 1
      `).get([itemId, req.user!.id]) as Folder | undefined;
      
      if (!folder) {
        return res.status(404).json({ success: false, error: 'Folder not found in trash' });
      }
      
      // Get all files in folder and subfolders for storage calculation
      const files = db.prepare(`
        SELECT size FROM files 
        WHERE owner_id = ? AND is_deleted = 1 AND (
          parent_folder_id = ? OR 
          parent_folder_id IN (
            SELECT id FROM folders WHERE path LIKE ? AND owner_id = ? AND is_deleted = 1
          )
        )
      `).all([req.user!.id, itemId, `${folder.path}/%`, req.user!.id]) as { size: number }[];
      
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      
      // Delete folder and contents from disk
      try {
        await fs.rm(folder.full_path, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to delete folder from disk:', error);
      }
      
      // Delete from database
      const transaction = db.transaction(() => {
        // Delete all files in folder and subfolders
        db.prepare(`
          DELETE FROM files 
          WHERE owner_id = ? AND is_deleted = 1 AND (
            parent_folder_id = ? OR 
            parent_folder_id IN (
              SELECT id FROM folders WHERE path LIKE ? AND owner_id = ? AND is_deleted = 1
            )
          )
        `).run([req.user!.id, itemId, `${folder.path}/%`, req.user!.id]);
        
        // Delete all subfolders
        db.prepare(`
          DELETE FROM folders 
          WHERE owner_id = ? AND is_deleted = 1 AND path LIKE ?
        `).run([req.user!.id, `${folder.path}/%`]);
        
        // Delete the folder itself
        db.prepare('DELETE FROM folders WHERE id = ?').run([itemId]);
      });
      
      transaction();
      
      // Update user storage usage
      if (totalSize > 0) {
        db.prepare(`
          UPDATE users SET storage_used = storage_used - ? WHERE id = ?
        `).run([totalSize, req.user!.id]);
      }
    }
    
    return res.json({ success: true, message: 'Item permanently deleted' });
  } catch (error) {
    console.error('Permanent delete error:', error);
    return res.status(500).json({ success: false, error: 'Failed to permanently delete item' });
  }
});

router.delete('/api/trash/empty', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { getDatabase } = await import('../db/client.js');
    const db = getDatabase();
    
    // Get all deleted files for storage calculation
    const deletedFiles = db.prepare(`
      SELECT full_path, size FROM files WHERE owner_id = ? AND is_deleted = 1
    `).all([req.user!.id]) as { full_path: string; size: number }[];
    
    // Get all deleted folders
    const deletedFolders = db.prepare(`
      SELECT full_path FROM folders WHERE owner_id = ? AND is_deleted = 1
    `).all([req.user!.id]) as { full_path: string }[];
    
    const totalSize = deletedFiles.reduce((sum, f) => sum + f.size, 0);
    
    // Delete files from disk
    for (const file of deletedFiles) {
      try {
        await fs.unlink(file.full_path);
      } catch (error) {
        console.warn('Failed to delete file:', file.full_path, error);
      }
    }
    
    // Delete folders from disk
    for (const folder of deletedFolders) {
      try {
        await fs.rm(folder.full_path, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to delete folder:', folder.full_path, error);
      }
    }
    
    // Delete from database
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM files WHERE owner_id = ? AND is_deleted = 1').run([req.user!.id]);
      db.prepare('DELETE FROM folders WHERE owner_id = ? AND is_deleted = 1').run([req.user!.id]);
    });
    
    transaction();
    
    // Update user storage usage
    if (totalSize > 0) {
      db.prepare(`
        UPDATE users SET storage_used = storage_used - ? WHERE id = ?
      `).run([totalSize, req.user!.id]);
    }
    
    return res.json({ 
      success: true, 
      message: 'Trash emptied successfully',
      data: {
        deletedFiles: deletedFiles.length,
        deletedFolders: deletedFolders.length,
        freedSpace: totalSize
      }
    });
  } catch (error) {
    console.error('Empty trash error:', error);
    return res.status(500).json({ success: false, error: 'Failed to empty trash' });
  }
});

export default router;