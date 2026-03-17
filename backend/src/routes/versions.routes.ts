import { Router, Request, Response } from 'express';
import { VersioningService } from '../services/versioning.service';
import { requireAuth } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

const router = Router();

// GET /api/files/:id/versions - List all versions of a file
router.get('/:id/versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const result = await VersioningService.listVersions(id, userId);
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error: any) {
    logger.error('List versions failed', { 
      fileId: req.params.id, 
      error: error.message 
    });
    throw error;
  }
});

// GET /api/files/:id/versions/:num/download - Download specific version
router.get('/:id/versions/:num/download', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, num } = req.params;
    const userId = req.user!.id;
    const versionNum = parseInt(num, 10);
    
    if (isNaN(versionNum) || versionNum < 1) {
      throw new ValidationError('Version number must be a positive integer');
    }
    
    await VersioningService.downloadVersion(id, versionNum, userId, res);
    
  } catch (error: any) {
    logger.error('Download version failed', { 
      fileId: req.params.id, 
      versionNum: req.params.num, 
      error: error.message 
    });
    
    if (!res.headersSent) {
      throw error;
    }
  }
});

// POST /api/files/:id/versions/:num/restore - Restore specific version
router.post('/:id/versions/:num/restore', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, num } = req.params;
    const userId = req.user!.id;
    const versionNum = parseInt(num, 10);
    
    if (isNaN(versionNum) || versionNum < 1) {
      throw new ValidationError('Version number must be a positive integer');
    }
    
    const updatedFile = await VersioningService.restoreVersion(id, versionNum, userId);
    
    res.json({
      success: true,
      file: updatedFile,
      message: `Restored to version ${versionNum}`
    });
    
  } catch (error: any) {
    logger.error('Restore version failed', { 
      fileId: req.params.id, 
      versionNum: req.params.num, 
      error: error.message 
    });
    throw error;
  }
});

// DELETE /api/files/:id/versions/:num - Delete specific version
router.delete('/:id/versions/:num', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, num } = req.params;
    const userId = req.user!.id;
    const versionNum = parseInt(num, 10);
    
    if (isNaN(versionNum) || versionNum < 1) {
      throw new ValidationError('Version number must be a positive integer');
    }
    
    await VersioningService.deleteVersion(id, versionNum, userId);
    
    res.json({
      success: true,
      message: `Version ${versionNum} deleted successfully`
    });
    
  } catch (error: any) {
    logger.error('Delete version failed', { 
      fileId: req.params.id, 
      versionNum: req.params.num, 
      error: error.message 
    });
    throw error;
  }
});

export default router;