import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { join, resolve, extname } from 'path';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

/**
 * Helmet security configuration
 * Sets various HTTP security headers
 */
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "blob:", "data:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "ws://192.168.4.1", "ws://pocketcloud.local", "ws://localhost:3000"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,  // Required for media streaming
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
});

/**
 * CORS configuration - only allow requests from Pi's own IPs
 */
const ALLOWED_ORIGINS = [
  'http://192.168.4.1',
  'http://192.168.4.1:3000',
  'http://pocketcloud.local',
  'http://localhost:3000',    // Dev only
  'http://localhost:5173',    // Vite dev server
];

export const corsConfig = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS: Origin not allowed', { origin });
      callback(new Error('CORS: Origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Range',
    'X-Confirm-Delete', 
    'X-Confirm-Empty', 
    'X-Confirm-Restore', 
    'X-Requested-With'
  ],
});

/**
 * Blocked file types and extensions for security
 */
const BLOCKED_MIME_TYPES = [
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
  'application/x-shellscript',
  'text/x-shellscript',
  'application/x-dosexec',
  'application/x-winexe',
];
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi',
  '.com', '.scr', '.vbs', '.js', '.jse', '.wsf',
  '.jar', '.app', '.deb', '.rpm', '.dmg', '.pkg'
];

/**
 * File type validation middleware
 * Blocks dangerous file types and extensions
 */
export const validateFileType = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { filename, mimeType } = req.body;

    // Check file extension
    if (filename) {
      const ext = extname(filename).toLowerCase();
      if (BLOCKED_EXTENSIONS.includes(ext)) {
        logger.warn('Blocked file extension upload attempt', {
          filename,
          extension: ext,
          ip: req.ip,
          userId: req.user?.id
        });
        
        res.status(415).json({ 
          success: false,
          error: {
            code: 'BLOCKED_FILE_TYPE',
            message: `Files with ${ext} extension are not allowed for security reasons.`
          }
        });
        return;
      }
    }

    // Check MIME type
    if (mimeType && BLOCKED_MIME_TYPES.includes(mimeType)) {
      logger.warn('Blocked MIME type upload attempt', {
        filename,
        mimeType,
        ip: req.ip,
        userId: req.user?.id
      });
      
      res.status(415).json({ 
        success: false,
        error: {
          code: 'BLOCKED_MIME_TYPE',
          message: 'This file type is not allowed for security reasons.'
        }
      });
      return;
    }

    next();
  } catch (error: any) {
    logger.error('File type validation error', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'File validation failed'
      }
    });
  }
};

/**
 * Path traversal prevention
 * Validates that file paths stay within storage directory
 */
export const validateStoragePath = (filePath: string): void => {
  const resolvedPath = resolve(filePath);
  const storageRoot = resolve(process.env.STORAGE_PATH || '/mnt/pocketcloud/files');
  
  if (!resolvedPath.startsWith(storageRoot)) {
    logger.warn('Path traversal attempt detected', {
      requestedPath: filePath,
      resolvedPath,
      storageRoot
    });
    throw new AppError('FORBIDDEN', 'Invalid file path', 403);
  }
};

/**
 * Input sanitization for filenames
 * Removes dangerous characters and limits length
 */
export const sanitizeFilename = (name: string): string => {
  if (!name || typeof name !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Invalid filename', 400);
  }

  const sanitized = name
    .replace(/\0/g, '')           // Null bytes
    .replace(/[\/\\]/g, '')       // Path separators
    .replace(/[<>:"|?*]/g, '')    // Windows reserved chars
    .replace(/^\.+/, '')          // Leading dots (hidden files)
    .trim()
    .substring(0, 255);           // Max length

  if (!sanitized) {
    throw new AppError('VALIDATION_ERROR', 'Filename contains only invalid characters', 400);
  }

  return sanitized;
};
/**
 * Request size validation middleware
 * Prevents oversized requests that could overwhelm the Pi
 */
export const validateRequestSize = (maxSizeBytes: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('content-length') || '0', 10);
    
    if (contentLength > maxSizeBytes) {
      logger.warn('Oversized request blocked', {
        contentLength,
        maxSize: maxSizeBytes,
        ip: req.ip,
        userId: req.user?.id,
        path: req.path
      });
      
      res.status(413).json({
        success: false,
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: `Request size exceeds maximum allowed size of ${Math.round(maxSizeBytes / 1024 / 1024)}MB`
        }
      });
      return;
    }
    
    next();
  };
};

/**
 * Input validation for common parameters
 */
export const validateCommonInputs = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Sanitize filename if present
    if (req.body.filename) {
      req.body.filename = sanitizeFilename(req.body.filename);
    }

    // Validate folder names
    if (req.body.folderName) {
      req.body.folderName = sanitizeFilename(req.body.folderName);
    }

    // Validate search queries
    if (req.query.q && typeof req.query.q === 'string') {
      // Limit search query length
      if (req.query.q.length > 200) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Search query too long'
          }
        });
        return;
      }
      
      // Remove potentially dangerous characters
      req.query.q = req.query.q.replace(/[<>]/g, '');
    }

    // Validate pagination parameters
    if (req.query.page) {
      const page = parseInt(req.query.page as string, 10);
      if (isNaN(page) || page < 1 || page > 10000) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid page number'
          }
        });
        return;
      }
    }

    if (req.query.limit) {
      const limit = parseInt(req.query.limit as string, 10);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid limit value'
          }
        });
        return;
      }
    }

    next();
  } catch (error: any) {
    logger.error('Input validation error', { error: error.message });
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message
      }
    });
  }
};

/**
 * Security headers middleware
 * Adds additional security headers beyond helmet
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent information disclosure
  res.removeHeader('X-Powered-By');
  
  next();
};

/**
 * IP whitelist validation for admin operations
 * Only allows admin operations from local network
 */
export const validateAdminIP = (req: Request, res: Response, next: NextFunction): void => {
  const clientIP = req.ip || '127.0.0.1';
  
  // Allow local network ranges
  const allowedRanges = [
    /^192\.168\./,     // Private network
    /^10\./,           // Private network
    /^172\.(1[6-9]|2\d|3[01])\./,  // Private network
    /^127\./,          // Localhost
    /^::1$/,           // IPv6 localhost
    /^::ffff:127\./    // IPv4-mapped IPv6 localhost
  ];
  
  const isAllowed = allowedRanges.some(range => range.test(clientIP));
  
  if (!isAllowed) {
    logger.warn('Admin operation attempted from non-local IP', {
      ip: clientIP,
      userId: req.user?.id,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin operations are only allowed from local network'
      }
    });
    return;
  }
  
  next();
};