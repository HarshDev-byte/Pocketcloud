import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { User } from '../db/types';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, 'password_hash'>;
      sessionId?: string;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: Omit<User, 'password_hash'>;
  sessionId: string;
}

/**
 * Middleware to require authentication
 * Validates session token from HTTP-only cookie
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    // Get session token from HTTP-only cookie
    const sessionToken = req.cookies?.pcd_session;

    if (!sessionToken) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Validate session
    const validation = AuthService.validateSession(sessionToken);

    if (!validation.valid || !validation.user || !validation.session) {
      // Clear invalid cookie
      res.clearCookie('pcd_session', {
        httpOnly: true,
        sameSite: 'strict',
        secure: false, // HTTP-only LAN
        path: '/'
      });
      
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    // Attach user and session to request
    req.user = validation.user;
    req.sessionId = validation.session.id;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Middleware to require admin role
 * Must be used after requireAuth
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

/**
 * Optional auth middleware - attaches user if authenticated but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const sessionToken = req.cookies?.pcd_session;

    if (sessionToken) {
      const validation = AuthService.validateSession(sessionToken);
      
      if (validation.valid && validation.user && validation.session) {
        req.user = validation.user;
        req.sessionId = validation.session.id;
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    // Continue without authentication on error
    next();
  }
}

/**
 * Middleware to extract IP address and user agent for logging
 */
export function extractClientInfo(req: Request, res: Response, next: NextFunction): void {
  // Get real IP address (considering potential reverse proxy)
  const forwarded = req.headers['x-forwarded-for'] as string;
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.connection.remoteAddress;
  
  // Store in request for use in auth service
  (req as any).clientIp = ip;
  (req as any).clientUserAgent = req.headers['user-agent'];
  
  next();
}