import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const requestId = crypto.randomUUID().substring(0, 8); // short ID

  // Attach requestId to request for use in error logs
  (req as any).requestId = requestId;

  // Sanitize path — don't log session tokens that appear in URLs
  const safePath = req.path.replace(/\/[a-f0-9]{64}/g, '/[token]');

  res.on('finish', () => {
    const duration = Date.now() - start;
    
    const log = {
      requestId,
      method: req.method,
      path: safePath,
      status: res.statusCode,
      duration,
      userId: (req as any).user?.id,
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent']?.substring(0, 80),
    };

    // Log at appropriate level
    if (res.statusCode >= 500) {
      logger.error('Request failed', log);
    } else if (res.statusCode >= 400) {
      logger.warn('Request rejected', log);
    } else if (duration > 1000) {
      logger.warn('Slow request', log); // > 1s
    } else {
      logger.info('Request', log);
    }
  });

  next();
};
