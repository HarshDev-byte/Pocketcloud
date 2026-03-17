import { Router, Request, Response } from 'express';
import { FileService } from '../services/file.service';
import { TrashService } from '../services/trash.service';
import { ZipService } from '../services/zip.service';
import { QuotaService } from '../services/quota.service';
import { requireAuth } from '../middleware/auth.middleware';
import { createActivityLogger } from '../middleware/activity.middleware';
import { Actions } from '../services/activity.service';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

const router = Router();

// GET /api/files/folder - List root folder contents
router.get('/folder', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const contents = await FileService.listFolder(userId);
    
    res.json({
      success: true,
      ...contents
    });
  } catch (error: any) {
    logger.error('List folder failed', { error: error.message });
    throw error;
  }
});

// GET /api/files/folder/:id - List specific folder contents
router.get('/folder/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const contents = await FileService.listFolder(userId, id);
    
    res.json({
      success: true,
      ...contents
    });
  } catch (error: any) {
    logger.error('List folder failed', { folderId: req.params.id, error: error.message });
    throw error;
  }
});

// GET /api/files/folder/:id/download - Download folder as ZIP
router.get('/folder/:id/download', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estimate } = req.query;
    const userId = req.user!.id;
    
    // If estimate=true, return size estimate without streaming
    if (estimate === 'true') {
      const sizeEstimate = await ZipService.getZipSizeEstimate(id, userId);
      
      res.json({
        success: true,
        ...sizeEstimate
      });
      return;
    }
    
    // Stream the folder as ZIP
    await ZipService.streamFolderZip(id, userId, res);
    
  } catch (error: any) {
    logger.error('Download folder as ZIP failed', { 
      folderId: req.params.id, 
      estimate: req.query.estimate,
      error: error.message 
    });
    
    if (!res.headersSent) {
      throw error;
    }
  }
});

// GET /api/files/folder/download - Download root folder as ZIP
router.get('/folder/download', requireAuth, async (req: Request, res: Response) => {
  try {
    const { estimate } = req.query;
    const userId = req.user!.id;
    
    // If estimate=true, return size estimate without streaming
    if (estimate === 'true') {
      const sizeEstimate = await ZipService.getZipSizeEstimate(null, userId);
      
      res.json({
        success: true,
        ...sizeEstimate
      });
      return;
    }
    
    // Stream the root folder as ZIP
    await ZipService.streamFolderZip(null, userId, res);
    
  } catch (error: any) {
    logger.error('Download root folder as ZIP failed', { 
      estimate: req.query.estimate,
      error: error.message 
    });
    
    if (!res.headersSent) {
      throw error;
    }
  }
});

// POST /api/files/download-multiple - Download multiple files as ZIP
router.post('/download-multiple', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileIds, zipName, estimate } = req.body;
    const userId = req.user!.id;
    
    // Validate input
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'fileIds must be a non-empty array'
        }
      });
    }
    
    if (fileIds.length > 500) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_FILES',
          message: 'Cannot download more than 500 files at once'
        }
      });
    }
    
    // Validate all fileIds are strings
    if (!fileIds.every((id: any) => typeof id === 'string')) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_IDS',
          message: 'All file IDs must be strings'
        }
      });
    }
    
    // If estimate=true, return size estimate without streaming
    if (estimate === true) {
      const sizeEstimate = await ZipService.getMultiFileZipSizeEstimate(fileIds, userId);
      
      res.json({
        success: true,
        ...sizeEstimate
      });
      return;
    }
    
    // Stream the files as ZIP
    const sanitizedZipName = (zipName && typeof zipName === 'string') 
      ? zipName.trim() 
      : 'files';
      
    await ZipService.streamMultiFileZip(fileIds, userId, sanitizedZipName, res);
    
  } catch (error: any) {
    logger.error('Download multiple files as ZIP failed', { 
      fileCount: req.body.fileIds?.length,
      zipName: req.body.zipName,
      estimate: req.body.estimate,
      error: error.message 
    });
    
    if (!res.headersSent) {
      throw error;
    }
  }
});

// POST /api/files/folder - Create new folder
router.post('/folder', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, parentId } = req.body;
    
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Folder name is required');
    }
    
    const userId = req.user!.id;
    
    const folder = await FileService.createFolder(userId, name, parentId);
    
    res.json({
      success: true,
      folder
    });
  } catch (error: any) {
    logger.error('Create folder failed', { name: req.body.name, error: error.message });
    throw error;
  }
});

// PATCH /api/files/folder/:id/rename - Rename folder
router.patch('/folder/:id/rename', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      throw new ValidationError('New folder name is required');
    }
    
    const userId = req.user!.id;
    
    const folder = await FileService.renameFolder(id, userId, name);
    
    res.json({
      success: true,
      folder
    });
  } catch (error: any) {
    logger.error('Rename folder failed', { folderId: req.params.id, error: error.message });
    throw error;
  }
});

// DELETE /api/files/folder/:id - Soft delete folder
router.delete('/folder/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    await TrashService.softDeleteFolder(id, userId);
    
    res.json({
      success: true,
      message: 'Folder moved to trash'
    });
  } catch (error: any) {
    logger.error('Delete folder failed', { folderId: req.params.id, error: error.message });
    throw error;
  }
});

// GET /api/files/photos - Get photo files for gallery
router.get('/photos', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const photos = await FileService.getPhotoFiles(userId);
    
    res.json({
      success: true,
      files: photos
    });
  } catch (error: any) {
    logger.error('Get photos failed', { error: error.message });
    throw error;
  }
});

// GET /api/files/recent - Get recently accessed files
router.get('/recent', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const files = await FileService.getRecentFiles(userId, limit);
    
    res.json({
      success: true,
      files
    });
  } catch (error: any) {
    logger.error('Get recent files failed', { error: error.message });
    throw error;
  }
});

// GET /api/files/:id/shares - Get shares for a specific file
router.get('/:id/shares', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const shares = await FileService.getFileShares(id, userId);
    
    res.json({
      success: true,
      shares
    });
  } catch (error: any) {
    logger.error('Get file shares failed', { fileId: req.params.id, error: error.message });
    throw error;
  }
});

// POST /api/files/:id/share - Create share for a specific file
router.post('/:id/share', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const share = await FileService.createFileShare(id, userId, req.body);
    
    res.json({
      success: true,
      share
    });
  } catch (error: any) {
    logger.error('Create file share failed', { fileId: req.params.id, error: error.message });
    throw error;
  }
});

// GET /api/files/stats - Get storage statistics
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const stats = await FileService.getStorageStats(userId);
    const quotaInfo = QuotaService.getQuotaInfo(userId);
    
    res.json({
      success: true,
      stats: {
        ...stats,
        quota: quotaInfo
      }
    });
  } catch (error: any) {
    logger.error('Get storage stats failed', { error: error.message });
    throw error;
  }
});

// GET /api/files/trash - List deleted files and folders (DEPRECATED - use /api/trash)
router.get('/trash', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const result = await TrashService.listTrash(userId);
    
    res.json({
      success: true,
      files: result.items.filter(item => item.item_type === 'file'),
      folders: result.items.filter(item => item.item_type === 'folder')
    });
  } catch (error: any) {
    logger.error('List trash failed', { error: error.message });
    throw error;
  }
});

// POST /api/files/trash/:id/restore - Restore file from trash (DEPRECATED - use /api/trash)
router.post('/trash/:id/restore', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    // Try to restore as file first, then folder if not found
    try {
      const result = await TrashService.restoreFile(id, userId);
      res.json({
        success: true,
        message: 'File restored successfully',
        item: result.item,
        restoredToRoot: result.restoredToRoot
      });
    } catch (fileError) {
      const result = await TrashService.restoreFolder(id, userId);
      res.json({
        success: true,
        message: 'Folder restored successfully',
        item: result.item,
        restoredToRoot: result.restoredToRoot
      });
    }
  } catch (error: any) {
    logger.error('Restore file failed', { fileId: req.params.id, error: error.message });
    throw error;
  }
});

// DELETE /api/files/trash/:id - Permanently delete file (DEPRECATED - use /api/trash)
router.delete('/trash/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    // Try to delete as file first, then folder if not found
    let bytesFreed = 0;
    try {
      bytesFreed = await TrashService.permanentDeleteFile(id, userId);
    } catch (fileError) {
      bytesFreed = await TrashService.permanentDeleteFolder(id, userId);
    }
    
    res.json({
      success: true,
      message: 'Item permanently deleted',
      bytesFreed
    });
  } catch (error: any) {
    logger.error('Permanent delete failed', { fileId: req.params.id, error: error.message });
    throw error;
  }
});

// GET /api/files/:id - Get file metadata
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const file = await FileService.getFile(id, userId);
    
    res.json({
      success: true,
      file
    });
  } catch (error: any) {
    logger.error('Get file failed', { fileId: req.params.id, error: error.message });
    throw error;
  }
});

// GET /api/files/:id/download - Download file (supports Range header)
router.get('/:id/download', 
  requireAuth, 
  createActivityLogger(Actions.FILE_DOWNLOAD, (req) => {
    return {
      resourceType: 'file',
      resourceId: req.params.id,
      details: {
        hasRangeHeader: !!req.headers.range,
        userAgent: req.get('User-Agent')
      }
    };
  }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rangeHeader = req.headers.range;
      
      const userId = req.user!.id;
      
      await FileService.streamFile(id, userId, res, rangeHeader);
    } catch (error: any) {
      logger.error('Download file failed', { fileId: req.params.id, error: error.message });
      
      if (!res.headersSent) {
        throw error;
      }
    }
  });

// PATCH /api/files/:id/rename - Rename file
router.patch('/:id/rename', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      throw new ValidationError('New file name is required');
    }
    
    const userId = req.user!.id;
    
    const file = await FileService.renameFile(id, userId, name);
    
    res.json({
      success: true,
      file
    });
  } catch (error: any) {
    logger.error('Rename file failed', { fileId: req.params.id, error: error.message });
    throw error;
  }
});

// PATCH /api/files/:id/move - Move file to different folder
router.patch('/:id/move', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { folderId } = req.body;
    
    const userId = req.user!.id;
    
    const file = await FileService.moveFile(id, userId, folderId);
    
    res.json({
      success: true,
      file
    });
  } catch (error: any) {
    logger.error('Move file failed', { fileId: req.params.id, error: error.message });
    throw error;
  }
});

// DELETE /api/files/:id - Soft delete file
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    await TrashService.softDeleteFile(id, userId);
    
    res.json({
      success: true,
      message: 'File moved to trash'
    });
  } catch (error: any) {
    logger.error('Delete file failed', { fileId: req.params.id, error: error.message });
    throw error;
  }
});

export default router;