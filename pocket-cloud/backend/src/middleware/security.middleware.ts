import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { resolve, normalize, sep } from 'path';
import { fromBuffer } from 'file-type';
import { LoggerService } from '../services/logger.service';
import { AuditService } from '../services/audit.service';

// Security error class
export class SecurityError extends Error {
  constructor(message: string, public code: string = 'SECURITY_VIOLATION') {
    super(message);
    this.name = 'SecurityError';
  }
}

// Validation schemas using Zod
export const ValidationSchemas = {
  // File and folder names
  fileName: z.string()
    .min(1, 'Name cannot be empty')
    .max(255, 'Name too long')
    .refine(name => {
      // Remove path traversal attempts
      const cleaned = name.replace(/\.\./g, '').replace(/\0/g, '');
      // Allow alphanumeric, space, and safe special chars
      return /^[a-zA-Z0-9\s\.\-_\(\)\[\]]+$/.test(cleaned);
    }, 'Invalid characters in name'),

  folderName: z.string()
    .min(1, 'Folder name cannot be empty')
    .max(255, 'Folder name too long')
    .refine(name => {
      const cleaned = name.replace(/\.\./g, '').replace(/\0/g, '');
      return /^[a-zA-Z0-9\s\.\-_\(\)\[\]]+$/.test(cleaned);
    }, 'Invalid characters in folder name'),

  // Password validation
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),

  // UUID validation
  uuid: z.string().uuid('Invalid UUID format'),

  // Search query validation
  searchQuery: z.string()
    .max(100, 'Search query too long')
    .refine(query => {
      // Strip SQL injection attempts
      const dangerous = /['";\\\/\*\+\=\<\>\|\&\$\-]/;
      return !dangerous.test(query);
    }, 'Invalid search query'),

  // Network name validation
  networkName: z.string()
    .min(3, 'Network name too short')
    .max(32, 'Network name too long')
    .refine(name => /^[a-zA-Z0-9\-_]+$/.test(name), 'Invalid network name'),

  // Share settings
  shareSettings: z.object({
    fileId: z.string().uuid().optional(),
    folderId: z.string().uuid().optional(),
    expiresInHours: z.number().min(1).max(8760).optional(), // Max 1 year
    password: z.string().min(1).max(128).optional(),
    maxDownloads: z.number().min(1).max(1000).optional()
  }),

  // User creation/update
  userUpdate: z.object({
    username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/).optional(),
    password: z.string().min(8).max(128).optional(),
    role: z.enum(['admin', 'user']).optional(),
    quotaBytes: z.number().min(0).optional(),
    isActive: z.boolean().optional()
  })
};

// Helmet configuration for security headers
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "blob:", "data:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "ws://192.168.4.1", "wss://192.168.4.1"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Allow blob URLs for media
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Rate limiting configurations
export const rateLimiters = {
  // Login attempts - very strict
  login: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 attempts per minute per IP
    message: { error: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
      AuditService.logSecurityEvent(
        null,
        'rate_limit_exceeded',
        'login',
        req.ip,
        req.get('User-Agent') || 'unknown'
      );
      res.status(429).json({ error: 'Too many login attempts, please try again later' });
    }
  }),

  // Upload initialization
  uploadInit: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 uploads per minute per user
    message: { error: 'Upload rate limit exceeded' },
    keyGenerator: (req) => (req as any).user?.id || req.ip,
    handler: (req, res) => {
      AuditService.logSecurityEvent(
        (req as any).user?.id,
        'rate_limit_exceeded',
        'upload_init',
        req.ip,
        req.get('User-Agent') || 'unknown'
      );
      res.status(429).json({ error: 'Upload rate limit exceeded' });
    }
  }),

  // General API access
  api: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // 300 requests per minute per IP
    message: { error: 'API rate limit exceeded' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      AuditService.logSecurityEvent(
        (req as any).user?.id,
        'rate_limit_exceeded',
        'api_general',
        req.ip,
        req.get('User-Agent') || 'unknown'
      );
      res.status(429).json({ error: 'API rate limit exceeded' });
    }
  }),

  // Public share access
  sharePublic: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute per IP
    message: { error: 'Share access rate limit exceeded' },
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
      AuditService.logSecurityEvent(
        null,
        'rate_limit_exceeded',
        'share_public',
        req.ip,
        req.get('User-Agent') || 'unknown'
      );
      res.status(429).json({ error: 'Share access rate limit exceeded' });
    }
  }),

  // Admin routes
  admin: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute per admin user
    message: { error: 'Admin rate limit exceeded' },
    keyGenerator: (req) => (req as any).user?.id || req.ip,
    handler: (req, res) => {
      AuditService.logSecurityEvent(
        (req as any).user?.id,
        'rate_limit_exceeded',
        'admin_api',
        req.ip,
        req.get('User-Agent') || 'unknown'
      );
      res.status(429).json({ error: 'Admin rate limit exceeded' });
    }
  })
};

// Path traversal prevention
export class StorageService {
  private static readonly STORAGE_PATH = process.env.STORAGE_PATH || '/mnt/pocketcloud/files';

  static validatePath(userPath: string): string {
    try {
      // Normalize and resolve the path
      const normalizedPath = normalize(userPath);
      const resolvedPath = resolve(this.STORAGE_PATH, normalizedPath);
      
      // Ensure the resolved path is within the storage directory
      if (!resolvedPath.startsWith(this.STORAGE_PATH + sep)) {
        throw new SecurityError('Path traversal attempt detected', 'PATH_TRAVERSAL');
      }

      return resolvedPath;
    } catch (error) {
      if (error instanceof SecurityError) {
        throw error;
      }
      throw new SecurityError('Invalid file path', 'INVALID_PATH');
    }
  }

  static sanitizeFileName(fileName: string): string {
    // Remove path traversal attempts
    let sanitized = fileName.replace(/\.\./g, '').replace(/\0/g, '');
    
    // Remove leading/trailing dots and spaces
    sanitized = sanitized.replace(/^[\.\s]+|[\.\s]+$/g, '');
    
    // Limit length
    if (sanitized.length > 255) {
      const ext = sanitized.lastIndexOf('.');
      if (ext > 0) {
        const name = sanitized.substring(0, ext).substring(0, 250);
        const extension = sanitized.substring(ext);
        sanitized = name + extension;
      } else {
        sanitized = sanitized.substring(0, 255);
      }
    }

    return sanitized;
  }
}

// File type validation
export class FileTypeValidator {
  // Dangerous file extensions that should never be uploaded
  private static readonly DANGEROUS_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.psd1',
    '.php', '.php3', '.php4', '.php5', '.phtml', '.asp', '.aspx', '.jsp',
    '.py', '.pyc', '.pyo', '.rb', '.pl', '.cgi',
    '.msi', '.deb', '.rpm', '.dmg', '.pkg', '.app',
    '.dll', '.so', '.dylib'
  ];

  static async validateFile(buffer: any, originalName: string, declaredMimeType: string): Promise<void> {
    // Check file extension
    const extension = originalName.toLowerCase().substring(originalName.lastIndexOf('.'));
    if (this.DANGEROUS_EXTENSIONS.includes(extension)) {
      throw new SecurityError(`File type not allowed: ${extension}`, 'DANGEROUS_FILE_TYPE');
    }

    // Detect actual file type from magic bytes
    const detectedType = await fromBuffer(buffer);
    
    if (detectedType) {
      // Check if detected type matches declared type (with some tolerance)
      const detectedMime = detectedType.mime;
      const detectedExt = '.' + detectedType.ext;
      
      // Log suspicious mismatches
      if (declaredMimeType !== detectedMime) {
        LoggerService.warn('security', 
          `MIME type mismatch: declared=${declaredMimeType}, detected=${detectedMime}, file=${originalName}`
        );
      }

      // Block executable files detected by magic bytes
      const executableMimes = [
        'application/x-executable',
        'application/x-msdos-program',
        'application/x-msdownload',
        'application/x-dosexec'
      ];

      if (executableMimes.includes(detectedMime)) {
        throw new SecurityError('Executable file detected and blocked', 'EXECUTABLE_FILE');
      }
    }
  }
}

// Request validation middleware factory
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        
        // Log validation failures
        LoggerService.warn('security', `Validation failed: ${message}`, (req as any).user?.id);
        
        return res.status(400).json({
          error: 'Validation failed',
          details: message
        });
      }
      next(error);
    }
  };
}

// Security event logging middleware
export function logSecurityEvent(action: string, resourceType?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      const success = res.statusCode < 400;
      
      AuditService.logSecurityEvent(
        (req as any).user?.id,
        action,
        resourceType || 'unknown',
        req.ip,
        req.get('User-Agent') || 'unknown',
        success ? 'success' : 'fail',
        { statusCode: res.statusCode, path: req.path }
      );
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

// IP whitelist validation (for admin routes)
export function validateAdminIP(req: Request, res: Response, next: NextFunction) {
  const clientIP = req.ip;
  
  // Allow local network and localhost
  const allowedPatterns = [
    /^192\.168\.4\./,  // Pi network
    /^127\.0\.0\.1$/,  // Localhost
    /^::1$/,           // IPv6 localhost
    /^::ffff:127\.0\.0\.1$/ // IPv4-mapped IPv6 localhost
  ];
  
  const isAllowed = allowedPatterns.some(pattern => pattern.test(clientIP));
  
  if (!isAllowed) {
    LoggerService.warn('security', `Admin access denied from IP: ${clientIP}`, (req as any).user?.id);
    AuditService.logSecurityEvent(
      (req as any).user?.id,
      'admin_access_denied',
      'admin_route',
      clientIP,
      req.get('User-Agent') || 'unknown',
      'fail'
    );
    
    return res.status(403).json({ error: 'Access denied from this IP address' });
  }
  
  next();
}