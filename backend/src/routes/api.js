/**
 * API Routes for Single-User Advanced Features
 * - Advanced Search with Indexing
 * - Cloud Backup Integration
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requirePermission, requireAnyPermission, requireAllPermissions } = require('../middleware/rbac');
const { PERMISSIONS } = require('../config/roles');
const {
  validateFileId,
  validatePagination,
  validateThumbnailSize,
  validateFileIds,
  validateKeepStrategy,
  validateSearchQuery,
  validateBackupProvider,
  sanitizeInput
} = require('../middleware/validation');
const searchService = require('../services/core/searchService');
const cloudBackupService = require('../services/core/cloudBackupService');
const trashService = require('../services/core/trashService');
const thumbnailService = require('../services/media/thumbnailService');
const duplicateService = require('../services/core/duplicateService');

// Apply sanitization to all routes
router.use(sanitizeInput);

// ============================================================================
// TRASH/RECYCLE BIN ROUTES
// ============================================================================

/**
 * POST /api/trash/:fileId - Move file to trash
 */
router.post('/trash/:fileId', requireAuth, validateFileId, async (req, res) => {
  try {
    const result = await trashService.moveToTrash(req.fileId, req.session.userId);
    
    if (result.success) {
      res.json({ message: result.message });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Move to trash error:', error);
    res.status(500).json({ error: 'Failed to move file to trash' });
  }
});

/**
 * POST /api/trash/:fileId/restore - Restore file from trash
 */
router.post('/trash/:fileId/restore', requireAuth, validateFileId, async (req, res) => {
  try {
    const result = await trashService.restoreFromTrash(req.fileId, req.session.userId);
    
    if (result.success) {
      res.json({ message: result.message });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Restore from trash error:', error);
    res.status(500).json({ error: 'Failed to restore file' });
  }
});

/**
 * DELETE /api/trash/:fileId - Permanently delete file
 */
router.delete('/trash/:fileId', requireAuth, validateFileId, async (req, res) => {
  try {
    const result = await trashService.permanentlyDelete(req.fileId, req.session.userId);
    
    if (result.success) {
      res.json({ message: result.message });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Permanent delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * GET /api/trash - Get trash contents
 */
router.get('/trash', requireAuth, validatePagination, (req, res) => {
  try {
    const result = trashService.getTrash(req.session.userId, req.pagination);
    
    if (result.success) {
      res.json({ files: result.files });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get trash error:', error);
    res.status(500).json({ error: 'Failed to get trash contents' });
  }
});

/**
 * DELETE /api/trash - Empty trash
 */
router.delete('/trash', requireAuth, async (req, res) => {
  try {
    const result = await trashService.emptyTrash(req.session.userId);
    
    if (result.success) {
      res.json({ message: result.message, count: result.count });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Empty trash error:', error);
    res.status(500).json({ error: 'Failed to empty trash' });
  }
});

/**
 * GET /api/trash/stats - Get trash statistics
 */
router.get('/trash/stats', requireAuth, (req, res) => {
  try {
    const result = trashService.getTrashStats(req.session.userId);
    
    if (result.success) {
      res.json({ stats: result.stats });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get trash stats error:', error);
    res.status(500).json({ error: 'Failed to get trash statistics' });
  }
});

// ============================================================================
// THUMBNAIL ROUTES
// ============================================================================

/**
 * POST /api/thumbnails/:fileId - Generate thumbnail
 */
router.post('/thumbnails/:fileId', requireAuth, validateFileId, validateThumbnailSize, async (req, res) => {
  try {
    const result = await thumbnailService.generateThumbnail(
      req.fileId, 
      req.session.userId, 
      req.thumbnailSize
    );
    
    if (result.success) {
      res.json({ thumbnailPath: result.thumbnailPath });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Generate thumbnail error:', error);
    res.status(500).json({ error: 'Failed to generate thumbnail' });
  }
});

/**
 * POST /api/thumbnails/:fileId/all - Generate all thumbnail sizes
 */
router.post('/thumbnails/:fileId/all', requireAuth, validateFileId, async (req, res) => {
  try {
    const result = await thumbnailService.generateAllSizes(req.fileId, req.session.userId);
    
    if (result.success) {
      res.json({ results: result.results });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Generate all thumbnails error:', error);
    res.status(500).json({ error: 'Failed to generate thumbnails' });
  }
});

/**
 * GET /api/thumbnails/:fileId - Get thumbnail
 */
router.get('/thumbnails/:fileId', requireAuth, validateFileId, validateThumbnailSize, (req, res) => {
  try {
    const result = thumbnailService.getThumbnail(
      req.fileId, 
      req.session.userId, 
      req.thumbnailSize
    );
    
    if (result.success && result.thumbnail) {
      res.sendFile(result.thumbnail);
    } else {
      res.status(404).json({ error: 'Thumbnail not found' });
    }
  } catch (error) {
    console.error('Get thumbnail error:', error);
    res.status(500).json({ error: 'Failed to get thumbnail' });
  }
});

/**
 * POST /api/thumbnails/batch - Batch generate thumbnails
 */
router.post('/thumbnails/batch', requireAuth, validateFileIds, validateThumbnailSize, async (req, res) => {
  try {
    const result = await thumbnailService.batchGenerate(
      req.fileIds, 
      req.session.userId, 
      req.thumbnailSize
    );
    
    if (result.success) {
      res.json({ results: result.results });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Batch generate error:', error);
    res.status(500).json({ error: 'Failed to generate thumbnails' });
  }
});

// ============================================================================
// DUPLICATE DETECTION ROUTES
// ============================================================================

/**
 * GET /api/duplicates - Find duplicate files
 */
router.get('/duplicates', requireAuth, (req, res) => {
  try {
    const result = duplicateService.findDuplicates(req.session.userId);
    
    if (result.success) {
      res.json({
        duplicates: result.duplicates,
        totalWasted: result.totalWasted,
        duplicateCount: result.duplicateCount
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Find duplicates error:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

/**
 * GET /api/duplicates/groups - Get duplicate groups
 */
router.get('/duplicates/groups', requireAuth, (req, res) => {
  try {
    const result = duplicateService.getDuplicateGroups(req.session.userId);
    
    if (result.success) {
      res.json({ groups: result.groups });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get duplicate groups error:', error);
    res.status(500).json({ error: 'Failed to get duplicate groups' });
  }
});

/**
 * GET /api/duplicates/stats - Get duplicate statistics
 */
router.get('/duplicates/stats', requireAuth, (req, res) => {
  try {
    const result = duplicateService.getDuplicateStats(req.session.userId);
    
    if (result.success) {
      res.json({ stats: result.stats });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get duplicate stats error:', error);
    res.status(500).json({ error: 'Failed to get duplicate statistics' });
  }
});

/**
 * DELETE /api/duplicates - Delete duplicate files
 */
router.delete('/duplicates', requireAuth, validateKeepStrategy, async (req, res) => {
  try {
    const result = await duplicateService.deleteDuplicates(req.session.userId, req.keepStrategy);
    
    if (result.success) {
      res.json({
        message: result.message,
        deletedCount: result.deletedCount,
        freedSpace: result.freedSpace
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Delete duplicates error:', error);
    res.status(500).json({ error: 'Failed to delete duplicates' });
  }
});

/**
 * POST /api/duplicates/scan - Scan all files for duplicates
 */
router.post('/duplicates/scan', requireAuth, async (req, res) => {
  try {
    const result = await duplicateService.scanAllFiles(req.session.userId);
    
    if (result.success) {
      res.json({ message: result.message, processed: result.processed });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Scan duplicates error:', error);
    res.status(500).json({ error: 'Failed to scan for duplicates' });
  }
});

/**
 * POST /api/duplicates/check - Check if file is duplicate
 */
router.post('/duplicates/check', requireAuth, async (req, res) => {
  try {
    const { filepath } = req.body;
    
    if (!filepath) {
      return res.status(400).json({ error: 'filepath required' });
    }
    
    const result = await duplicateService.checkDuplicate(filepath, req.session.userId);
    
    if (result.success) {
      res.json({
        isDuplicate: result.isDuplicate,
        existingFile: result.existingFile,
        hash: result.hash
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Check duplicate error:', error);
    res.status(500).json({ error: 'Failed to check for duplicate' });
  }
});

// ============================================================================
// SEARCH ROUTES
// ============================================================================

/**
 * GET /api/search - Search files and folders
 */
router.get('/search', requireAuth, requirePermission(PERMISSIONS.SEARCH_OWN), (req, res) => {
  const { q, type, tags, mimetype, dateFrom, dateTo, sizeMin, sizeMax, limit, offset } = req.query;
  
  const result = searchService.search(req.session.userId, q, {
    type,
    tags: tags ? tags.split(',') : [],
    mimetype,
    dateFrom,
    dateTo,
    sizeMin: sizeMin ? parseInt(sizeMin) : null,
    sizeMax: sizeMax ? parseInt(sizeMax) : null,
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0
  });
  
  if (result.success) {
    res.json({ results: result.results, count: result.count });
  } else {
    res.status(500).json({ error: result.error });
  }
});

/**
 * GET /api/search/suggestions - Get search suggestions
 */
router.get('/search/suggestions', requireAuth, (req, res) => {
  const { q, limit } = req.query;
  
  if (!q) {
    return res.json({ suggestions: [] });
  }
  
  const result = searchService.getSuggestions(req.session.userId, q, limit ? parseInt(limit) : 10);
  
  if (result.success) {
    res.json({ suggestions: result.suggestions });
  } else {
    res.status(500).json({ error: result.error });
  }
});

/**
 * POST /api/search/reindex - Reindex all content
 */
router.post('/search/reindex', requireAuth, async (req, res) => {
  const result = await searchService.reindexAll(req.session.userId);
  
  if (result.success) {
    res.json({ message: 'Reindex completed', indexed: result.indexed });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ============================================================================
// CLOUD BACKUP ROUTES
// ============================================================================

/**
 * POST /api/backup/config - Save backup configuration
 */
router.post('/backup/config', requireAuth, requirePermission(PERMISSIONS.SYSTEM_BACKUP), (req, res) => {
  const { provider, config, schedule } = req.body;
  
  if (!provider || !config) {
    return res.status(400).json({ error: 'Provider and config required' });
  }
  
  const result = cloudBackupService.saveConfig(req.session.userId, provider, config, schedule);
  
  if (result.success) {
    res.json({ message: 'Configuration saved successfully' });
  } else {
    res.status(400).json({ error: result.error });
  }
});

/**
 * GET /api/backup/config/:provider - Get backup configuration
 */
router.get('/backup/config/:provider', requireAuth, requirePermission(PERMISSIONS.SYSTEM_BACKUP), (req, res) => {
  const { provider } = req.params;
  
  const result = cloudBackupService.getConfig(req.session.userId, provider);
  
  if (result.success) {
    res.json({ config: result.config });
  } else {
    res.status(404).json({ error: result.error });
  }
});

/**
 * POST /api/backup/create - Create a backup
 */
router.post('/backup/create', requireAuth, requirePermission(PERMISSIONS.SYSTEM_BACKUP), async (req, res) => {
  const { provider, options } = req.body;
  
  if (!provider) {
    return res.status(400).json({ error: 'Provider required' });
  }
  
  const result = await cloudBackupService.createBackup(req.session.userId, provider, options);
  
  if (result.success) {
    res.json({ message: 'Backup started', jobId: result.jobId });
  } else {
    res.status(400).json({ error: result.error });
  }
});

/**
 * POST /api/backup/restore - Restore from backup
 */
router.post('/backup/restore', requireAuth, requirePermission(PERMISSIONS.SYSTEM_BACKUP), async (req, res) => {
  const { provider, options } = req.body;
  
  if (!provider) {
    return res.status(400).json({ error: 'Provider required' });
  }
  
  const result = await cloudBackupService.restoreBackup(req.session.userId, provider, options);
  
  if (result.success) {
    res.json({ message: 'Restore started', jobId: result.jobId });
  } else {
    res.status(400).json({ error: result.error });
  }
});

/**
 * GET /api/backup/jobs - Get backup jobs
 */
router.get('/backup/jobs', requireAuth, requirePermission(PERMISSIONS.SYSTEM_BACKUP), (req, res) => {
  const { limit, offset, status } = req.query;
  
  const result = cloudBackupService.getJobs(req.session.userId, { limit, offset, status });
  
  if (result.success) {
    res.json({ jobs: result.jobs });
  } else {
    res.status(500).json({ error: result.error });
  }
});

/**
 * POST /api/backup/test - Test cloud connection
 */
router.post('/backup/test', requireAuth, requirePermission(PERMISSIONS.SYSTEM_BACKUP), async (req, res) => {
  const { provider, config } = req.body;
  
  if (!provider || !config) {
    return res.status(400).json({ error: 'Provider and config required' });
  }
  
  const result = await cloudBackupService.testConnection(provider, config);
  
  if (result.success) {
    res.json({ message: result.message });
  } else {
    res.status(400).json({ error: result.error });
  }
});

module.exports = router;
