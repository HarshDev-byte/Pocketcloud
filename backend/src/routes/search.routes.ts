import { Router, Request, Response } from 'express';
import { SearchService } from '../services/search.service';
import { requireAuth } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

const router = Router();

// GET /api/search/recent - Get recent searches
router.get('/recent', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const searches = await SearchService.getRecentSearches(userId);
    
    res.json({
      success: true,
      searches
    });
  } catch (error: any) {
    logger.error('Get recent searches failed', { error: error.message });
    throw error;
  }
});

// GET /api/search - Search files
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { q, type, folderId, dateFrom, dateTo, sizeMin, sizeMax, sort, limit, offset } = req.query;
    
    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter "q" is required');
    }

    if (q.trim().length === 0) {
      throw new ValidationError('Query cannot be empty');
    }

    const userId = req.user!.id;
    
    // Validate sortBy parameter
    const validSortOptions = ['relevance', 'name', 'size', 'date'] as const;
    const sortBy = validSortOptions.includes(sort as any) ? (sort as 'relevance' | 'name' | 'size' | 'date') : 'relevance';

    const options = {
      userId,
      query: q,
      mimeCategory: type as string,
      folderId: folderId as string,
      dateFrom: dateFrom ? parseInt(dateFrom as string, 10) : undefined,
      dateTo: dateTo ? parseInt(dateTo as string, 10) : undefined,
      sizeMin: sizeMin ? parseInt(sizeMin as string, 10) : undefined,
      sizeMax: sizeMax ? parseInt(sizeMax as string, 10) : undefined,
      sortBy,
      limit: limit ? Math.min(parseInt(limit as string, 10), 100) : 20,
      offset: offset ? Math.max(parseInt(offset as string, 10), 0) : 0
    };

    const results = await SearchService.search(options);
    
    res.json({
      success: true,
      ...results,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        hasMore: results.total > (options.offset + options.limit)
      }
    });

  } catch (error: any) {
    logger.error('Search failed', { 
      query: req.query.q,
      userId: req.user?.id,
      error: error.message 
    });
    throw error;
  }
});

// GET /api/search/suggestions - Get search suggestions
router.get('/suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.json({
        success: true,
        suggestions: []
      });
    }

    if (q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: []
      });
    }

    const userId = req.user!.id;
    const suggestions = await SearchService.getSuggestions(userId, q.trim(), 5);
    
    res.json({
      success: true,
      suggestions
    });

  } catch (error: any) {
    logger.error('Get suggestions failed', { 
      query: req.query.q,
      userId: req.user?.id,
      error: error.message 
    });
    
    // Return empty suggestions on error
    res.json({
      success: true,
      suggestions: []
    });
  }
});

// GET /api/search/recent - Get recent searches
router.get('/recent', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const searches = await SearchService.getRecentSearches(userId, limit);
    
    res.json({
      success: true,
      searches
    });

  } catch (error: any) {
    logger.error('Get recent searches failed', { 
      userId: req.user?.id,
      error: error.message 
    });
    
    // Return empty searches on error
    res.json({
      success: true,
      searches: []
    });
  }
});

export default router;