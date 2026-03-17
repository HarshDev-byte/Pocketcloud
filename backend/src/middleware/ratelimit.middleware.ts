import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { logger } from '../utils/logger';

/**
 * Get client key from request for rate limiting
 * Prefers user ID (authenticated), falls back to IP
 */
const getKey = (req: Request): string => {
  // Prefer user ID (authenticated), fall back to IP
  if (req.user) return `user:${req.user.id}`;
  return `ip:${req.ip}`;
};

/**
 * Login rate limiter - prevents brute force attacks
 * 5 attempts per minute per IP address
 */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 5,                   // 5 attempts per minute
  keyGenerator: req => `login:${req.ip}`,  // Always by IP for login
  message: { 
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many login attempts. Please try again in 1 minute.',
      retryAfter: 60
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true  // Only count failures
});

/**
 * Upload initialization rate limiter
 * 20 upload inits per minute per user/IP
 */
export const uploadInitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,                  // 20 upload inits per minute per user
  keyGenerator: getKey,
  message: { 
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many uploads initiated. Please slow down.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * General API rate limiter
 * 300 API calls per minute per user/IP
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,                 // 300 API calls per minute per user/IP
  keyGenerator: getKey,
  skip: (req) => req.path.startsWith('/ws'),  // Never rate limit WebSocket
  message: { 
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Search rate limiter
 * 60 searches per minute per user/IP
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,                  // 60 searches per minute
  keyGenerator: getKey,
  message: { 
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Search rate limit exceeded. Please wait before searching again.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Share creation rate limiter
 * 20 new shares per hour per user
 */
export const shareLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 20,                    // 20 new shares per hour per user
  keyGenerator: getKey,
  message: { 
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Share creation limit exceeded. Please wait before creating more shares.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Share password attempt rate limiter
 * 5 password attempts per 5 minutes per IP per share token
 */
export const sharePasswordLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,   // 5 minutes
  max: 5,                     // 5 password attempts per 5 minutes per IP
  keyGenerator: req => `share-pwd:${req.ip}:${req.params.token}`,
  message: { 
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many password attempts. Please wait 5 minutes before trying again.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Download rate limiter
 * 100 downloads per minute per user/IP
 */
export const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,                   // 100 downloads per minute
  keyGenerator: getKey,
  message: { 
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Download rate limit exceeded. Please wait before downloading more files.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Admin operations rate limiter
 * 50 admin operations per minute per admin user
 */
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,                    // 50 admin operations per minute
  keyGenerator: getKey,
  message: { 
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Admin operation rate limit exceeded.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Backup operations rate limiter
 * 10 backup operations per hour per admin user
 */
export const backupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 10,                    // 10 backup operations per hour
  keyGenerator: getKey,
  message: { 
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Backup operation rate limit exceeded. Please wait before performing more backup operations.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Network operations rate limiter
 * 10 network operations per 5 minutes per admin user
 * Network changes are sensitive and should be rate limited
 */
export const networkLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,   // 5 minutes
  max: 10,                    // 10 network operations per 5 minutes
  keyGenerator: getKey,
  message: { 
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Network operation rate limit exceeded. Please wait before making more network changes.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});