/**
 * Chunked upload with resume support
 * Stores upload state in ~/.config/pocketcloud/uploads/
 */

import { createReadStream, statSync, existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { config } from './config';
import { ProgressBar } from './progress';
import chalk from 'chalk';

export interface UploadOptions {
  chunkSize?: number; // MB
  resume?: boolean;
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percentage: number;
  speed: number; // bytes per second
  eta: number; // seconds
  chunkIndex: number;
  totalChunks: number;
}

export interface UploadState {
  filePath: string;
  remotePath: string;
  fileSize: number;
  chunkSize: number;
  uploadedChunks: number[];
  totalChunks: number;
  uploadId: string;
  createdAt: number;
}

export class ChunkedUploader {
  private chunkSize: number;
  private uploadsDir: string;

  constructor(chunkSizeMB: number = 10) {
    this.chunkSize = chunkSizeMB * 1024 * 1024; // Convert to bytes
    this.uploadsDir = config.getUploadsDir();
  }

  /**
   * Upload file with chunking and resume support
   */
  public async uploadFile(
    localPath: string,
    remotePath: string,
    options: UploadOptions = {}
  ): Promise<boolean> {
    const {
      chunkSize = this.chunkSize / (1024 * 1024), // Convert back to MB for options
      resume = true,
      onProgress
    } = options;

    this.chunkSize = chunkSize * 1024 * 1024; // Convert to bytes

    if (!existsSync(localPath)) {
      throw new Error(`File not found: ${localPath}`);
    }

    const stats = statSync(localPath);
    const fileSize = stats.size;
    const totalChunks = Math.ceil(fileSize / this.chunkSize);
    const uploadId = this.generateUploadId(localPath, remotePath);

    // Check for existing upload state
    let uploadState: UploadState | null = null;
    if (resume) {
      uploadState = this.loadUploadState(uploadId);
    }

    // Create new upload state if none exists or file changed
    if (!uploadState || uploadState.fileSize !== fileSize) {
      uploadState = {
        filePath: localPath,
        remotePath,
        fileSize,
        chunkSize: this.chunkSize,
        uploadedChunks: [],
        totalChunks,
        uploadId,
        createdAt: Date.now()
      };
    }

    console.log(chalk.blue(`Uploading ${basename(localPath)}`));
    
    const progressBar = new ProgressBar('', {
      total: fileSize,
      width: 40,
      complete: '█',
      incomplete: '░'
    });

    const startTime = Date.now();
    let lastProgressTime = startTime;
    let lastBytesUploaded = uploadState.uploadedChunks.length * this.chunkSize;

    try {
      // Upload chunks
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        // Skip already uploaded chunks
        if (uploadState.uploadedChunks.includes(chunkIndex)) {
          continue;
        }

        const chunkStart = chunkIndex * this.chunkSize;
        const chunkEnd = Math.min(chunkStart + this.chunkSize, fileSize);
        const chunkSize = chunkEnd - chunkStart;

        // Upload chunk
        const success = await this.uploadChunk(
          localPath,
          remotePath,
          chunkIndex,
          chunkStart,
          chunkSize,
          uploadId
        );

        if (success) {
          uploadState.uploadedChunks.push(chunkIndex);
          this.saveUploadState(uploadState);

          // Update progress
          const bytesUploaded = uploadState.uploadedChunks.length * this.chunkSize;
          const now = Date.now();
          const elapsed = (now - lastProgressTime) / 1000;
          const speed = elapsed > 0 ? (bytesUploaded - lastBytesUploaded) / elapsed : 0;
          const eta = speed > 0 ? (fileSize - bytesUploaded) / speed : 0;

          const progress: UploadProgress = {
            bytesUploaded,
            totalBytes: fileSize,
            percentage: Math.round((bytesUploaded / fileSize) * 100),
            speed,
            eta,
            chunkIndex,
            totalChunks
          };

          progressBar.update(bytesUploaded);

          if (onProgress) {
            onProgress(progress);
          }

          lastProgressTime = now;
          lastBytesUploaded = bytesUploaded;
        } else {
          throw new Error(`Failed to upload chunk ${chunkIndex}`);
        }
      }

      // Finalize upload
      const finalizeSuccess = await this.finalizeUpload(uploadId, remotePath);
      if (!finalizeSuccess) {
        throw new Error('Failed to finalize upload');
      }

      progressBar.complete();
      
      // Clean up upload state
      this.deleteUploadState(uploadId);

      console.log(chalk.green(`✓ Upload completed: ${basename(localPath)}`));
      return true;

    } catch (error) {
      progressBar.terminate();
      console.error(chalk.red(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      
      // Keep upload state for resume
      this.saveUploadState(uploadState);
      throw error;
    }
  }

  /**
   * Upload a single chunk
   */
  private async uploadChunk(
    filePath: string,
    remotePath: string,
    chunkIndex: number,
    start: number,
    size: number,
    uploadId: string
  ): Promise<boolean> {
    try {
      const stream = createReadStream(filePath, { start, end: start + size - 1 });
      
      const formData = new FormData();
      formData.append('chunk', stream);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('uploadId', uploadId);
      formData.append('remotePath', remotePath);

      const response = await fetch(`${config.getConnectionUrl()}/api/upload/chunk`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${config.get('token')}`
        }
      });

      return response.ok;

    } catch (error) {
      return false;
    }
  }

  /**
   * Finalize upload (combine chunks)
   */
  private async finalizeUpload(uploadId: string, remotePath: string): Promise<boolean> {
    try {
      const response = await fetch(`${config.getConnectionUrl()}/api/upload/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.get('token')}`
        },
        body: JSON.stringify({
          uploadId,
          remotePath
        })
      });

      return response.ok;

    } catch (error) {
      return false;
    }
  }

  /**
   * Generate unique upload ID
   */
  private generateUploadId(localPath: string, remotePath: string): string {
    const stats = statSync(localPath);
    const data = `${localPath}:${remotePath}:${stats.size}:${stats.mtime.getTime()}`;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Save upload state to disk
   */
  private saveUploadState(state: UploadState): void {
    const stateFile = join(this.uploadsDir, `${state.uploadId}.json`);
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }

  /**
   * Load upload state from disk
   */
  private loadUploadState(uploadId: string): UploadState | null {
    const stateFile = join(this.uploadsDir, `${uploadId}.json`);
    
    if (!existsSync(stateFile)) {
      return null;
    }

    try {
      const data = readFileSync(stateFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete upload state file
   */
  private deleteUploadState(uploadId: string): void {
    const stateFile = join(this.uploadsDir, `${uploadId}.json`);
    
    if (existsSync(stateFile)) {
      try {
        unlinkSync(stateFile);
      } catch (error) {
        // Ignore errors when cleaning up
      }
    }
  }

  /**
   * List pending uploads
   */
  public listPendingUploads(): UploadState[] {
    const uploads: UploadState[] = [];
    
    try {
      const { readdirSync } = require('fs');
      const files = readdirSync(this.uploadsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const uploadId = file.replace('.json', '');
          const state = this.loadUploadState(uploadId);
          if (state) {
            uploads.push(state);
          }
        }
      }
    } catch (error) {
      // Directory might not exist or be readable
    }

    return uploads;
  }

  /**
   * Resume a pending upload
   */
  public async resumeUpload(uploadId: string): Promise<boolean> {
    const state = this.loadUploadState(uploadId);
    if (!state) {
      throw new Error(`Upload state not found: ${uploadId}`);
    }

    return this.uploadFile(state.filePath, state.remotePath, {
      chunkSize: state.chunkSize / (1024 * 1024),
      resume: true
    });
  }

  /**
   * Cancel a pending upload
   */
  public cancelUpload(uploadId: string): void {
    this.deleteUploadState(uploadId);
  }
}

export const uploader = new ChunkedUploader();