/**
 * Search service
 */

import { PocketCloudClient } from './client.js';
import { SearchResult, SearchOptions } from './types.js';

/**
 * Service for searching files and folders
 */
export class SearchService {
  constructor(private client: PocketCloudClient) {}

  /**
   * Search for files and folders
   * 
   * @example
   * ```typescript
   * // Basic search
   * const results = await client.search.query('vacation photos');
   * 
   * // Advanced search with filters
   * const results = await client.search.query('document', {
   *   mimeType: 'application/pdf',
   *   folderId: 'folder-abc',
   *   limit: 20,
   *   includeContent: true
   * });
   * 
   * console.log(`Found ${results.total} results in ${results.took}ms`);
   * ```
   */
  async query(query: string, options: Omit<SearchOptions, 'query'> = {}): Promise<SearchResult> {
    const params = new URLSearchParams();
    params.set('q', query);
    
    if (options.mimeType) params.set('mimeType', options.mimeType);
    if (options.folderId) params.set('folderId', options.folderId);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.includeContent) params.set('includeContent', 'true');

    const path = `/api/v1/search?${params.toString()}`;
    return this.client.request('GET', path);
  }

  /**
   * Search for files only
   * 
   * @example
   * ```typescript
   * const files = await client.search.files('presentation', {
   *   mimeType: 'application/vnd.ms-powerpoint'
   * });
   * ```
   */
  async files(query: string, options: Omit<SearchOptions, 'query'> = {}): Promise<SearchResult> {
    const result = await this.query(query, options);
    return {
      ...result,
      folders: [] // Only return files
    };
  }

  /**
   * Search for folders only
   * 
   * @example
   * ```typescript
   * const folders = await client.search.folders('project');
   * ```
   */
  async folders(query: string, options: Omit<SearchOptions, 'query'> = {}): Promise<SearchResult> {
    const result = await this.query(query, options);
    return {
      ...result,
      files: [] // Only return folders
    };
  }

  /**
   * Search by file type
   * 
   * @example
   * ```typescript
   * // Find all images
   * const images = await client.search.byType('image/*');
   * 
   * // Find all PDFs
   * const pdfs = await client.search.byType('application/pdf');
   * ```
   */
  async byType(mimeType: string, options: Omit<SearchOptions, 'query' | 'mimeType'> = {}): Promise<SearchResult> {
    return this.query('*', { ...options, mimeType });
  }

  /**
   * Search within a specific folder
   * 
   * @example
   * ```typescript
   * const results = await client.search.inFolder('folder-id-123', 'report');
   * ```
   */
  async inFolder(folderId: string, query: string, options: Omit<SearchOptions, 'query' | 'folderId'> = {}): Promise<SearchResult> {
    return this.query(query, { ...options, folderId });
  }

  /**
   * Get search suggestions based on partial query
   * 
   * @example
   * ```typescript
   * const suggestions = await client.search.suggest('vaca');
   * // Returns: ['vacation', 'vacation photos', 'vacation 2023']
   * ```
   */
  async suggest(partialQuery: string, limit: number = 10): Promise<string[]> {
    const params = new URLSearchParams();
    params.set('q', partialQuery);
    params.set('limit', limit.toString());

    const path = `/api/v1/search/suggest?${params.toString()}`;
    return this.client.request('GET', path);
  }

  /**
   * Get popular search terms
   * 
   * @example
   * ```typescript
   * const popular = await client.search.popular();
   * console.log('Popular searches:', popular);
   * ```
   */
  async popular(limit: number = 10): Promise<Array<{ query: string; count: number }>> {
    const params = new URLSearchParams();
    params.set('limit', limit.toString());

    const path = `/api/v1/search/popular?${params.toString()}`;
    return this.client.request('GET', path);
  }

  /**
   * Search with advanced filters
   * 
   * @example
   * ```typescript
   * const results = await client.search.advanced({
   *   query: 'document',
   *   mimeType: 'application/pdf',
   *   sizeMin: 1024 * 1024, // 1MB
   *   sizeMax: 10 * 1024 * 1024, // 10MB
   *   dateFrom: new Date('2023-01-01'),
   *   dateTo: new Date('2023-12-31'),
   *   owner: 'user-id-123'
   * });
   * ```
   */
  async advanced(filters: {
    query?: string;
    mimeType?: string;
    folderId?: string;
    sizeMin?: number;
    sizeMax?: number;
    dateFrom?: Date;
    dateTo?: Date;
    owner?: string;
    tags?: string[];
    limit?: number;
  }): Promise<SearchResult> {
    const params = new URLSearchParams();
    
    if (filters.query) params.set('q', filters.query);
    if (filters.mimeType) params.set('mimeType', filters.mimeType);
    if (filters.folderId) params.set('folderId', filters.folderId);
    if (filters.sizeMin) params.set('sizeMin', filters.sizeMin.toString());
    if (filters.sizeMax) params.set('sizeMax', filters.sizeMax.toString());
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString());
    if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString());
    if (filters.owner) params.set('owner', filters.owner);
    if (filters.tags) params.set('tags', filters.tags.join(','));
    if (filters.limit) params.set('limit', filters.limit.toString());

    const path = `/api/v1/search/advanced?${params.toString()}`;
    return this.client.request('GET', path);
  }

  /**
   * Search for duplicate files
   * 
   * @example
   * ```typescript
   * const duplicates = await client.search.duplicates();
   * console.log(`Found ${duplicates.length} sets of duplicate files`);
   * ```
   */
  async duplicates(options: {
    folderId?: string;
    minSize?: number;
    algorithm?: 'checksum' | 'name' | 'size';
  } = {}): Promise<Array<{
    checksum: string;
    files: any[];
    totalSize: number;
    wastedSpace: number;
  }>> {
    const params = new URLSearchParams();
    
    if (options.folderId) params.set('folderId', options.folderId);
    if (options.minSize) params.set('minSize', options.minSize.toString());
    if (options.algorithm) params.set('algorithm', options.algorithm);

    const path = `/api/v1/search/duplicates?${params.toString()}`;
    return this.client.request('GET', path);
  }

  /**
   * Search for large files
   * 
   * @example
   * ```typescript
   * const largeFiles = await client.search.largeFiles(100 * 1024 * 1024); // > 100MB
   * ```
   */
  async largeFiles(minSize: number, options: {
    folderId?: string;
    limit?: number;
  } = {}): Promise<SearchResult> {
    return this.advanced({
      sizeMin: minSize,
      ...options
    });
  }

  /**
   * Search for old files
   * 
   * @example
   * ```typescript
   * const oldFiles = await client.search.oldFiles(365); // Older than 1 year
   * ```
   */
  async oldFiles(daysOld: number, options: {
    folderId?: string;
    limit?: number;
  } = {}): Promise<SearchResult> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    return this.advanced({
      dateTo: cutoffDate,
      ...options
    });
  }

  /**
   * Search for recently modified files
   * 
   * @example
   * ```typescript
   * const recent = await client.search.recent(7); // Last 7 days
   * ```
   */
  async recent(days: number = 7, options: {
    folderId?: string;
    limit?: number;
  } = {}): Promise<SearchResult> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    
    return this.advanced({
      dateFrom: fromDate,
      ...options
    });
  }
}