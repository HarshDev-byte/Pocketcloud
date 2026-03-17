import { db } from '../db/client';
import { File as FileRecord } from '../db/types';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import { execSync } from 'child_process';

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

interface SearchOptions {
  userId: string;
  query: string;
  mimeCategory?: string;
  folderId?: string;
  tagId?: string; // Add tag filtering
  dateFrom?: number;
  dateTo?: number;
  sizeMin?: number;
  sizeMax?: number;
  sortBy?: 'relevance' | 'name' | 'size' | 'date';
  limit?: number;
  offset?: number;
}

interface SearchResult {
  file: FileRecord;
  score: number;
  highlight: string;
  breadcrumb: BreadcrumbItem[];
}

interface SearchResults {
  results: SearchResult[];
  total: number;
  took: number;
  query: ParsedQuery;
}

interface ParsedQuery {
  text: string;
  filters: {
    mimeCategory?: string;
    folderId?: string;
    tagName?: string; // Add tagName to the interface
    dateFrom?: number;
    dateTo?: number;
    sizeMin?: number;
    sizeMax?: number;
  };
}

export class SearchService {
  private static parseSize(sizeStr: string): number | null {
    const match = sizeStr.match(/^([><=]+)?(\d+(?:\.\d+)?)(kb|mb|gb)?$/i);
    if (!match) return null;

    const [, , numStr, unit] = match;
    let bytes = parseFloat(numStr);

    // Convert to bytes
    switch (unit?.toLowerCase()) {
      case 'kb': bytes *= 1024; break;
      case 'mb': bytes *= 1024 * 1024; break;
      case 'gb': bytes *= 1024 * 1024 * 1024; break;
    }

    return Math.floor(bytes);
  }

  private static parseDate(dateStr: string): { from?: number; to?: number } {
    const now = new Date();
    
    switch (dateStr.toLowerCase()) {
      case 'today':
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { from: todayStart.getTime() };
        
      case 'this-week':
        const weekStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        return { from: weekStart.getTime() };
        
      case 'this-month':
        const monthStart = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        return { from: monthStart.getTime() };
        
      default:
        // Try to parse as year (e.g., "2024")
        const yearMatch = dateStr.match(/^(\d{4})$/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1]);
          return {
            from: new Date(year, 0, 1).getTime(),
            to: new Date(year, 11, 31, 23, 59, 59).getTime()
          };
        }
        return {};
    }
  }

  private static parseQueryFilters(query: string): ParsedQuery {
    let remainingQuery = query;
    const filters: ParsedQuery['filters'] = {};

    // Parse type: filter
    const typeMatch = remainingQuery.match(/\btype:(\w+)/i);
    if (typeMatch) {
      filters.mimeCategory = typeMatch[1].toLowerCase();
      remainingQuery = remainingQuery.replace(typeMatch[0], '').trim();
    }

    // Parse size: filter
    const sizeMatch = remainingQuery.match(/\bsize:([><=]*\d+(?:\.\d+)?(?:kb|mb|gb)?)/i);
    if (sizeMatch) {
      const sizeStr = sizeMatch[1];
      const size = this.parseSize(sizeStr);
      
      if (size !== null) {
        if (sizeStr.startsWith('>')) {
          filters.sizeMin = size;
        } else if (sizeStr.startsWith('<')) {
          filters.sizeMax = size;
        } else {
          // Exact size match (within 10% tolerance)
          filters.sizeMin = Math.floor(size * 0.9);
          filters.sizeMax = Math.floor(size * 1.1);
        }
      }
      
      remainingQuery = remainingQuery.replace(sizeMatch[0], '').trim();
    }

    // Parse date: filter
    const dateMatch = remainingQuery.match(/\bdate:([^\s]+)/i);
    if (dateMatch) {
      const dateRange = this.parseDate(dateMatch[1]);
      if (dateRange.from) filters.dateFrom = dateRange.from;
      if (dateRange.to) filters.dateTo = dateRange.to;
      
      remainingQuery = remainingQuery.replace(dateMatch[0], '').trim();
    }

    // Parse in: filter (folder scope)
    const folderMatch = remainingQuery.match(/\bin:([^\s]+)/i);
    if (folderMatch) {
      // TODO: Resolve folder name to ID - for now just store the name
      // This would require a folder name lookup
      remainingQuery = remainingQuery.replace(folderMatch[0], '').trim();
    }

    // Parse tag: filter
    const tagMatch = remainingQuery.match(/\btag:([^\s]+)/i);
    if (tagMatch) {
      // Store tag name for later resolution to ID
      filters.tagName = tagMatch[1];
      remainingQuery = remainingQuery.replace(tagMatch[0], '').trim();
    }

    // Clean up remaining query
    remainingQuery = remainingQuery.replace(/\s+/g, ' ').trim();

    return {
      text: remainingQuery,
      filters
    };
  }

  private static sanitizeQuery(query: string): string {
    // Remove FTS5 special characters that could cause syntax errors
    return query
      .replace(/[":*^~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  private static buildBreadcrumb(folderId: string | null): BreadcrumbItem[] {
    const breadcrumb: BreadcrumbItem[] = [{ id: null, name: 'Home' }];
    
    if (!folderId) return breadcrumb;

    const pathItems: BreadcrumbItem[] = [];
    let currentFolderId: string | null = folderId;

    // Walk up the parent chain (max 10 levels to prevent infinite loops)
    let depth = 0;
    while (currentFolderId && depth < 10) {
      const folder = db.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').get(currentFolderId) as any;
      if (!folder) break;

      pathItems.unshift({ id: folder.id, name: folder.name });
      currentFolderId = folder.parent_id;
      depth++;
    }

    return [...breadcrumb, ...pathItems];
  }

  static async search(options: SearchOptions): Promise<SearchResults> {
    const startTime = Date.now();
    
    // Parse and sanitize query
    const parsedQuery = this.parseQueryFilters(options.query);
    const cleanQuery = this.sanitizeQuery(parsedQuery.text);
    
    // Merge filters from query and options
    const filters = {
      ...parsedQuery.filters,
      ...(options.mimeCategory && { mimeCategory: options.mimeCategory }),
      ...(options.folderId && { folderId: options.folderId }),
      ...(options.tagId && { tagId: options.tagId }),
      ...(options.dateFrom && { dateFrom: options.dateFrom }),
      ...(options.dateTo && { dateTo: options.dateTo }),
      ...(options.sizeMin && { sizeMin: options.sizeMin }),
      ...(options.sizeMax && { sizeMax: options.sizeMax })
    };

    // Resolve tag name to ID if provided in query
    if (parsedQuery.filters.tagName && !filters.tagId) {
      const tag = db.prepare('SELECT id FROM tags WHERE owner_id = ? AND name = ?').get(options.userId, parsedQuery.filters.tagName) as { id: string } | undefined;
      if (tag) {
        filters.tagId = tag.id;
      }
      delete filters.tagName;
    }

    const limit = Math.min(options.limit || 20, 100);
    const offset = options.offset || 0;
    const sortBy = options.sortBy || 'relevance';

    let results: SearchResult[] = [];
    let total = 0;

    try {
      if (cleanQuery.length > 0) {
        // FTS5 search
        results = await this.ftsSearch(options.userId, cleanQuery, filters, sortBy, limit, offset);
        total = await this.getFtsCount(options.userId, cleanQuery, filters);
      } else if (Object.keys(filters).length > 0) {
        // Filter-only search (no text query)
        results = await this.filterSearch(options.userId, filters, sortBy, limit, offset);
        total = await this.getFilterCount(options.userId, filters);
      } else {
        // Empty query - return recent files
        results = await this.getRecentFiles(options.userId, limit, offset);
        total = await this.getTotalFileCount(options.userId);
      }
    } catch (error: any) {
      logger.warn('FTS search failed, falling back to LIKE search', { error: error.message });
      results = await this.fallbackLikeSearch(options.userId, cleanQuery, filters, sortBy, limit, offset);
      total = await this.getLikeSearchCount(options.userId, cleanQuery, filters);
    }

    const took = Date.now() - startTime;

    return {
      results,
      total,
      took,
      query: { ...parsedQuery, filters }
    };
  }

  private static async ftsSearch(
    userId: string, 
    query: string, 
    filters: any, 
    sortBy: string, 
    limit: number, 
    offset: number
  ): Promise<SearchResult[]> {
    let sql = `
      SELECT f.*, 
             fts.rank as score,
             snippet(files_fts, 1, '<mark>', '</mark>', '...', 10) as highlight
      FROM files_fts fts
      JOIN files f ON fts.file_id = f.id
      WHERE files_fts MATCH ?
        AND f.owner_id = ?
        AND f.is_deleted = 0
    `;

    const params: any[] = [query, userId];

    // Add filters
    if (filters.mimeCategory) {
      sql += ` AND fts.mime_category = ?`;
      params.push(filters.mimeCategory);
    }

    if (filters.dateFrom) {
      sql += ` AND f.created_at >= ?`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      sql += ` AND f.created_at <= ?`;
      params.push(filters.dateTo);
    }

    if (filters.sizeMin) {
      sql += ` AND f.size >= ?`;
      params.push(filters.sizeMin);
    }

    if (filters.sizeMax) {
      sql += ` AND f.size <= ?`;
      params.push(filters.sizeMax);
    }

    if (filters.folderId) {
      // Include folder and all descendants
      sql += ` AND f.folder_id IN (
        WITH RECURSIVE folder_tree(id) AS (
          SELECT ? 
          UNION ALL
          SELECT folders.id FROM folders 
          JOIN folder_tree ON folders.parent_id = folder_tree.id
        )
        SELECT id FROM folder_tree
      )`;
      params.push(filters.folderId);
    }

    if (filters.tagId) {
      // Filter by tag
      sql += ` AND f.id IN (SELECT file_id FROM file_tags WHERE tag_id = ?)`;
      params.push(filters.tagId);
    }

    // Add sorting
    switch (sortBy) {
      case 'relevance':
        sql += ` ORDER BY fts.rank`;
        break;
      case 'name':
        sql += ` ORDER BY f.name ASC`;
        break;
      case 'size':
        sql += ` ORDER BY f.size DESC`;
        break;
      case 'date':
        sql += ` ORDER BY f.created_at DESC`;
        break;
    }

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(row => ({
      file: row as FileRecord,
      score: row.score || 0,
      highlight: row.highlight || row.name,
      breadcrumb: this.buildBreadcrumb(row.folder_id)
    }));
  }

  private static async getFtsCount(userId: string, query: string, filters: any): Promise<number> {
    let sql = `
      SELECT COUNT(*) as count
      FROM files_fts fts
      JOIN files f ON fts.file_id = f.id
      WHERE files_fts MATCH ?
        AND f.owner_id = ?
        AND f.is_deleted = 0
    `;

    const params: any[] = [query, userId];

    // Add same filters as main query
    if (filters.mimeCategory) {
      sql += ` AND fts.mime_category = ?`;
      params.push(filters.mimeCategory);
    }

    if (filters.dateFrom) {
      sql += ` AND f.created_at >= ?`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      sql += ` AND f.created_at <= ?`;
      params.push(filters.dateTo);
    }

    if (filters.sizeMin) {
      sql += ` AND f.size >= ?`;
      params.push(filters.sizeMin);
    }

    if (filters.sizeMax) {
      sql += ` AND f.size <= ?`;
      params.push(filters.sizeMax);
    }

    if (filters.tagId) {
      sql += ` AND f.id IN (SELECT file_id FROM file_tags WHERE tag_id = ?)`;
      params.push(filters.tagId);
    }

    const result = db.prepare(sql).get(...params) as { count: number };
    return result.count;
  }

  private static async filterSearch(
    userId: string, 
    filters: any, 
    _sortBy: string, 
    limit: number, 
    offset: number
  ): Promise<SearchResult[]> {
    let sql = `
      SELECT f.*
      FROM files f
      WHERE f.owner_id = ?
        AND f.is_deleted = 0
    `;

    const params: any[] = [userId];

    // Add filters (same logic as FTS search)
    if (filters.mimeCategory) {
      const mimePattern = this.getMimePattern(filters.mimeCategory);
      sql += ` AND f.mime_type LIKE ?`;
      params.push(mimePattern);
    }

    if (filters.dateFrom) {
      sql += ` AND f.created_at >= ?`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      sql += ` AND f.created_at <= ?`;
      params.push(filters.dateTo);
    }

    if (filters.sizeMin) {
      sql += ` AND f.size >= ?`;
      params.push(filters.sizeMin);
    }

    if (filters.sizeMax) {
      sql += ` AND f.size <= ?`;
      params.push(filters.sizeMax);
    }

    if (filters.tagId) {
      sql += ` AND f.id IN (SELECT file_id FROM file_tags WHERE tag_id = ?)`;
      params.push(filters.tagId);
    }

    // Add sorting
    switch (_sortBy) {
      case 'name':
        sql += ` ORDER BY f.name ASC`;
        break;
      case 'size':
        sql += ` ORDER BY f.size DESC`;
        break;
      case 'date':
      default:
        sql += ` ORDER BY f.created_at DESC`;
        break;
    }

    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as FileRecord[];

    return rows.map(file => ({
      file,
      score: 1,
      highlight: file.name,
      breadcrumb: this.buildBreadcrumb(file.folder_id)
    }));
  }

  private static async getFilterCount(userId: string, filters: any): Promise<number> {
    let sql = `
      SELECT COUNT(*) as count
      FROM files f
      WHERE f.owner_id = ?
        AND f.is_deleted = 0
    `;

    const params: any[] = [userId];

    // Add same filters
    if (filters.mimeCategory) {
      const mimePattern = this.getMimePattern(filters.mimeCategory);
      sql += ` AND f.mime_type LIKE ?`;
      params.push(mimePattern);
    }

    if (filters.dateFrom) {
      sql += ` AND f.created_at >= ?`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      sql += ` AND f.created_at <= ?`;
      params.push(filters.dateTo);
    }

    if (filters.sizeMin) {
      sql += ` AND f.size >= ?`;
      params.push(filters.sizeMin);
    }

    if (filters.sizeMax) {
      sql += ` AND f.size <= ?`;
      params.push(filters.sizeMax);
    }

    if (filters.tagId) {
      sql += ` AND f.id IN (SELECT file_id FROM file_tags WHERE tag_id = ?)`;
      params.push(filters.tagId);
    }

    const result = db.prepare(sql).get(...params) as { count: number };
    return result.count;
  }

  private static async fallbackLikeSearch(
    userId: string, 
    query: string, 
    filters: any, 
    _sortBy: string, 
    limit: number, 
    offset: number
  ): Promise<SearchResult[]> {
    let sql = `
      SELECT f.*
      FROM files f
      WHERE f.owner_id = ?
        AND f.is_deleted = 0
    `;

    const params: any[] = [userId];

    if (query) {
      sql += ` AND f.name LIKE ?`;
      params.push(`%${query}%`);
    }

    // Add filters (same as filterSearch)
    if (filters.mimeCategory) {
      const mimePattern = this.getMimePattern(filters.mimeCategory);
      sql += ` AND f.mime_type LIKE ?`;
      params.push(mimePattern);
    }

    sql += ` ORDER BY f.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as FileRecord[];

    return rows.map(file => ({
      file,
      score: 1,
      highlight: file.name,
      breadcrumb: this.buildBreadcrumb(file.folder_id)
    }));
  }

  private static async getLikeSearchCount(userId: string, query: string, _filters: any): Promise<number> {
    let sql = `
      SELECT COUNT(*) as count
      FROM files f
      WHERE f.owner_id = ?
        AND f.is_deleted = 0
    `;

    const params: any[] = [userId];

    if (query) {
      sql += ` AND f.name LIKE ?`;
      params.push(`%${query}%`);
    }

    const result = db.prepare(sql).get(...params) as { count: number };
    return result.count;
  }

  private static async getRecentFiles(userId: string, limit: number, offset: number): Promise<SearchResult[]> {
    const sql = `
      SELECT f.*
      FROM files f
      WHERE f.owner_id = ?
        AND f.is_deleted = 0
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(sql).all(userId, limit, offset) as FileRecord[];

    return rows.map(file => ({
      file,
      score: 1,
      highlight: file.name,
      breadcrumb: this.buildBreadcrumb(file.folder_id)
    }));
  }

  private static async getTotalFileCount(userId: string): Promise<number> {
    const result = db.prepare('SELECT COUNT(*) as count FROM files WHERE owner_id = ? AND is_deleted = 0').get(userId) as { count: number };
    return result.count;
  }

  private static getMimePattern(category: string): string {
    switch (category) {
      case 'image': return 'image/%';
      case 'video': return 'video/%';
      case 'audio': return 'audio/%';
      case 'pdf': return 'application/pdf';
      case 'text': return 'text/%';
      default: return '%';
    }
  }

  static async getSuggestions(userId: string, partial: string, limit: number = 5): Promise<string[]> {
    if (partial.length < 2) return [];

    try {
      const sanitizedPartial = this.sanitizeQuery(partial);
      
      const sql = `
        SELECT DISTINCT name 
        FROM files_fts 
        WHERE files_fts MATCH ? 
          AND file_id IN (
            SELECT id FROM files WHERE owner_id = ? AND is_deleted = 0
          )
        LIMIT ?
      `;

      const rows = db.prepare(sql).all(`${sanitizedPartial}*`, userId, limit) as { name: string }[];
      return rows.map(row => row.name);
    } catch (error) {
      // Fallback to LIKE search
      const sql = `
        SELECT DISTINCT name 
        FROM files 
        WHERE owner_id = ? 
          AND is_deleted = 0 
          AND name LIKE ?
        LIMIT ?
      `;

      const rows = db.prepare(sql).all(userId, `%${partial}%`, limit) as { name: string }[];
      return rows.map(row => row.name);
    }
  }

  static async indexFileContent(fileId: string, contentPreview: string): Promise<void> {
    try {
      // Update FTS index
      db.prepare('UPDATE files_fts SET content_preview = ? WHERE file_id = ?').run(contentPreview, fileId);
      
      // Update files table
      db.prepare('UPDATE files SET content_preview = ? WHERE id = ?').run(contentPreview, fileId);

      logger.info('File content indexed', { fileId, previewLength: contentPreview.length });
    } catch (error: any) {
      logger.error('Failed to index file content', { fileId, error: error.message });
    }
  }

  static extractContentPreview(filePath: string, mimeType: string): string | null {
    try {
      let content: string | null = null;

      if (mimeType.startsWith('text/')) {
        // Read first 2000 chars of text files
        const buffer = fs.readFileSync(filePath);
        content = buffer.toString('utf8', 0, Math.min(2000, buffer.length));
      } else if (mimeType === 'application/json') {
        // Read first 1000 chars of JSON files
        const buffer = fs.readFileSync(filePath);
        content = buffer.toString('utf8', 0, Math.min(1000, buffer.length));
      } else if (mimeType === 'application/pdf') {
        // Try to extract text from PDF using pdftotext
        try {
          content = execSync(`pdftotext "${filePath}" - | head -c 2000`, { 
            encoding: 'utf8',
            timeout: 5000 
          });
        } catch (error) {
          // pdftotext not available or failed
          return null;
        }
      }

      if (!content) return null;

      // Clean up content
      return content
        .replace(/\0/g, '') // Remove null bytes
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
        .trim()
        .substring(0, 2000);

    } catch (error: any) {
      logger.warn('Failed to extract content preview', { filePath, mimeType, error: error.message });
      return null;
    }
  }

  // Get recent searches for a user
  static async getRecentSearches(userId: string, limit: number = 10): Promise<string[]> {
    // For now, return empty array since we don't track search history yet
    // In a full implementation, you would store search queries in a separate table
    // and return the most recent unique searches for the user
    
    // TODO: Implement search history tracking
    // This would involve:
    // 1. Creating a search_history table
    // 2. Storing successful searches with timestamps
    // 3. Returning recent unique queries
    
    return [];
  }

  // Save search query to history (for future implementation)
  static async saveSearchQuery(userId: string, query: string): Promise<void> {
    // TODO: Implement search history saving
    // This would store the search query in a search_history table
    // for later retrieval by getRecentSearches
  }
}