import { Request, Response, NextFunction } from 'express';
import compression from 'compression';

/**
 * Smart compression middleware optimized for Pi 4B
 * - Compresses API JSON responses
 * - Skips file downloads and already compressed content
 * - Uses optimal settings for ARM CPU
 */

// Configure compression with Pi-optimized settings
const compressionMiddleware = compression({
  // Only compress responses larger than 1KB
  threshold: 1024,
  
  // Use level 6 for good compression/speed balance on ARM
  level: 6,
  
  // Memory level 8 (default) is good for Pi 4B
  memLevel: 8,
  
  // Custom filter function
  filter: (req: Request, res: Response): boolean => {
    // Don't compress if client doesn't support it
    if (!req.headers['accept-encoding']?.includes('gzip')) {
      return false;
    }
    
    // Don't compress file downloads (they're often already compressed)
    if (req.path.includes('/download') || req.path.includes('/files/')) {
      return false;
    }
    
    // Don't compress images, videos, or other binary content
    const contentType = res.getHeader('content-type') as string;
    if (contentType) {
      const type = contentType.toLowerCase();
      if (
        type.includes('image/') ||
        type.includes('video/') ||
        type.includes('audio/') ||
        type.includes('application/octet-stream') ||
        type.includes('application/zip') ||
        type.includes('application/pdf')
      ) {
        return false;
      }
    }
    
    // Don't compress responses that are already compressed
    if (res.getHeader('content-encoding')) {
      return false;
    }
    
    // Don't compress very small responses
    const contentLength = res.getHeader('content-length');
    if (contentLength && parseInt(contentLength as string) < 1024) {
      return false;
    }
    
    // Compress JSON API responses
    if (contentType?.includes('application/json')) {
      return true;
    }
    
    // Compress text content
    if (contentType?.includes('text/')) {
      return true;
    }
    
    // Use default compression filter for other content
    return compression.filter(req, res);
  }
});

/**
 * Middleware specifically for API responses
 */
export const compressApiResponses = (req: Request, res: Response, next: NextFunction): void => {
  // Only apply to API routes
  if (req.path.startsWith('/api/')) {
    return compressionMiddleware(req, res, next);
  }
  next();
};

/**
 * Middleware for static assets (if serving through Express)
 */
export const compressStaticAssets = (req: Request, res: Response, next: NextFunction): void => {
  // Apply compression to static assets
  if (req.path.match(/\.(js|css|html|xml|txt|json)$/)) {
    return compressionMiddleware(req, res, next);
  }
  next();
};

/**
 * Custom compression for specific content types
 */
export const compressSpecificContent = (contentTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const originalJson = res.json;
    const originalSend = res.send;
    
    // Override json method to set content type before compression
    res.json = function(data: any) {
      res.type('application/json');
      return originalJson.call(this, data);
    };
    
    // Override send method to check content type
    res.send = function(data: any) {
      const contentType = res.getHeader('content-type') as string;
      if (contentType && contentTypes.some(type => contentType.includes(type))) {
        return compressionMiddleware(req, res, () => {
          originalSend.call(res, data);
        });
      }
      return originalSend.call(this, data);
    };
    
    next();
  };
};

/**
 * Compression statistics for monitoring
 */
export class CompressionStats {
  private static stats = {
    totalRequests: 0,
    compressedRequests: 0,
    bytesIn: 0,
    bytesOut: 0,
    compressionRatio: 0
  };
  
  public static recordCompression(originalSize: number, compressedSize: number): void {
    this.stats.totalRequests++;
    this.stats.compressedRequests++;
    this.stats.bytesIn += originalSize;
    this.stats.bytesOut += compressedSize;
    this.stats.compressionRatio = this.stats.bytesOut / this.stats.bytesIn;
  }
  
  public static recordUncompressed(): void {
    this.stats.totalRequests++;
  }
  
  public static getStats(): typeof CompressionStats.stats {
    return { ...this.stats };
  }
  
  public static reset(): void {
    this.stats = {
      totalRequests: 0,
      compressedRequests: 0,
      bytesIn: 0,
      bytesOut: 0,
      compressionRatio: 0
    };
  }
}

/**
 * Middleware to track compression statistics
 */
export const trackCompressionStats = (req: Request, res: Response, next: NextFunction): void => {
  const originalEnd = res.end;
  let originalSize = 0;
  
  // Track original response size
  const originalWrite = res.write;
  res.write = function(chunk: any, ...args: any[]) {
    if (chunk) {
      originalSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    }
    return originalWrite.call(this, chunk, ...args);
  };
  
  // Track final size and compression
  res.end = function(chunk?: any, ...args: any[]) {
    if (chunk) {
      originalSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    }
    
    const contentEncoding = res.getHeader('content-encoding');
    if (contentEncoding === 'gzip') {
      // Estimate compressed size (actual size would need more complex tracking)
      const estimatedCompressedSize = Math.floor(originalSize * 0.7); // Rough estimate
      CompressionStats.recordCompression(originalSize, estimatedCompressedSize);
    } else {
      CompressionStats.recordUncompressed();
    }
    
    return originalEnd.call(this, chunk, ...args);
  };
  
  next();
};

export default compressionMiddleware;