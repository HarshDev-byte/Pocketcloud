/**
 * Authentication middleware for session validation
 * Protects routes that require user authentication
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService, AuthError, SafeUser } from '../services/auth.service.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}

const authService = new AuthService();

/**
 * Middleware to authenticate session tokens from cookies
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Extract session token from cookie
    const token = req.cookies.pcd_session;
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Validate session and get user
    const user = await authService.validateSession(token);
    
    // Attach user to request
    req.user = user;
    
    next();
  } catch (error) {
    if (error instanceof AuthError) {
      // Clear invalid cookie
      res.clearCookie('pcd_session', {
        httpOnly: true,
        sameSite: 'strict',
        path: '/'
      });
      
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    } else {
      console.error('Auth middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

/**
 * Middleware to require admin role
 * Must be used after requireAuth
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // requireAuth should have already validated the user
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Check if user has admin role
    if (req.user.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Optional authentication middleware
 * Authenticates if token is provided, but doesn't require it
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies.pcd_session;
    
    if (!token) {
      // No token provided, continue without authentication
      next();
      return;
    }

    // Try to authenticate
    try {
      const user = await authService.validateSession(token);
      req.user = user;
    } catch (error) {
      // Authentication failed, but continue without user
      if (error instanceof AuthError) {
        // Clear invalid cookie
        res.clearCookie('pcd_session', {
          httpOnly: true,
          sameSite: 'strict',
          path: '/'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    // Continue without authentication on error
    next();
  }
}