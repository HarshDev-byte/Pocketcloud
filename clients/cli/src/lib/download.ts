/**
 * Streaming download with resume support
 * Uses HTTP Range requests for resumable downloads
 */

import { createWriteStream, existsSync, statSync, WriteStream } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs-extra';
import fetch from 'node-fetch';
import { config } from './config';
import { ProgressBar } from './progress';
import chalk from 'chalk';

export interface DownloadOptions {
  resume?: boolean;
  onProgress?: (progress: DownloadProgress) => void;
  timeout?: number;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  speed: number; // bytes per second
  eta: number; // seconds
}

export class StreamingDownloader {
  /**
   * Download file with resume support
   */
  public async downloadFile(
    remotePath: string,
    localPath: string,
    options: DownloadOptions = {}
  ): Promise<boolean> {
    const {
      resume = true,
      onProgress,
      timeout = 30000
    } = options;

    // Ensure local directory exists
    const localDir = dirname(localPath);
    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true });
    }

    // Check if file exists and get resume position
    let resumePosition = 0;
    if (resume && existsSync(localPath)) {
      const stats = statSync(localPath);
      resumePosition = stats.size;
    }

    // Get file info from server
    const fileInfo = await this.getFileInfo(remotePath);
    if (!fileInfo) {
      throw new Error(`File not found: ${remotePath}`);
    }

    const totalBytes = fileInfo.size;
    
    // Check if file is already complete
    if (resumePosition >= totalBytes) {
      console.log(chalk.green(`✓ File already downloaded: ${localPath}`));
      return true;
    }

    console.log(chalk.blue(`Downloading ${remotePath}`));
    
    const progressBar = new ProgressBar('', {
      total: totalBytes,
      width: 40,
      complete: '█',
      incomplete: '░'
    });

    // Set initial progress if resuming
    if (resumePosition > 0) {
      progressBar.update(resumePosition);
      console.log(chalk.yellow(`Resuming download from ${this.formatBytes(resumePosition)}`));
    }

    const startTime = Date.now();
    let lastProgressTime = startTime;
    let lastBytesDownloaded = resumePosition;

    try {
      // Create write stream (append mode if resuming)
      const writeStream = createWriteStream(localPath, {
        flags: resumePosition > 0 ? 'a' : 'w'
      });

      // Download with range request
      const success = await this.downloadRange(
        remotePath,
        writeStream,
        resumePosition,
        totalBytes,
        (bytesDownloaded) => {
          const now = Date.now();
          const elapsed = (now - lastProgressTime) / 1000;
          const speed = elapsed > 0 ? (bytesDownloaded - lastBytesDownloaded) / elapsed : 0;
          const eta = speed > 0 ? (totalBytes - bytesDownloaded) / speed : 0;

          const progress: DownloadProgress = {
            bytesDownloaded,
            totalBytes,
            percentage: Math.round((bytesDownloaded / totalBytes) * 100),
            speed,
            eta
          };

          progressBar.update(bytesDownloaded);

          if (onProgress) {
            onProgress(progress);
          }

          lastProgressTime = now;
          lastBytesDownloaded = bytesDownloaded;
        },
        timeout
      );

      writeStream.end();

      if (success) {
        progressBar.complete();
        console.log(chalk.green(`✓ Download completed: ${localPath}`));
        return true;
      } else {
        throw new Error('Download failed');
      }

    } catch (error) {
      progressBar.terminate();
      console.error(chalk.red(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      throw error;
    }
  }

  /**
   * Download file range using HTTP Range requests
   */
  private async downloadRange(
    remotePath: string,
    writeStream: WriteStream,
    startByte: number,
    totalBytes: number,
    onProgress: (bytesDownloaded: number) => void,
    timeout: number
  ): Promise<boolean> {
    try {
      const url = `${config.getConnectionUrl()}/api/files/download?path=${encodeURIComponent(remotePath)}`;
      
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${config.get('token')}`
      };

      // Add Range header if resuming
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check if server supports range requests
      if (startByte > 0 && response.status !== 206) {
        throw new Error('Server does not support resume (HTTP 206 Partial Content)');
      }

      const body = response.body;
      if (!body) {
        throw new Error('No response body');
      }

      let bytesDownloaded = startByte;

      return new Promise((resolve, reject) => {
        body.on('data', (chunk: Buffer) => {
          writeStream.write(chunk);
          bytesDownloaded += chunk.length;
          onProgress(bytesDownloaded);
        });

        body.on('end', () => {
          resolve(true);
        });

        body.on('error', (error) => {
          reject(error);
        });

        writeStream.on('error', (error) => {
          reject(error);
        });
      });

    } catch (error) {
      throw error;
    }
  }

  /**
   * Get file information from server
   */
  private async getFileInfo(remotePath: string): Promise<{ size: number } | null> {
    try {
      const url = `${config.getConnectionUrl()}/api/files/info?path=${encodeURIComponent(remotePath)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.get('token')}`
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as any;
      return {
        size: data.size || 0
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Check if a file can be resumed
   */
  public async canResume(remotePath: string, localPath: string): Promise<boolean> {
    if (!existsSync(localPath)) {
      return false;
    }

    const fileInfo = await this.getFileInfo(remotePath);
    if (!fileInfo) {
      return false;
    }

    const localStats = statSync(localPath);
    return localStats.size < fileInfo.size;
  }
}

export const downloader = new StreamingDownloader();