/**
 * Share service for creating and managing file shares
 */

import { PocketCloudClient } from './client.js';
import { Share } from './types.js';

/**
 * Service for managing file shares
 */
export class ShareService {
  constructor(private client: PocketCloudClient) {}

  /**
   * Create a public share for a file
   * 
   * @example
   * ```typescript
   * // Simple share
   * const share = await client.shares.create('file-id-123');
   * console.log('Share URL:', share.url);
   * 
   * // Password protected share with expiration
   * const share = await client.shares.create('file-id-123', {
   *   password: 'secret123',
   *   expiresIn: 7 * 24 * 60 * 60 * 1000, // 7 days
   *   maxDownloads: 10
   * });
   * ```
   */
  async create(fileId: string, options: {
    password?: string;
    expiresIn?: number; // milliseconds from now
    expiresAt?: Date;
    maxDownloads?: number;
  } = {}): Promise<Share> {
    const data: any = { fileId };
    
    if (options.password) data.password = options.password;
    if (options.expiresIn) data.expiresAt = Date.now() + options.expiresIn;
    if (options.expiresAt) data.expiresAt = options.expiresAt.getTime();
    if (options.maxDownloads) data.maxDownloads = options.maxDownloads;

    return this.client.request('POST', '/api/v1/shares', data);
  }

  /**
   * Get share information
   * 
   * @example
   * ```typescript
   * const share = await client.shares.get('share-id-123');
   * console.log(`Downloaded ${share.downloadCount}/${share.maxDownloads} times`);
   * ```
   */
  async get(shareId: string): Promise<Share> {
    return this.client.request('GET', `/api/v1/shares/${shareId}`);
  }

  /**
   * List all shares created by the current user
   * 
   * @example
   * ```typescript
   * const shares = await client.shares.list();
   * console.log(`You have ${shares.length} active shares`);
   * ```
   */
  async list(options: {
    page?: number;
    limit?: number;
    fileId?: string;
    active?: boolean;
  } = {}): Promise<{
    shares: Share[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  }> {
    const params = new URLSearchParams();
    
    if (options.page) params.set('page', options.page.toString());
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.fileId) params.set('fileId', options.fileId);
    if (options.active !== undefined) params.set('active', options.active.toString());

    const query = params.toString();
    const path = `/api/v1/shares${query ? `?${query}` : ''}`;
    
    return this.client.request('GET', path);
  }

  /**
   * Update share settings
   * 
   * @example
   * ```typescript
   * await client.shares.update('share-id-123', {
   *   password: 'newpassword',
   *   maxDownloads: 20
   * });
   * ```
   */
  async update(shareId: string, updates: {
    password?: string | null;
    expiresAt?: Date | null;
    maxDownloads?: number | null;
    isActive?: boolean;
  }): Promise<Share> {
    const data: any = {};
    
    if (updates.password !== undefined) data.password = updates.password;
    if (updates.expiresAt !== undefined) {
      data.expiresAt = updates.expiresAt ? updates.expiresAt.getTime() : null;
    }
    if (updates.maxDownloads !== undefined) data.maxDownloads = updates.maxDownloads;
    if (updates.isActive !== undefined) data.isActive = updates.isActive;

    return this.client.request('PATCH', `/api/v1/shares/${shareId}`, data);
  }

  /**
   * Delete a share
   * 
   * @example
   * ```typescript
   * await client.shares.delete('share-id-123');
   * ```
   */
  async delete(shareId: string): Promise<void> {
    await this.client.request('DELETE', `/api/v1/shares/${shareId}`);
  }

  /**
   * Get share statistics
   * 
   * @example
   * ```typescript
   * const stats = await client.shares.getStats('share-id-123');
   * console.log('Download history:', stats.downloads);
   * ```
   */
  async getStats(shareId: string): Promise<{
    downloadCount: number;
    lastDownload: number | null;
    downloads: Array<{
      timestamp: number;
      ipAddress: string;
      userAgent: string;
    }>;
  }> {
    return this.client.request('GET', `/api/v1/shares/${shareId}/stats`);
  }

  /**
   * Download a file from a public share (no authentication required)
   * 
   * @example
   * ```typescript
   * // Download from share token
   * const stream = await client.shares.download('share-token-abc', {
   *   password: 'secret123'
   * });
   * 
   * // Save to file (Node.js)
   * await client.shares.download('share-token-abc', {
   *   destination: './shared-file.pdf'
   * });
   * ```
   */
  async download(shareToken: string, options: {
    password?: string;
    destination?: string;
    onProgress?: (progress: { percent: number; speed: number; eta: number }) => void;
  } = {}): Promise<ReadableStream | void> {
    const url = `${this.client.baseUrl}/api/v1/shares/${shareToken}/download`;
    
    const headers: Record<string, string> = {};
    if (options.password) {
      headers['X-Share-Password'] = options.password;
    }

    try {
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Share download failed: ${response.status} ${errorData.message || response.statusText}`);
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

                  options.onProgress({ percent, speed, eta });

                  lastProgressTime = now;
                  lastTransferred = transferred;
                }
              }
            }
            
            fileStream.end();
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
      throw new Error(`Share download failed: ${error.message}`);
    }
  }

  /**
   * Get share information from token (no authentication required)
   * 
   * @example
   * ```typescript
   * const info = await client.shares.getPublicInfo('share-token-abc');
   * console.log('File name:', info.fileName);
   * ```
   */
  async getPublicInfo(shareToken: string): Promise<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    requiresPassword: boolean;
    expiresAt: number | null;
    downloadCount: number;
    maxDownloads: number | null;
  }> {
    const url = `${this.client.baseUrl}/api/v1/shares/${shareToken}/info`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to get share info: ${response.status} ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Create a temporary share that expires quickly
   * 
   * @example
   * ```typescript
   * const share = await client.shares.createTemporary('file-id-123', {
   *   expiresInMinutes: 30
   * });
   * ```
   */
  async createTemporary(fileId: string, options: {
    expiresInMinutes?: number;
    maxDownloads?: number;
  } = {}): Promise<Share> {
    const expiresIn = (options.expiresInMinutes || 60) * 60 * 1000; // Default 1 hour
    
    return this.create(fileId, {
      expiresIn,
      maxDownloads: options.maxDownloads || 1
    });
  }

  /**
   * Get all shares for a specific file
   * 
   * @example
   * ```typescript
   * const fileShares = await client.shares.getForFile('file-id-123');
   * ```
   */
  async getForFile(fileId: string): Promise<Share[]> {
    const result = await this.list({ fileId });
    return result.shares;
  }

  /**
   * Disable all shares for a file
   * 
   * @example
   * ```typescript
   * await client.shares.disableForFile('file-id-123');
   * ```
   */
  async disableForFile(fileId: string): Promise<void> {
    const shares = await this.getForFile(fileId);
    
    await Promise.all(
      shares.map(share => 
        this.update(share.id, { isActive: false })
      )
    );
  }
}