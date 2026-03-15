/**
 * File operations service
 */

import { PocketCloudClient } from './client.js';
import { File, DownloadOptions, MoveOptions, CopyOptions, ListOptions, ProgressEvent } from './types.js';
import { createNetworkError } from './errors.js';

/**
 * Service for file operations
 */
export class FileService {
  constructor(private client: PocketCloudClient) {}

  /**
   * Get file metadata by ID
   * 
   * @example
   * ```typescript
   * const file = await client.files.get('file-id-123');
   * console.log(file.name, file.size, file.mimeType);
   * ```
   */
  async get(fileId: string): Promise<File> {
    return this.client.request('GET', `/api/v1/files/${fileId}`);
  }

  /**
   * List files in a folder
   * 
   * @example
   * ```typescript
   * // List root folder
   * const files = await client.files.list();
   * 
   * // List specific folder with pagination
   * const files = await client.files.list({
   *   folderId: 'folder-abc',
   *   page: 1,
   *   limit: 50,
   *   sortBy: 'name'
   * });
   * ```
   */
  async list(options: ListOptions = {}): Promise<{
    files: File[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  }> {
    const params = new URLSearchParams();
    
    if (options.folderId !== undefined) {
      params.set('folderId', options.folderId || '');
    }
    if (options.page) params.set('page', options.page.toString());
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.sortOrder) params.set('sortOrder', options.sortOrder);
    if (options.mimeType) params.set('mimeType', options.mimeType);

    const query = params.toString();
    const path = `/api/v1/files${query ? `?${query}` : ''}`;
    
    return this.client.request('GET', path);
  }

  /**
   * Download a file
   * 
   * @example
   * ```typescript
   * // Download to stream (browser/Node.js)
   * const stream = await client.files.download('file-id-123');
   * 
   * // Download with progress (Node.js)
   * await client.files.download('file-id-123', {
   *   destination: './downloaded-file.pdf',
   *   onProgress: ({ percent, speed, eta }) => {
   *     console.log(`${percent}% @ ${speed} MB/s, ${eta}s remaining`);
   *   }
   * });
   * ```
   */
  async download(fileId: string, options: DownloadOptions = {}): Promise<ReadableStream | void> {
    const url = `${this.client.baseUrl}/api/v1/files/${fileId}/download`;
    
    const headers: Record<string, string> = {
      ...options.headers
    };

    // Add authentication
    const config = this.client.configuration;
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    try {
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Download failed: ${response.status} ${errorData.message || response.statusText}`);
      }

      // In browser environment, return the stream
      if (typeof window !== 'undefined') {
        return response.body!;
      }

      // In Node.js environment
      if (typeof process !== 'undefined' && process.versions?.node) {
        const fs = await import('fs');
        const path = await import('path');
        
        if (options.destination) {
          // Ensure destination directory exists
          const dir = path.dirname(options.destination);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          // Stream to file with progress tracking
          const fileStream = fs.createWriteStream(options.destination);
          const reader = response.body!.getReader();
          
          const contentLength = parseInt(response.headers.get('content-length') || '0');
          let transferred = 0;
          let lastProgressTime = Date.now();
          let lastTransferred = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) break;
              
              fileStream.write(Buffer.from(value));
              transferred += value.length;

              // Calculate progress
              if (options.onProgress && contentLength > 0) {
                const now = Date.now();
                const timeDiff = (now - lastProgressTime) / 1000;
                
                if (timeDiff >= 0.1) { // Update every 100ms
                  const bytesDiff = transferred - lastTransferred;
                  const speed = bytesDiff / timeDiff;
                  const percent = Math.round((transferred / contentLength) * 100);
                  const eta = speed > 0 ? Math.round((contentLength - transferred) / speed) : 0;

                  options.onProgress({
                    percent,
                    speed,
                    eta,
                    transferred,
                    total: contentLength
                  });

                  lastProgressTime = now;
                  lastTransferred = transferred;
                }
              }
            }
            
            fileStream.end();
            
            // Final progress update
            if (options.onProgress && contentLength > 0) {
              options.onProgress({
                percent: 100,
                speed: 0,
                eta: 0,
                transferred: contentLength,
                total: contentLength
              });
            }
          } catch (error) {
            fileStream.destroy();
            throw error;
          }
        } else {
          // Return stream for manual handling
          return response.body!;
        }
      }

    } catch (error: any) {
      throw createNetworkError(error);
    }
  }

  /**
   * Get download URL for a file (for embedding in video/audio players)
   * 
   * @example
   * ```typescript
   * const url = client.files.getDownloadUrl('file-id-123');
   * videoElement.src = url;
   * ```
   */
  getDownloadUrl(fileId: string): string {
    const config = this.client.configuration;
    const baseUrl = `${this.client.baseUrl}/api/v1/files/${fileId}/download`;
    
    if (config.apiKey) {
      return `${baseUrl}?token=${encodeURIComponent(config.apiKey)}`;
    }
    
    return baseUrl;
  }

  /**
   * Get thumbnail URL for an image/video file
   * 
   * @example
   * ```typescript
   * const thumbnailUrl = client.files.getThumbnailUrl('image-file-id');
   * imgElement.src = thumbnailUrl;
   * ```
   */
  getThumbnailUrl(fileId: string, size: 'small' | 'medium' | 'large' = 'medium'): string {
    const config = this.client.configuration;
    const baseUrl = `${this.client.baseUrl}/api/v1/files/${fileId}/thumbnail?size=${size}`;
    
    if (config.apiKey) {
      return `${baseUrl}&token=${encodeURIComponent(config.apiKey)}`;
    }
    
    return baseUrl;
  }

  /**
   * Delete a file (move to trash)
   * 
   * @example
   * ```typescript
   * await client.files.delete('file-id-123');
   * ```
   */
  async delete(fileId: string): Promise<void> {
    await this.client.request('DELETE', `/api/v1/files/${fileId}`);
  }

  /**
   * Permanently delete a file (bypass trash)
   * 
   * @example
   * ```typescript
   * await client.files.permanentDelete('file-id-123');
   * ```
   */
  async permanentDelete(fileId: string): Promise<void> {
    await this.client.request('DELETE', `/api/v1/files/${fileId}?permanent=true`);
  }

  /**
   * Rename a file
   * 
   * @example
   * ```typescript
   * await client.files.rename('file-id-123', 'new-name.pdf');
   * ```
   */
  async rename(fileId: string, newName: string): Promise<File> {
    return this.client.request('PATCH', `/api/v1/files/${fileId}`, {
      name: newName
    });
  }

  /**
   * Move a file to a different folder
   * 
   * @example
   * ```typescript
   * // Move to folder
   * await client.files.move('file-id-123', { folderId: 'folder-abc' });
   * 
   * // Move to root
   * await client.files.move('file-id-123', { folderId: null });
   * ```
   */
  async move(fileId: string, options: MoveOptions): Promise<File> {
    return this.client.request('PATCH', `/api/v1/files/${fileId}`, {
      folderId: options.folderId
    });
  }

  /**
   * Copy a file
   * 
   * @example
   * ```typescript
   * // Copy to same folder with new name
   * const copy = await client.files.copy('file-id-123', {
   *   name: 'Copy of document.pdf'
   * });
   * 
   * // Copy to different folder
   * const copy = await client.files.copy('file-id-123', {
   *   folderId: 'folder-abc'
   * });
   * ```
   */
  async copy(fileId: string, options: CopyOptions = {}): Promise<File> {
    return this.client.request('POST', `/api/v1/files/${fileId}/copy`, options);
  }

  /**
   * Restore a file from trash
   * 
   * @example
   * ```typescript
   * await client.files.restore('file-id-123');
   * ```
   */
  async restore(fileId: string): Promise<File> {
    return this.client.request('POST', `/api/v1/files/${fileId}/restore`);
  }

  /**
   * Get file versions
   * 
   * @example
   * ```typescript
   * const versions = await client.files.getVersions('file-id-123');
   * console.log(`File has ${versions.length} versions`);
   * ```
   */
  async getVersions(fileId: string): Promise<any[]> {
    return this.client.request('GET', `/api/v1/files/${fileId}/versions`);
  }

  /**
   * Restore a specific file version
   * 
   * @example
   * ```typescript
   * await client.files.restoreVersion('file-id-123', 2);
   * ```
   */
  async restoreVersion(fileId: string, version: number): Promise<File> {
    return this.client.request('POST', `/api/v1/files/${fileId}/versions/${version}/restore`);
  }

  /**
   * Get file metadata including extended attributes
   * 
   * @example
   * ```typescript
   * const metadata = await client.files.getMetadata('image-file-id');
   * console.log('EXIF data:', metadata.exif);
   * ```
   */
  async getMetadata(fileId: string): Promise<any> {
    return this.client.request('GET', `/api/v1/files/${fileId}/metadata`);
  }
}