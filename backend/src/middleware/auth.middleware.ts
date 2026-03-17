import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { logger } from '../utils/logger';
import { sessionCache } from '../utils/cache';
import crypto from 'crypto';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: 'admin' | 'user';
        quota_bytes: number | null;
        created_at: number;
        last_login: number | null;
        is_guest?: number;
        guest_expires_at?: number | null;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Read session cookie
    const token = req.cookies?.pcd_session;
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Login required'
        }
      });
      return;
    }

    // Hash token for cache key
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const cacheKey = `session:${tokenHash}`;
    
    // Check cache first
    const cached = sessionCache.get(cacheKey);
    if (cached) {
      // Check if guest is expired
      if (cached.is_guest && cached.guest_expires_at && cached.guest_expires_at < Date.now()) {
        res.status(401).json({
          success: false,
          error: {
            code: 'GUEST_EXPIRED',
            message: 'Guest access has expired'
          }
        });
        return;
      }
      
      req.user = cached;
      return next();
    }

    // Validate session (cache miss)
    const user = await AuthService.validateSession(token);
    
    // Check if guest is expired
    if (user.is_guest && user.guest_expires_at && user.guest_expires_at < Date.now()) {
      res.status(401).json({
        success: false,
        error: {
          code: 'GUEST_EXPIRED',
          message: 'Guest access has expired'
        }
      });
      return;
    }
    
    // Cache the result
    sessionCache.set(cacheKey, user);
    
    // Attach user to request
    req.user = user;
    
    next();
  } catch (error: any) {
    logger.warn('Authentication failed', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      error: error.message
    });

    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired session'
      }
    });
    return;
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // First check authentication
  await requireAuth(req, res, () => {
    // Check if user is admin
    if (req.user?.role !== 'admin') {
      logger.warn('Admin access denied', {
        userId: req.user?.id,
        username: req.user?.username,
        role: req.user?.role,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required'
        }
      });
    }

    next();
  });
}