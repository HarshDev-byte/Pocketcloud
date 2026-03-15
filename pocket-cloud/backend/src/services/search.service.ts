import { db } from '../db';
import { LoggerService } from './logger.service';

export interface SearchOptions {
  userId: string;
  folderId?: string;
  mimeTypes?: string[];
  dateFrom?: number;
  dateTo?: number;
  sizeMin?: number;
  sizeMax?: number;
  tags?: string[];
  sortBy?: 'relevance' | 'date' | 'size' | 'name';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  folderId: string | null;
  folderPath: string;
  breadcrumb: string[];
  highlight: string;
  score: number;
  tags?: string[];
  contentPreview?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  took: number;
  suggestions?: string[];
}

export class SearchService {
  
  /**
   * Main search function with smart query parsing
   */
  public static async search(query: string, options: SearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();
    
    try {
      // Parse smart query syntax
      const parsedQuery = this.parseQuery(query);
      
      // Merge parsed filters with options
      const mergedOptions = this.mergeOptions(options, parsedQuery);
      
      // Execute search
      const results = await this.executeSearch(parsedQuery.searchTerms, mergedOptions);
      
      // Calculate total without limit/offset
      const total = await this.getSearchTotal(parsedQuery.searchTerms, mergedOptions);
      
      const took = Date.now() - startTime;
      
      // Log search analytics
      this.logSearchAnalytics(query, options.userId, results.length, took);
      
      return {
        results,
        total,
        took
      };
      
    } catch (error) {
      LoggerService.error('search', 'Search failed', options.userId, { 
        error: (error as Error).message, 
        query 
      });
      
      // Fallback to LIKE search if FTS5 fails
      return this.fallbackSearch(query, options);
    }
  }

  /**
   * Get search suggestions for autocomplete
   */
  public static getSuggestions(query: string, userId: string, limit: number = 5): string[] {
    try {
      if (!query || query.length < 2) {
        return [];
      }

      // Get suggestions from file names using FTS5 prefix matching
      const stmt = db.prepare(`
        SELECT DISTINCT f.name
        FROM files_fts fts
        JOIN files f ON fts.file_id = f.id
        WHERE f.owner_id = ? 
        AND f.is_deleted = 0
        AND files_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      
      const ftsQuery = `name:${query}*`;
      const results = stmt.all(userId, ftsQuery, limit) as { name: string }[];
      
      return results.map(r => r.name);
      
    } catch (error) {
      LoggerService.error('search', 'Suggestions failed', userId, { 
        error: (error as Error).message, 
        query 
      });
      
      // Fallback to simple LIKE query
      const stmt = db.prepare(`
        SELECT DISTINCT name
        FROM files
        WHERE owner_id = ? 
        AND is_deleted = 0
        AND name LIKE ?
        ORDER BY name
        LIMIT ?
      `);
      
      const results = stmt.all(userId, `%${query}%`, limit) as { name: string }[];
      return results.map(r => r.name);
    }
  }

  /**
   * Parse smart query syntax
   */
  private static parseQuery(query: string): {
    searchTerms: string;
    filters: Partial<SearchOptions>;
  } {
    const filters: Partial<SearchOptions> = {};
    let searchTerms = query;

    // Extract filters using regex patterns
    const patterns = [
      { regex: /type:(\S+)/g, key: 'mimeTypes' },
      { regex: /size:([><]?)(\d+)(mb|kb|gb)?/g, key: 'size' },
      { regex: /date:(today|yesterday|this-week|this-month|this-year|\d{4})/g, key: 'date' },
      { regex: /in:([^"\s]+|"[^"]*")/g, key: 'folderId' },
      { regex: /from:(\S+)/g, key: 'from' },
      { regex: /tag:([^"\s]+|"[^"]*")/g, key: 'tags' }
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.regex.exec(query)) !== null) {
        const value = match[1];
        
        switch (pattern.key) {
          case 'mimeTypes':
            if (!filters.mimeTypes) filters.mimeTypes = [];
            if (value === 'pdf') filters.mimeTypes.push('application/pdf');
            else if (value === 'image') filters.mimeTypes.push('image/*');
            else if (value === 'video') filters.mimeTypes.push('video/*');
            else if (value === 'audio') filters.mimeTypes.push('audio/*');
            else if (value === 'doc') filters.mimeTypes.push('application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            else filters.mimeTypes.push(value);
            break;
            
          case 'size':
            const operator = match[2] || '';
            const size = parseInt(match[3]);
            const unit = match[4] || 'mb';
            const bytes = this.convertToBytes(size, unit);
            
            if (operator === '>') filters.sizeMin = bytes;
            else if (operator === '<') filters.sizeMax = bytes;
            else {
              filters.sizeMin = bytes;
              filters.sizeMax = bytes * 2; // Approximate range
            }
            break;
            
          case 'date':
            const dateFilter = this.parseDateFilter(value);
            if (dateFilter.from) filters.dateFrom = dateFilter.from;
            if (dateFilter.to) filters.dateTo = dateFilter.to;
            break;
            
          case 'tags':
            if (!filters.tags) filters.tags = [];
            filters.tags.push(value.replace(/"/g, ''));
            break;
        }
        
        // Remove the filter from search terms
        searchTerms = searchTerms.replace(match[0], '').trim();
      }
    });

    return { searchTerms, filters };
  }

  /**
   * Execute FTS5 search with filters
   */
  private static async executeSearch(searchTerms: string, options: SearchOptions): Promise<SearchResult[]> {
    let sql = `
      SELECT 
        f.id,
        f.name,
        f.original_name as originalName,
        f.mime_type as mimeType,
        f.size,
        f.created_at as createdAt,
        f.updated_at as updatedAt,
        f.folder_id as folderId,
        f.content_preview as contentPreview,
        f.tags,
        COALESCE(folder_path.path, '/') as folderPath,
        fts.rank as score
      FROM files_fts fts
      JOIN files f ON fts.file_id = f.id
      LEFT JOIN (
        WITH RECURSIVE folder_hierarchy AS (
          SELECT id, name, parent_id, name as path
          FROM folders
          WHERE parent_id IS NULL
          UNION ALL
          SELECT f.id, f.name, f.parent_id, fh.path || '/' || f.name
          FROM folders f
          JOIN folder_hierarchy fh ON f.parent_id = fh.id
        )
        SELECT id, path FROM folder_hierarchy
      ) folder_path ON f.folder_id = folder_path.id
      WHERE f.owner_id = ?
      AND f.is_deleted = 0
    `;
    
    const params: any[] = [options.userId];

    // Add FTS5 search if we have search terms
    if (searchTerms && searchTerms.trim()) {
      sql += ` AND files_fts MATCH ?`;
      params.push(this.buildFTSQuery(searchTerms));
    }

    // Add filters
    if (options.folderId) {
      sql += ` AND f.folder_id = ?`;
      params.push(options.folderId);
    }

    if (options.mimeTypes && options.mimeTypes.length > 0) {
      const mimeConditions = options.mimeTypes.map(type => {
        if (type.endsWith('/*')) {
          return `f.mime_type LIKE ?`;
        } else {
          return `f.mime_type = ?`;
        }
      }).join(' OR ');
      
      sql += ` AND (${mimeConditions})`;
      options.mimeTypes.forEach(type => {
        params.push(type.endsWith('/*') ? type.replace('*', '%') : type);
      });
    }

    if (options.dateFrom) {
      sql += ` AND f.updated_at >= ?`;
      params.push(options.dateFrom);
    }

    if (options.dateTo) {
      sql += ` AND f.updated_at <= ?`;
      params.push(options.dateTo);
    }

    if (options.sizeMin) {
      sql += ` AND f.size >= ?`;
      params.push(options.sizeMin);
    }

    if (options.sizeMax) {
      sql += ` AND f.size <= ?`;
      params.push(options.sizeMax);
    }

    if (options.tags && options.tags.length > 0) {
      const tagConditions = options.tags.map(() => `f.tags LIKE ?`).join(' AND ');
      sql += ` AND (${tagConditions})`;
      options.tags.forEach(tag => params.push(`%${tag}%`));
    }

    // Add sorting
    switch (options.sortBy) {
      case 'date':
        sql += ` ORDER BY f.updated_at DESC`;
        break;
      case 'size':
        sql += ` ORDER BY f.size DESC`;
        break;
      case 'name':
        sql += ` ORDER BY f.name ASC`;
        break;
      default: // relevance
        if (searchTerms && searchTerms.trim()) {
          sql += ` ORDER BY rank`;
        } else {
          sql += ` ORDER BY f.updated_at DESC`;
        }
    }

    // Add pagination
    sql += ` LIMIT ? OFFSET ?`;
    params.push(options.limit || 20, options.offset || 0);

    const stmt = db.prepare(sql);
    const results = stmt.all(...params) as any[];

    return results.map(row => ({
      ...row,
      breadcrumb: this.buildBreadcrumb(row.folderPath),
      highlight: this.generateHighlight(row.name, row.contentPreview, searchTerms),
      score: row.score || 0
    }));
  }

  /**
   * Get total count for pagination
   */
  private static async getSearchTotal(searchTerms: string, options: SearchOptions): Promise<number> {
    let sql = `
      SELECT COUNT(*) as total
      FROM files_fts fts
      JOIN files f ON fts.file_id = f.id
      WHERE f.owner_id = ?
      AND f.is_deleted = 0
    `;
    
    const params: any[] = [options.userId];

    if (searchTerms && searchTerms.trim()) {
      sql += ` AND files_fts MATCH ?`;
      params.push(this.buildFTSQuery(searchTerms));
    }

    // Add same filters as main query (without sorting/pagination)
    if (options.folderId) {
      sql += ` AND f.folder_id = ?`;
      params.push(options.folderId);
    }

    if (options.mimeTypes && options.mimeTypes.length > 0) {
      const mimeConditions = options.mimeTypes.map(type => {
        if (type.endsWith('/*')) {
          return `f.mime_type LIKE ?`;
        } else {
          return `f.mime_type = ?`;
        }
      }).join(' OR ');
      
      sql += ` AND (${mimeConditions})`;
      options.mimeTypes.forEach(type => {
        params.push(type.endsWith('/*') ? type.replace('*', '%') : type);
      });
    }

    if (options.dateFrom) {
      sql += ` AND f.updated_at >= ?`;
      params.push(options.dateFrom);
    }

    if (options.dateTo) {
      sql += ` AND f.updated_at <= ?`;
      params.push(options.dateTo);
    }

    if (options.sizeMin) {
      sql += ` AND f.size >= ?`;
      params.push(options.sizeMin);
    }

    if (options.sizeMax) {
      sql += ` AND f.size <= ?`;
      params.push(options.sizeMax);
    }

    if (options.tags && options.tags.length > 0) {
      const tagConditions = options.tags.map(() => `f.tags LIKE ?`).join(' AND ');
      sql += ` AND (${tagConditions})`;
      options.tags.forEach(tag => params.push(`%${tag}%`));
    }

    const stmt = db.prepare(sql);
    const result = stmt.get(...params) as { total: number };
    return result.total;
  }

  /**
   * Fallback search using LIKE when FTS5 fails
   */
  private static async fallbackSearch(query: string, options: SearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();
    
    let sql = `
      SELECT 
        f.id,
        f.name,
        f.original_name as originalName,
        f.mime_type as mimeType,
        f.size,
        f.created_at as createdAt,
        f.updated_at as updatedAt,
        f.folder_id as folderId,
        f.content_preview as contentPreview,
        f.tags,
        COALESCE(folder_path.path, '/') as folderPath
      FROM files f
      LEFT JOIN (
        WITH RECURSIVE folder_hierarchy AS (
          SELECT id, name, parent_id, name as path
          FROM folders
          WHERE parent_id IS NULL
          UNION ALL
          SELECT f.id, f.name, f.parent_id, fh.path || '/' || f.name
          FROM folders f
          JOIN folder_hierarchy fh ON f.parent_id = fh.id
        )
        SELECT id, path FROM folder_hierarchy
      ) folder_path ON f.folder_id = folder_path.id
      WHERE f.owner_id = ?
      AND f.is_deleted = 0
      AND (f.name LIKE ? OR f.content_preview LIKE ?)
      ORDER BY f.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const params = [
      options.userId,
      `%${query}%`,
      `%${query}%`,
      options.limit || 20,
      options.offset || 0
    ];

    const stmt = db.prepare(sql);
    const results = stmt.all(...params) as any[];

    const mappedResults = results.map(row => ({
      ...row,
      breadcrumb: this.buildBreadcrumb(row.folderPath),
      highlight: this.generateHighlight(row.name, row.contentPreview, query),
      score: 0
    }));

    const took = Date.now() - startTime;

    return {
      results: mappedResults,
      total: mappedResults.length,
      took
    };
  }

  /**
   * Helper methods
   */
  private static mergeOptions(base: SearchOptions, parsed: Partial<SearchOptions>): SearchOptions {
    return {
      ...base,
      ...parsed,
      mimeTypes: [...(base.mimeTypes || []), ...(parsed.mimeTypes || [])],
      tags: [...(base.tags || []), ...(parsed.tags || [])]
    };
  }

  private static buildFTSQuery(searchTerms: string): string {
    // Escape special FTS5 characters and build query
    const escaped = searchTerms.replace(/[^\w\s]/g, '').trim();
    if (!escaped) return '*';
    
    // Split into words and create phrase query
    const words = escaped.split(/\s+/).filter(w => w.length > 0);
    return words.map(word => `"${word}"`).join(' AND ');
  }

  private static convertToBytes(size: number, unit: string): number {
    const units = {
      'b': 1,
      'kb': 1024,
      'mb': 1024 * 1024,
      'gb': 1024 * 1024 * 1024
    };
    return size * (units[unit.toLowerCase() as keyof typeof units] || units.mb);
  }

  private static parseDateFilter(value: string): { from?: number; to?: number } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (value) {
      case 'today':
        return { 
          from: today.getTime(),
          to: today.getTime() + 24 * 60 * 60 * 1000 - 1
        };
      case 'yesterday':
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return {
          from: yesterday.getTime(),
          to: yesterday.getTime() + 24 * 60 * 60 * 1000 - 1
        };
      case 'this-week':
        const weekStart = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000);
        return { from: weekStart.getTime() };
      case 'this-month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: monthStart.getTime() };
      case 'this-year':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return { from: yearStart.getTime() };
      default:
        // Try to parse as year (e.g., "2024")
        const year = parseInt(value);
        if (!isNaN(year) && year > 1900 && year < 3000) {
          return {
            from: new Date(year, 0, 1).getTime(),
            to: new Date(year + 1, 0, 1).getTime() - 1
          };
        }
        return {};
    }
  }

  private static buildBreadcrumb(folderPath: string): string[] {
    if (!folderPath || folderPath === '/') return [];
    return folderPath.split('/').filter(p => p.length > 0);
  }

  private static generateHighlight(name: string, content: string | null, searchTerms: string): string {
    if (!searchTerms) return name;
    
    const terms = searchTerms.toLowerCase().split(/\s+/);
    let text = name;
    
    // If we have content preview, use it for highlighting
    if (content && content.length > 0) {
      text = content.substring(0, 200) + (content.length > 200 ? '...' : '');
    }
    
    // Highlight matching terms
    terms.forEach(term => {
      if (term.length > 1) {
        const regex = new RegExp(`(${term})`, 'gi');
        text = text.replace(regex, '<mark>$1</mark>');
      }
    });
    
    return text;
  }

  private static logSearchAnalytics(query: string, userId: string, resultsCount: number, searchTime: number): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO search_analytics (query, user_id, results_count, search_time_ms, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(query, userId, resultsCount, searchTime, Date.now());
    } catch (error) {
      // Don't fail search if analytics logging fails
      LoggerService.error('search', 'Failed to log search analytics', userId, { 
        error: (error as Error).message 
      });
    }
  }

  /**
   * Get search analytics for admin dashboard
   */
  public static getSearchAnalytics(limit: number = 10): Array<{ query: string; count: number; avgTime: number }> {
    try {
      const stmt = db.prepare(`
        SELECT 
          query,
          COUNT(*) as count,
          AVG(search_time_ms) as avgTime
        FROM search_analytics
        WHERE created_at > ?
        GROUP BY query
        ORDER BY count DESC
        LIMIT ?
      `);
      
      // Get analytics from last 30 days
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      return stmt.all(thirtyDaysAgo, limit) as Array<{ query: string; count: number; avgTime: number }>;
      
    } catch (error) {
      LoggerService.error('search', 'Failed to get search analytics', undefined, { 
        error: (error as Error).message 
      });
      return [];
    }
  }
}

export const searchService = SearchService;