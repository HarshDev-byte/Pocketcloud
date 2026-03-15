/**
 * Upload service with chunked and resumable uploads
 */

import { PocketCloudClient } from './client.js';
import { 
  File, 
  UploadOptions, 
  DirectoryUploadOptions, 
  ProgressEvent, 
  ChunkProgressEvent,
  DirectoryUploadProgress,
  UploadSession 
} from './types.js';
import { UploadCancelledError, createNetworkError } from './errors.js';

/**
 * Represents an active upload that can be controlled
 */
export class Upload {
  private cancelled = false;

  constructor(
    private client: PocketCloudClient,
    private uploadId: string,
    private session: UploadSession
  ) {}

  /**
   * Complete the upload
   */
  async complete(): Promise<File> {
    if (this.cancelled) {
      throw new UploadCancelledError();
    }

    return this.client.request('POST', `/api/v1/upload/${this.uploadId}/complete`);
  }

  /**
   * Cancel the upload
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Get upload progress
   */
  async getProgress(): Promise<{
    uploadId: string;
    received: number[];
    total: number;
    percentage: number;
  }> {
    return this.client.request('GET', `/api/v1/upload/${this.uploadId}/progress`);
  }

  /**
   * Check if upload is cancelled
   */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Get upload session info
   */
  get info(): UploadSession {
    return { ...this.session };
  }
}

/**
 * Service for file uploads
 */
export class UploadService {
  constructor(private client: PocketCloudClient) {}

  /**
   * Upload a file (simple upload for files < 10MB, chunked for larger files)
   * 
   * @example
   * ```typescript
   * // Simple upload
   * const file = await client.upload.file('./photo.jpg', {
   *   folderId: 'folder-abc',
   *   onProgress: ({ percent }) => console.log(`${percent}%`)
   * });
   * 
   * // Browser File object
   * const file = await client.upload.file(fileInput.files[0]);
   * ```
   */
  async file(
    source: string | File | Buffer | ArrayBuffer,
    options: UploadOptions = {}
  ): Promise<File> {
    const fileData = await this.prepareFileData(source);
    
    // Use simple upload for small files (< 10MB)
    if (fileData.size < 10 * 1024 * 1024) {
      return this.simpleUpload(fileData, options);
    }

    // Use chunked upload for larger files
    const upload = await this.start(source, options);
    return upload.complete();
  }

  /**
   * Start a chunked upload (for large files or when you need control)
   * 
   * @example
   * ```typescript
   * const upload = await client.upload.start('./large-video.mp4', {
   *   folderId: 'folder-abc',
   *   chunkSize: 5 * 1024 * 1024,  // 5MB chunks
   *   concurrency: 3,
   *   onProgress: ({ percent, speed, eta }) => {
   *     console.log(`${percent}% @ ${speed/1024/1024:.1f} MB/s, ${eta}s remaining`);
   *   },
   *   onChunkComplete: ({ index, total }) => {
   *     console.log(`Chunk ${index + 1}/${total} complete`);
   *   }
   * });
   * 
   * await upload.complete();
   * ```
   */
  async start(
    source: string | File | Buffer | ArrayBuffer,
    options: UploadOptions = {}
  ): Promise<Upload> {
    const fileData = await this.prepareFileData(source);
    const chunkSize = options.chunkSize || 5 * 1024 * 1024; // 5MB default
    
    // Calculate checksum
    const checksum = await this.calculateChecksum(fileData.data);

    // Initialize upload session
    const session = await this.client.request<UploadSession>('POST', '/api/v1/upload/init', {
      filename: fileData.name,
      size: fileData.size,
      mimeType: fileData.mimeType,
      folderId: options.folderId,
      checksum
    });

    // Upload chunks
    await this.uploadChunks(session, fileData.data, options);

    return new Upload(this.client, session.id, session);
  }

  /**
   * Resume an interrupted upload
   * 
   * @example
   * ```typescript
   * const upload = await client.upload.resume('upload-id-xyz');
   * await upload.complete();
   * ```
   */
  async resume(uploadId: string): Promise<Upload> {
    // Get upload progress to see which chunks are missing
    const progress = await this.client.request('GET', `/api/v1/upload/${uploadId}/progress`);
    
    // This would require storing the original file data somewhere
    // For now, throw an error suggesting to restart the upload
    throw new Error('Upload resume not implemented. Please restart the upload.');
  }

  /**
   * Upload from browser File object
   * 
   * @example
   * ```typescript
   * const fileInput = document.getElementById('file') as HTMLInputElement;
   * const file = await client.upload.fromFileObject(fileInput.files[0], {
   *   onProgress: ({ percent }) => {
   *     progressBar.style.width = `${percent}%`;
   *   }
   * });
   * ```
   */
  async fromFileObject(file: File, options: UploadOptions = {}): Promise<File> {
    return this.file(file, options);
  }

  /**
   * Upload a directory (Node.js only)
   * 
   * @example
   * ```typescript
   * const results = await client.upload.directory('./photos/', {
   *   remotePath: '/Vacation 2024',
   *   recursive: true,
   *   filter: (filePath) => !filePath.includes('.DS_Store'),
   *   onDirectoryProgress: ({ current, total, fileName }) => {
   *     console.log(`Uploading ${fileName} (${current}/${total})`);
   *   }
   * });
   * ```
   */
  async directory(
    localPath: string,
    options: DirectoryUploadOptions = {}
  ): Promise<{ files: File[]; errors: Array<{ path: string; error: Error }> }> {
    // Check if we're in Node.js environment
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new Error('Directory upload is only available in Node.js environment');
    }

    const fs = await import('fs');
    const path = await import('path');
    const crypto = await import('crypto');

    const results: File[] = [];
    const errors: Array<{ path: string; error: Error }> = [];
    
    // Ensure target folder exists
    let targetFolderId = options.folderId;
    if (options.remotePath) {
      const folder = await this.client.folders.createPath(options.remotePath);
      targetFolderId = folder.id;
    }

    // Scan directory
    const filesToUpload = await this.scanDirectory(localPath, options);
    
    let current = 0;
    for (const filePath of filesToUpload) {
      try {
        current++;
        const fileName = path.basename(filePath);
        
        // Calculate relative path for folder structure
        const relativePath = path.relative(localPath, path.dirname(filePath));
        let fileFolderId = targetFolderId;
        
        if (relativePath && relativePath !== '.') {
          const folder = await this.client.folders.createPath(
            path.join(options.remotePath || '', relativePath)
          );
          fileFolderId = folder.id;
        }

        // Report directory progress
        if (options.onDirectoryProgress) {
          options.onDirectoryProgress({
            current,
            total: filesToUpload.length,
            fileName,
            percent: Math.round((current / filesToUpload.length) * 100)
          });
        }

        // Upload file
        const file = await this.file(filePath, {
          ...options,
          folderId: fileFolderId
        });
        
        results.push(file);

      } catch (error) {
        errors.push({
          path: filePath,
          error: error as Error
        });
      }
    }

    return { files: results, errors };
  }

  /**
   * Simple upload for small files
   */
  private async simpleUpload(
    fileData: { name: string; data: Buffer | ArrayBuffer; size: number; mimeType: string },
    options: UploadOptions
  ): Promise<File> {
    const formData = new FormData();
    
    // Convert data to Blob for FormData
    const blob = new Blob([fileData.data], { type: fileData.mimeType });
    formData.append('file', blob, fileData.name);
    
    if (options.folderId) {
      formData.append('folderId', options.folderId);
    }

    // Make upload request with progress tracking
    const url = `${this.client.baseUrl}/api/v1/upload/simple`;
    const config = this.client.configuration;
    
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Upload failed: ${response.status} ${errorData.message || response.statusText}`);
      }

      const result = await response.json();
      return result.data;

    } catch (error: any) {
      throw createNetworkError(error);
    }
  }

  /**
   * Upload file in chunks
   */
  private async uploadChunks(
    session: UploadSession,
    data: Buffer | ArrayBuffer,
    options: UploadOptions
  ): Promise<void> {
    const buffer = data instanceof ArrayBuffer ? Buffer.from(data) : data;
    const concurrency = options.concurrency || 3;
    const chunkSize = session.chunkSize;
    
    let uploadedBytes = 0;
    const startTime = Date.now();
    
    // Create chunk upload tasks
    const chunkTasks: Array<() => Promise<void>> = [];
    
    for (let i = 0; i < session.totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, buffer.length);
      const chunkData = buffer.slice(start, end);
      
      chunkTasks.push(async () => {
        await this.uploadChunk(session.id, i, chunkData);
        
        uploadedBytes += chunkData.length;
        
        // Report chunk progress
        if (options.onChunkComplete) {
          options.onChunkComplete({
            index: i,
            total: session.totalChunks,
            size: chunkData.length
          });
        }
        
        // Report overall progress
        if (options.onProgress) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = uploadedBytes / elapsed;
          const remaining = session.size - uploadedBytes;
          const eta = speed > 0 ? Math.round(remaining / speed) : 0;
          const percent = Math.round((uploadedBytes / session.size) * 100);
          
          options.onProgress({
            percent,
            speed,
            eta,
            transferred: uploadedBytes,
            total: session.size
          });
        }
      });
    }
    
    // Execute chunks with concurrency limit
    await this.executeConcurrent(chunkTasks, concurrency);
  }

  /**
   * Upload a single chunk
   */
  private async uploadChunk(uploadId: string, chunkIndex: number, data: Buffer): Promise<void> {
    const url = `${this.client.baseUrl}/api/v1/upload/${uploadId}/chunk/${chunkIndex}`;
    const config = this.client.configuration;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream'
    };
    
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: data
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Chunk upload failed: ${response.status} ${errorData.message || response.statusText}`);
    }
  }

  /**
   * Execute tasks with concurrency limit
   */
  private async executeConcurrent<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];
    
    for (const task of tasks) {
      const promise = task().then(result => {
        results.push(result);
      });
      
      executing.push(promise);
      
      if (executing.length >= concurrency) {
        await Promise.race(executing);
        executing.splice(executing.findIndex(p => p === promise), 1);
      }
    }
    
    await Promise.all(executing);
    return results;
  }

  /**
   * Prepare file data from various sources
   */
  private async prepareFileData(
    source: string | File | Buffer | ArrayBuffer
  ): Promise<{ name: string; data: Buffer | ArrayBuffer; size: number; mimeType: string }> {
    if (typeof source === 'string') {
      // File path (Node.js)
      if (typeof process === 'undefined' || !process.versions?.node) {
        throw new Error('File path uploads are only available in Node.js environment');
      }
      
      const fs = await import('fs');
      const path = await import('path');
      const mime = await import('mime-types');
      
      const data = fs.readFileSync(source);
      const name = path.basename(source);
      const mimeType = mime.lookup(source) || 'application/octet-stream';
      
      return {
        name,
        data,
        size: data.length,
        mimeType
      };
    }
    
    if (source instanceof File) {
      // Browser File object
      const data = await source.arrayBuffer();
      return {
        name: source.name,
        data,
        size: source.size,
        mimeType: source.type || 'application/octet-stream'
      };
    }
    
    if (source instanceof Buffer) {
      return {
        name: 'upload',
        data: source,
        size: source.length,
        mimeType: 'application/octet-stream'
      };
    }
    
    if (source instanceof ArrayBuffer) {
      return {
        name: 'upload',
        data: source,
        size: source.byteLength,
        mimeType: 'application/octet-stream'
      };
    }
    
    throw new Error('Unsupported source type');
  }

  /**
   * Calculate SHA-256 checksum
   */
  private async calculateChecksum(data: Buffer | ArrayBuffer): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // Browser environment
      const buffer = data instanceof Buffer ? data.buffer : data;
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Node.js environment
      const crypto = await import('crypto');
      const buffer = data instanceof ArrayBuffer ? Buffer.from(data) : data;
      return crypto.createHash('sha256').update(buffer).digest('hex');
    }
  }

  /**
   * Scan directory for files to upload (Node.js only)
   */
  private async scanDirectory(
    dirPath: string,
    options: DirectoryUploadOptions
  ): Promise<string[]> {
    const fs = await import('fs');
    const path = await import('path');
    
    const files: string[] = [];
    
    const scanRecursive = async (currentPath: string): Promise<void> => {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isFile()) {
          // Apply filter if provided
          if (!options.filter || options.filter(fullPath)) {
            files.push(fullPath);
          }
        } else if (entry.isDirectory() && options.recursive !== false) {
          await scanRecursive(fullPath);
        }
      }
    };
    
    await scanRecursive(dirPath);
    return files;
  }
}