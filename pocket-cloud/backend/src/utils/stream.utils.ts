import { createReadStream, ReadStream } from 'fs';
import { Response } from 'express';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

/**
 * Stream utilities optimized for Raspberry Pi 4B
 * Handles backpressure, range requests, and chunked streaming
 */

export interface RangeRequest {
  start: number;
  end: number;
  total: number;
}

export interface StreamOptions {
  bufferSize?: number;
  highWaterMark?: number;
  enableBackpressure?: boolean;
}

/**
 * Parse HTTP Range header
 */
export function parseRange(rangeHeader: string, fileSize: number): RangeRequest | null {
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) return null;
  
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
  
  if (start >= fileSize || end >= fileSize || start > end) {
    return null;
  }
  
  return { start, end, total: fileSize };
}

/**
 * Create a read stream with proper error handling and Pi optimization
 */
export function createOptimizedReadStream(
  filePath: string, 
  options: StreamOptions & { start?: number; end?: number } = {}
): ReadStream {
  const streamOptions = {
    // Optimize buffer size for Pi 4B (64KB chunks work well)
    highWaterMark: options.highWaterMark || 64 * 1024,
    start: options.start,
    end: options.end,
    autoClose: true,
    emitClose: true
  };
  
  return createReadStream(filePath, streamOptions);
}

/**
 * Pipe stream with proper backpressure handling
 */
export async function pipeWithBackpressure(
  source: ReadStream,
  destination: Response,
  options: StreamOptions = {}
): Promise<void> {
  try {
    // Set up error handling
    source.on('error', (error) => {
      console.error('Source stream error:', error);
      if (!destination.headersSent) {
        destination.status(500).json({ error: 'Stream read error' });
      } else {
        destination.destroy();
      }
    });
    
    destination.on('error', (error) => {
      console.error('Destination stream error:', error);
      source.destroy();
    });
    
    // Handle client disconnect
    destination.on('close', () => {
      source.destroy();
    });
    
    // Use pipeline for automatic backpressure handling
    await pipeline(source, destination);
    
  } catch (error) {
    console.error('Pipeline error:', error);
    throw error;
  }
}

/**
 * Handle HTTP Range requests for video streaming
 */
export async function rangeStream(
  filePath: string,
  range: RangeRequest,
  response: Response,
  mimeType: string
): Promise<void> {
  const { start, end, total } = range;
  const contentLength = end - start + 1;
  
  // Set range response headers
  response.status(206);
  response.set({
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': contentLength.toString(),
    'Content-Type': mimeType,
    'Cache-Control': 'no-cache' // Don't cache partial content
  });
  
  // Create optimized read stream for the range
  const stream = createOptimizedReadStream(filePath, { start, end });
  
  // Pipe with backpressure handling
  await pipeWithBackpressure(stream, response);
}

/**
 * Stream file with progress tracking
 */
export function chunkStream(
  filePath: string,
  response: Response,
  onProgress?: (bytesRead: number, totalBytes: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createOptimizedReadStream(filePath);
    let bytesRead = 0;
    let totalBytes = 0;
    
    // Get file size for progress tracking
    stream.on('open', () => {
      const stats = require('fs').statSync(filePath);
      totalBytes = stats.size;
    });
    
    // Track progress
    const progressTransform = new Transform({
      transform(chunk, encoding, callback) {
        bytesRead += chunk.length;
        
        if (onProgress) {
          onProgress(bytesRead, totalBytes);
        }
        
        callback(null, chunk);
      }
    });
    
    // Set up error handling
    stream.on('error', reject);
    response.on('error', reject);
    progressTransform.on('error', reject);
    
    // Handle completion
    response.on('finish', resolve);
    response.on('close', () => {
      stream.destroy();
      resolve();
    });
    
    // Pipe through progress tracker
    stream.pipe(progressTransform).pipe(response);
  });
}

/**
 * Throttled stream for bandwidth limiting
 */
export class ThrottledStream extends Transform {
  private bytesPerSecond: number;
  private lastTime: number;
  private bytesWritten: number;
  
  constructor(bytesPerSecond: number) {
    super();
    this.bytesPerSecond = bytesPerSecond;
    this.lastTime = Date.now();
    this.bytesWritten = 0;
  }
  
  _transform(chunk: any, encoding: string, callback: Function): void {
    const now = Date.now();
    const elapsed = now - this.lastTime;
    
    this.bytesWritten += chunk.length;
    
    // Calculate delay needed to maintain target rate
    const expectedTime = (this.bytesWritten / this.bytesPerSecond) * 1000;
    const delay = Math.max(0, expectedTime - elapsed);
    
    if (delay > 0) {
      setTimeout(() => {
        this.push(chunk);
        callback();
      }, delay);
    } else {
      this.push(chunk);
      callback();
    }
  }
}

/**
 * Create a throttled stream for bandwidth limiting
 */
export function createThrottledStream(
  filePath: string,
  bytesPerSecond: number,
  options: StreamOptions = {}
): ReadStream {
  const readStream = createOptimizedReadStream(filePath, options);
  const throttleStream = new ThrottledStream(bytesPerSecond);
  
  return readStream.pipe(throttleStream) as any;
}

/**
 * Stream utilities for different file types
 */
export class StreamUtils {
  
  /**
   * Stream video file with range support
   */
  public static async streamVideo(
    filePath: string,
    response: Response,
    rangeHeader?: string,
    mimeType: string = 'video/mp4'
  ): Promise<void> {
    const stats = require('fs').statSync(filePath);
    const fileSize = stats.size;
    
    if (rangeHeader) {
      const range = parseRange(rangeHeader, fileSize);
      if (range) {
        return rangeStream(filePath, range, response, mimeType);
      }
    }
    
    // Full file stream
    response.set({
      'Content-Length': fileSize.toString(),
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes'
    });
    
    const stream = createOptimizedReadStream(filePath);
    await pipeWithBackpressure(stream, response);
  }
  
  /**
   * Stream image with optional resizing
   */
  public static async streamImage(
    filePath: string,
    response: Response,
    mimeType: string = 'image/jpeg'
  ): Promise<void> {
    response.set({
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=86400' // Cache images for 1 day
    });
    
    const stream = createOptimizedReadStream(filePath);
    await pipeWithBackpressure(stream, response);
  }
  
  /**
   * Stream generic file with download headers
   */
  public static async streamDownload(
    filePath: string,
    response: Response,
    fileName: string,
    mimeType: string = 'application/octet-stream'
  ): Promise<void> {
    const stats = require('fs').statSync(filePath);
    
    response.set({
      'Content-Type': mimeType,
      'Content-Length': stats.size.toString(),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'no-cache'
    });
    
    const stream = createOptimizedReadStream(filePath);
    await pipeWithBackpressure(stream, response);
  }
}