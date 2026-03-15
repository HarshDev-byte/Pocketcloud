import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { versioningService } from '../services/versioning.service.js';
import { LoggerService } from '../services/logger.service.js';

// Import fs using eval to avoid TypeScript module resolution issues
const fs = eval('require')('fs');
const db = eval('require')('../db/index.js');

const router = Router();

/**
 * GET /api/files/:id/versions
 * List all versions for a file
 */
router.get('/:id/versions', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: fileId } = req.params;
    const userId = req.user?.id;

    // Verify user has access to this file
    const fileStmt = db.prepare(`
      SELECT owner_id FROM files 
      WHERE id = ? AND is_deleted = 0
    `);
    
    const file = fileStmt.get(parseInt(fileId));
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (file.owner_id !== userId && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const versions = versioningService.getVersions(fileId);
    
    res.json({
      success: true,
      data: {
        fileId,
        versions,
        totalVersions: versions.length,
        storageUsed: versions.reduce((sum: number, v: any) => sum + v.size, 0)
      }
    });

  } catch (error: any) {
    const { id: fileId } = req.params;
    LoggerService.error('versions', 'Get versions error', req.user?.id?.toString(), { error: error.message, fileId });
    res.status(500).json({ error: 'Failed to get versions' });
  }
});

/**
 * GET /api/files/:id/versions/:num
 * Get metadata for a specific version
 */
router.get('/:id/versions/:num', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: fileId, num: versionNum } = req.params;
    const userId = req.user?.id;

    // Verify access
    const fileStmt = db.prepare(`
      SELECT owner_id FROM files 
      WHERE id = ? AND is_deleted = 0
    `);
    
    const file = fileStmt.get(parseInt(fileId));
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (file.owner_id !== userId && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const versions = versioningService.getVersions(fileId);
    const version = versions.find((v: any) => v.versionNum === parseInt(versionNum));
    
    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    res.json({
      success: true,
      data: version
    });

  } catch (error: any) {
    const { id: fileId, num: versionNum } = req.params;
    LoggerService.error('versions', 'Get version metadata error', req.user?.id?.toString(), { error: error.message, fileId, versionNum });
    res.status(500).json({ error: 'Failed to get version metadata' });
  }
});

/**
 * GET /api/files/:id/versions/:num/download
 * Download a specific version
 */
router.get('/:id/versions/:num/download', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: fileId, num: versionNum } = req.params;
    const userId = req.user?.id;

    // Verify access
    const fileStmt = db.prepare(`
      SELECT owner_id, name FROM files 
      WHERE id = ? AND is_deleted = 0
    `);
    
    const file = fileStmt.get(parseInt(fileId));
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (file.owner_id !== userId && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const versions = versioningService.getVersions(fileId);
    const version = versions.find((v: any) => v.versionNum === parseInt(versionNum));
    
    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    if (!fs.existsSync(version.storagePath)) {
      res.status(404).json({ error: 'Version file not found on disk' });
      return;
    }

    const stats = fs.statSync(version.storagePath);
    
    // Set headers for download
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Length', stats.size.toString());
    res.set('Content-Disposition', `attachment; filename="${file.name}"`);
    res.set('X-Version-Number', version.versionNum.toString());
    res.set('X-Version-Created-At', version.createdAt.toString());

    // Stream the file
    const stream = fs.createReadStream(version.storagePath);
    stream.pipe(res);

    LoggerService.info('versions', `Downloaded version ${versionNum} of file ${fileId}`, userId?.toString(), { fileId, versionNum });

  } catch (error: any) {
    const { id: fileId, num: versionNum } = req.params;
    LoggerService.error('versions', 'Download version error', req.user?.id?.toString(), { error: error.message, fileId, versionNum });
    res.status(500).json({ error: 'Failed to download version' });
  }
});

/**
 * POST /api/files/:id/versions/:num/restore
 * Restore a specific version as current
 */
router.post('/:id/versions/:num/restore', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: fileId, num: versionNum } = req.params;
    const userId = req.user?.id;

    // Verify access
    const fileStmt = db.prepare(`
      SELECT owner_id FROM files 
      WHERE id = ? AND is_deleted = 0
    `);
    
    const file = fileStmt.get(parseInt(fileId));
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (file.owner_id !== userId && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const restoredVersion = await versioningService.restoreVersion(
      fileId,
      parseInt(versionNum),
      userId!.toString()
    );

    LoggerService.info('versions', `Restored version ${versionNum} of file ${fileId}`, userId?.toString(), { fileId, versionNum });

    res.json({
      success: true,
      message: `Version ${versionNum} restored successfully`,
      data: restoredVersion
    });

  } catch (error: any) {
    const { id: fileId, num: versionNum } = req.params;
    LoggerService.error('versions', 'Restore version error', req.user?.id?.toString(), { error: error.message, fileId, versionNum });
    res.status(500).json({ 
      error: error.message || 'Failed to restore version' 
    });
  }
});

/**
 * DELETE /api/files/:id/versions/:num
 * Delete a specific version
 */
router.delete('/:id/versions/:num', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: fileId, num: versionNum } = req.params;
    const userId = req.user?.id;

    // Verify access
    const fileStmt = db.prepare(`
      SELECT owner_id FROM files 
      WHERE id = ? AND is_deleted = 0
    `);
    
    const file = fileStmt.get(parseInt(fileId));
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (file.owner_id !== userId && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const success = versioningService.deleteVersion(fileId, parseInt(versionNum));
    
    if (success) {
      LoggerService.info('versions', `Deleted version ${versionNum} of file ${fileId}`, userId?.toString(), { fileId, versionNum });
      res.json({
        success: true,
        message: `Version ${versionNum} deleted successfully`
      });
    } else {
      res.status(400).json({ error: 'Failed to delete version' });
    }

  } catch (error: any) {
    const { id: fileId, num: versionNum } = req.params;
    LoggerService.error('versions', 'Delete version error', req.user?.id?.toString(), { error: error.message, fileId, versionNum });
    res.status(500).json({ 
      error: error.message || 'Failed to delete version' 
    });
  }
});

/**
 * DELETE /api/files/:id/versions
 * Delete all versions except current
 */
router.delete('/:id/versions', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: fileId } = req.params;
    const userId = req.user?.id;

    // Verify access
    const fileStmt = db.prepare(`
      SELECT owner_id FROM files 
      WHERE id = ? AND is_deleted = 0
    `);
    
    const file = fileStmt.get(parseInt(fileId));
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (file.owner_id !== userId && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const deletedCount = versioningService.deleteAllVersions(fileId);
    
    LoggerService.info('versions', `Deleted all versions of file ${fileId}`, userId?.toString(), { fileId, deletedCount });

    res.json({
      success: true,
      message: `Deleted ${deletedCount} versions`,
      deletedCount
    });

  } catch (error: any) {
    const { id: fileId } = req.params;
    LoggerService.error('versions', 'Delete all versions error', req.user?.id?.toString(), { error: error.message, fileId });
    res.status(500).json({ error: 'Failed to delete versions' });
  }
});

/**
 * GET /api/files/:id/versions/stats
 * Get version statistics for a file
 */
router.get('/:id/versions/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: fileId } = req.params;
    const userId = req.user?.id;

    // Verify access
    const fileStmt = db.prepare(`
      SELECT owner_id FROM files 
      WHERE id = ? AND is_deleted = 0
    `);
    
    const file = fileStmt.get(parseInt(fileId));
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (file.owner_id !== userId && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const stats = versioningService.getVersionStats(fileId);
    
    res.json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    const { id: fileId } = req.params;
    LoggerService.error('versions', 'Get version stats error', req.user?.id?.toString(), { error: error.message, fileId });
    res.status(500).json({ error: 'Failed to get version statistics' });
  }
});

export { router as versionsRoutes };