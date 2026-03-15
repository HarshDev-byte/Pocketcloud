import { Request, Response, NextFunction } from 'express';
import { Transform } from 'stream';
import { bandwidthService } from '../services/bandwidth.service';
import { LoggerService } from '../services/logger.service';

export interface RateLimitedRequest extends Request {
  userId?: string;
  transferType?: 'upload' | 'download' | 'streaming';
}

/**
 * Transform stream that throttles data flow using token bucket
 */
export class ThrottleStream extends Transform {
  private userId: string;
  private transferType: 'upload' | 'download' | 'streaming';
  private bytesTransferred = 0;

  constructor(userId: string, transferType: 'upload' | 'download' | 'streaming') {
    super();
    this.userId = userId;
    this.transferType = transferType;
  }

  async _transform(chunk: any, encoding: any, callback: Function): Promise<void> {
    try {
      // Consume bandwidth tokens before allowing chunk through
      await bandwidthService.consumeBandwidth(this.userId, chunk.length, this.transferType);
      
      this.bytesTransferred += chunk.length;
      this.push(chunk);
      callback();
    } catch (error) {
      LoggerService.error('ratelimit', 'Throttle stream error', error as Error, {
        userId: this.userId,
        transferType: this.transferType,
        chunkSize: chunk.length
      });
      callback(error);
    }
  }

  getBytesTransferred(): number {
    return this.bytesTransferred;
  }
}

/**
 * Middleware to rate limit file downloads
 */
export function rateLimitDownload(req: RateLimitedRequest, res: Response, next: NextFunction): void {
  const userId = req.userId || 'anonymous';
  
  // Determine transfer type based on route
  let transferType: 'upload' | 'download' | 'streaming' = 'download';
  if (req.path.includes('/stream/')) {
    transferType = 'streaming';
  }

  // Create throttle stream
  const throttleStream = new ThrottleStream(userId, transferType);
  
  // Store throttle stream in request for use by route handlers
  (req as any).throttleStream = throttleStream;
  
  // Override res.pipe to use throttle stream
  const originalPipe = res.pipe;
  res.pipe = function(destination: any, options?: any) {
    return throttleStream.pipe(destination, options);
  };

  next();
}

/**
 * Middleware to rate limit file uploads
 */
export function rateLimitUpload(req: RateLimitedRequest, res: Response, next: NextFunction): void {
  const userId = req.userId || 'anonymous';
  
  // Store original write method
  const originalWrite = res.write;
  const originalEnd = res.end;
  
  // Track upload bytes
  let uploadBytes = 0;
  
  // Override request data handlers for upload rate limiting
  if (req.readable) {
    const throttleStream = new ThrottleStream(userId, 'upload');
    
    // Pipe request through throttle stream
    req.pipe(throttleStream);
    
    // Replace req with throttled stream for downstream handlers
    Object.setPrototypeOf(throttleStream, Object.getPrototypeOf(req));
    Object.assign(throttleStream, req);
    
    // Store throttled request
    (req as any).throttledStream = throttleStream;
  }

  next();
}

/**
 * Middleware to classify traffic type and apply appropriate rate limiting
 */
export function classifyAndRateLimit(req: RateLimitedRequest, res: Response, next: NextFunction): void {
  const userId = req.userId || 'anonymous';
  
  // Classify traffic type from route
  let transferType: 'upload' | 'download' | 'streaming' = 'download';
  
  if (req.path.includes('/upload') || req.method === 'POST' || req.method === 'PUT') {
    transferType = 'upload';
  } else if (req.path.includes('/stream/')) {
    transferType = 'streaming';
  } else if (req.path.includes('/download') || req.path.includes('/files/')) {
    transferType = 'download';
  }

  req.transferType = transferType;

  // Apply appropriate rate limiting based on transfer type
  switch (transferType) {
    case 'upload':
      return rateLimitUpload(req, res, next);
    case 'download':
    case 'streaming':
      return rateLimitDownload(req, res, next);
    default:
      next();
  }
}

/**
 * Middleware to track bandwidth usage for any response
 */
export function trackBandwidth(req: RateLimitedRequest, res: Response, next: NextFunction): void {
  const userId = req.userId || 'anonymous';
  const transferType = req.transferType || 'download';
  
  // Track response size
  const originalWrite = res.write;
  const originalEnd = res.end;
  let bytesWritten = 0;

  res.write = function(chunk: any, encoding?: any, callback?: any): boolean {
    if (chunk) {
      const chunkSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
      bytesWritten += chunkSize;
      
      // Consume bandwidth asynchronously (don't block response)
      bandwidthService.consumeBandwidth(userId, chunkSize, transferType).catch(error => {
        LoggerService.error('ratelimit', 'Bandwidth tracking error', error as Error, {
          userId,
          transferType,
          chunkSize
        });
      });
    }
    
    return originalWrite.call(this, chunk, encoding, callback);
  };

  res.end = function(chunk?: any, encoding?: any, callback?: any): Response {
    if (chunk) {
      const chunkSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
      bytesWritten += chunkSize;
      
      // Consume bandwidth asynchronously
      bandwidthService.consumeBandwidth(userId, chunkSize, transferType).catch(error => {
        LoggerService.error('ratelimit', 'Bandwidth tracking error', error as Error, {
          userId,
          transferType,
          chunkSize
        });
      });
    }

    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
}

/**
 * Express middleware factory for rate limiting
 */
export function createRateLimitMiddleware(options: {
  trackOnly?: boolean; // Only track bandwidth, don't enforce limits
  transferType?: 'upload' | 'download' | 'streaming';
} = {}) {
  return (req: RateLimitedRequest, res: Response, next: NextFunction) => {
    // Extract user ID from auth middleware
    req.userId = (req as any).user?.id || 'anonymous';
    
    if (options.transferType) {
      req.transferType = options.transferType;
    }

    if (options.trackOnly) {
      return trackBandwidth(req, res, next);
    } else {
      return classifyAndRateLimit(req, res, next);
    }
  };
}