/**
 * Folder operations service
 */

import { PocketCloudClient } from './client.js';
import { Folder, ListOptions } from './types.js';

/**
 * Service for folder operations
 */
export class FolderService {
  constructor(private client: PocketCloudClient) {}

  /**
   * Get folder metadata by ID
   * 
   * @example
   * ```typescript
   * const folder = await client.folders.get('folder-id-123');
   * console.log(folder.name, folder.path);
   * ```
   */
  async get(folderId: string): Promise<Folder> {
    return this.client.request('GET', `/api/v1/folders/${folderId}`);
  }

  /**
   * List folders
   * 
   * @example
   * ```typescript
   * // List root folders
   * const folders = await client.folders.list();
   * 
   * // List subfolders
   * const subfolders = await client.folders.list({
   *   parentId: 'folder-abc'
   * });
   * ```
   */
  async list(options: { parentId?: string | null } = {}): Promise<{
    folders: Folder[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  }> {
    const params = new URLSearchParams();
    
    if (options.parentId !== undefined) {
      params.set('parentId', options.parentId || '');
    }

    const query = params.toString();
    const path = `/api/v1/folders${query ? `?${query}` : ''}`;
    
    return this.client.request('GET', path);
  }

  /**
   * Create a new folder
   * 
   * @example
   * ```typescript
   * // Create in root
   * const folder = await client.folders.create('My Documents');
   * 
   * // Create in parent folder
   * const subfolder = await client.folders.create('Subfolder', {
   *   parentId: 'folder-abc'
   * });
   * ```
   */
  async create(name: string, options: { parentId?: string | null } = {}): Promise<Folder> {
    return this.client.request('POST', '/api/v1/folders', {
      name,
      parentId: options.parentId || null
    });
  }

  /**
   * Rename a folder
   * 
   * @example
   * ```typescript
   * await client.folders.rename('folder-id-123', 'New Folder Name');
   * ```
   */
  async rename(folderId: string, newName: string): Promise<Folder> {
    return this.client.request('PATCH', `/api/v1/folders/${folderId}`, {
      name: newName
    });
  }

  /**
   * Move a folder to a different parent
   * 
   * @example
   * ```typescript
   * // Move to another folder
   * await client.folders.move('folder-id-123', { parentId: 'parent-folder-id' });
   * 
   * // Move to root
   * await client.folders.move('folder-id-123', { parentId: null });
   * ```
   */
  async move(folderId: string, options: { parentId?: string | null }): Promise<Folder> {
    return this.client.request('PATCH', `/api/v1/folders/${folderId}`, {
      parentId: options.parentId
    });
  }

  /**
   * Delete a folder (move to trash)
   * 
   * @example
   * ```typescript
   * await client.folders.delete('folder-id-123');
   * ```
   */
  async delete(folderId: string): Promise<void> {
    await this.client.request('DELETE', `/api/v1/folders/${folderId}`);
  }

  /**
   * Permanently delete a folder (bypass trash)
   * 
   * @example
   * ```typescript
   * await client.folders.permanentDelete('folder-id-123');
   * ```
   */
  async permanentDelete(folderId: string): Promise<void> {
    await this.client.request('DELETE', `/api/v1/folders/${folderId}?permanent=true`);
  }

  /**
   * Copy a folder
   * 
   * @example
   * ```typescript
   * const copy = await client.folders.copy('folder-id-123', {
   *   name: 'Copy of Folder',
   *   parentId: 'target-parent-id'
   * });
   * ```
   */
  async copy(folderId: string, options: {
    name?: string;
    parentId?: string | null;
  } = {}): Promise<Folder> {
    return this.client.request('POST', `/api/v1/folders/${folderId}/copy`, options);
  }

  /**
   * Restore a folder from trash
   * 
   * @example
   * ```typescript
   * await client.folders.restore('folder-id-123');
   * ```
   */
  async restore(folderId: string): Promise<Folder> {
    return this.client.request('POST', `/api/v1/folders/${folderId}/restore`);
  }

  /**
   * Get folder contents (files and subfolders)
   * 
   * @example
   * ```typescript
   * const contents = await client.folders.getContents('folder-id-123');
   * console.log(`${contents.files.length} files, ${contents.folders.length} folders`);
   * ```
   */
  async getContents(folderId: string | null, options: ListOptions = {}): Promise<{
    files: any[];
    folders: Folder[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  }> {
    const params = new URLSearchParams();
    
    if (folderId) {
      params.set('folderId', folderId);
    }
    if (options.page) params.set('page', options.page.toString());
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.sortOrder) params.set('sortOrder', options.sortOrder);

    const query = params.toString();
    const path = `/api/v1/folders/contents${query ? `?${query}` : ''}`;
    
    return this.client.request('GET', path);
  }

  /**
   * Get folder tree structure
   * 
   * @example
   * ```typescript
   * const tree = await client.folders.getTree();
   * console.log('Folder structure:', tree);
   * ```
   */
  async getTree(rootId?: string | null): Promise<Folder[]> {
    const params = new URLSearchParams();
    if (rootId) {
      params.set('rootId', rootId);
    }

    const query = params.toString();
    const path = `/api/v1/folders/tree${query ? `?${query}` : ''}`;
    
    return this.client.request('GET', path);
  }

  /**
   * Get folder statistics
   * 
   * @example
   * ```typescript
   * const stats = await client.folders.getStats('folder-id-123');
   * console.log(`${stats.fileCount} files, ${stats.totalSize} bytes`);
   * ```
   */
  async getStats(folderId: string): Promise<{
    fileCount: number;
    folderCount: number;
    totalSize: number;
    lastModified: number;
  }> {
    return this.client.request('GET', `/api/v1/folders/${folderId}/stats`);
  }

  /**
   * Create folder path (creates intermediate folders if needed)
   * 
   * @example
   * ```typescript
   * const folder = await client.folders.createPath('/Documents/Projects/MyApp');
   * ```
   */
  async createPath(path: string): Promise<Folder> {
    return this.client.request('POST', '/api/v1/folders/create-path', {
      path: path.startsWith('/') ? path : `/${path}`
    });
  }
}