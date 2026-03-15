import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { searchService, SearchOptions } from '../services/search.service';
import { indexerService } from '../services/indexer.service';
import { LoggerService } from '../services/logger.service';

const router = Router();

/**
 * GET /api/search
 * Main search endpoint with smart query parsing
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const startTime = Date.now();
    const userId = req.user!.id;
    const {
      q: query = '',
      type,
      dateFrom,
      dateTo,
      sizeMin,
      sizeMax,
      folderId,
      sortBy = 'relevance',
      limit = '20',
      offset = '0'
    } = req.query;

    // Validate and parse parameters
    const options: SearchOptions = {
      userId,
      sortBy: sortBy as 'relevance' | 'date' | 'size' | 'name',
      limit: Math.min(parseInt(limit as string) || 20, 100), // Max 100 results
      offset: parseInt(offset as string) || 0
    };

    // Add optional filters
    if (folderId && typeof folderId === 'string') {
      options.folderId = folderId;
    }

    if (type && typeof type === 'string') {
      options.mimeTypes = type.split(',').map(t => t.trim());
    }

    if (dateFrom && typeof dateFrom === 'string') {
      const date = parseInt(dateFrom);
      if (!isNaN(date)) options.dateFrom = date;
    }

    if (dateTo && typeof dateTo === 'string') {
      const date = parseInt(dateTo);
      if (!isNaN(date)) options.dateTo = date;
    }

    if (sizeMin && typeof sizeMin === 'string') {
      const size = parseInt(sizeMin);
      if (!isNaN(size)) options.sizeMin = size;
    }

    if (sizeMax && typeof sizeMax === 'string') {
      const size = parseInt(sizeMax);
      if (!isNaN(size)) options.sizeMax = size;
    }

    // Execute search
    const searchResult = await searchService.search(query as string, options);

    // Add suggestions for empty or low-result queries
    if (searchResult.results.length < 5 && query) {
      searchResult.suggestions = searchService.getSuggestions(query as string, userId, 5);
    }

    const totalTime = Date.now() - startTime;

    return res.json({
      ...searchResult,
      query,
      options: {
        sortBy: options.sortBy,
        limit: options.limit,
        offset: options.offset
      }
    });

  } catch (error) {
    LoggerService.error('search', 'Search request failed', req.user?.id, { 
      error: (error as Error).message,
      query: req.query.q 
    });

    return res.status(500).json({
      error: 'Search failed',
      results: [],
      total: 0,
      took: 0
    });
  }
});

/**
 * GET /api/search/suggestions
 * Get autocomplete suggestions
 */
router.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { q: query = '', limit = '5' } = req.query;

    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    const suggestions = searchService.getSuggestions(
      query,
      userId,
      Math.min(parseInt(limit as string) || 5, 10)
    );

    return res.json({ suggestions });

  } catch (error) {
    LoggerService.error('search', 'Suggestions request failed', req.user?.id, { 
      error: (error as Error).message,
      query: req.query.q 
    });

    return res.json({ suggestions: [] });
  }
});

/**
 * POST /api/search/reindex
 * Reindex all files (admin only)
 */
router.post('/reindex', requireAuth, async (req, res) => {
  try {
    // Check admin permissions
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Start reindexing in background
    const result = await indexerService.reindexAllFiles();

    LoggerService.info('search', 'Manual reindex triggered', req.user!.id, result);

    return res.json({
      success: true,
      message: 'Reindexing completed',
      ...result
    });

  } catch (error) {
    LoggerService.error('search', 'Reindex failed', req.user?.id, { 
      error: (error as Error).message 
    });

    return res.status(500).json({
      error: 'Reindexing failed',
      message: (error as Error).message
    });
  }
});

/**
 * GET /api/search/stats
 * Get search and indexing statistics (admin only)
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    // Check admin permissions
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const indexingStats = indexerService.getIndexingStats();
    const searchAnalytics = searchService.getSearchAnalytics(10);

    return res.json({
      indexing: indexingStats,
      topSearches: searchAnalytics,
      timestamp: Date.now()
    });

  } catch (error) {
    LoggerService.error('search', 'Stats request failed', req.user?.id, { 
      error: (error as Error).message 
    });

    return res.status(500).json({
      error: 'Failed to get search statistics'
    });
  }
});

/**
 * GET /api/search/filters
 * Get available filter options for advanced search
 */
router.get('/filters', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get available mime types for this user
    const { db } = require('../db');
    const mimeTypesStmt = db.prepare(`
      SELECT DISTINCT mime_type, COUNT(*) as count
      FROM files 
      WHERE owner_id = ? AND is_deleted = 0
      GROUP BY mime_type
      ORDER BY count DESC
      LIMIT 20
    `);
    const mimeTypes = mimeTypesStmt.all(userId) as Array<{ mime_type: string; count: number }>;

    // Get available folders
    const foldersStmt = db.prepare(`
      WITH RECURSIVE folder_hierarchy AS (
        SELECT id, name, parent_id, name as path, 0 as level
        FROM folders
        WHERE owner_id = ? AND parent_id IS NULL
        UNION ALL
        SELECT f.id, f.name, f.parent_id, fh.path || '/' || f.name, fh.level + 1
        FROM folders f
        JOIN folder_hierarchy fh ON f.parent_id = fh.id
        WHERE fh.level < 5
      )
      SELECT id, name, path, level FROM folder_hierarchy
      ORDER BY path
    `);
    const folders = foldersStmt.all(userId) as Array<{ id: string; name: string; path: string; level: number }>;

    // Get file size ranges
    const sizeStmt = db.prepare(`
      SELECT 
        MIN(size) as minSize,
        MAX(size) as maxSize,
        AVG(size) as avgSize
      FROM files 
      WHERE owner_id = ? AND is_deleted = 0
    `);
    const sizeStats = sizeStmt.get(userId) as { minSize: number; maxSize: number; avgSize: number };

    // Get date ranges
    const dateStmt = db.prepare(`
      SELECT 
        MIN(created_at) as oldestFile,
        MAX(created_at) as newestFile
      FROM files 
      WHERE owner_id = ? AND is_deleted = 0
    `);
    const dateStats = dateStmt.get(userId) as { oldestFile: number; newestFile: number };

    return res.json({
      mimeTypes: mimeTypes.map(mt => ({
        type: mt.mime_type,
        count: mt.count,
        category: categorizeMimeType(mt.mime_type)
      })),
      folders,
      sizeRange: sizeStats,
      dateRange: dateStats
    });

  } catch (error) {
    LoggerService.error('search', 'Filters request failed', req.user?.id, { 
      error: (error as Error).message 
    });

    return res.status(500).json({
      error: 'Failed to get filter options'
    });
  }
});

/**
 * Helper function to categorize MIME types
 */
function categorizeMimeType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Images';
  if (mimeType.startsWith('video/')) return 'Videos';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType.startsWith('text/')) return 'Documents';
  if (mimeType.includes('pdf')) return 'Documents';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Documents';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'Spreadsheets';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'Presentations';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return 'Archives';
  return 'Other';
}

export { router as searchRoutes };