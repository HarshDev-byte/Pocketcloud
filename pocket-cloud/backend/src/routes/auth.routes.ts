/**
 * Authentication routes
 * Handles user login, logout, and session management with security features
 */

import { Router } from 'express';
import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthService, AuthError } from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();
const authService = new AuthService();

// Rate limiting for login attempts (5 requests per minute per IP)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per window per IP
  message: {
    success: false,
    error: 'Too many login attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/login
 * Authenticate user and set secure cookie
 */
router.post('/login', 
  loginLimiter,
  async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      // Manual validation
      if (!username || typeof username !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Username is required'
        });
      }

      if (!password || typeof password !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Password is required'
        });
      }

      const ip = req.ip || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';

      // Attempt login
      const result = await authService.login(username, password, { ip, userAgent });

      // Set HttpOnly cookie
      res.cookie('pcd_session', result.token, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        secure: false // HTTP for LAN use
      });

      res.json({
        success: true,
        user: {
          id: result.user.id,
          username: result.user.username,
          role: result.user.role
        }
      });
      return;
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  }
);

/**
 * POST /api/auth/logout
 * Clear session cookie and delete from database
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = req.cookies.pcd_session;
    
    if (token) {
      const tokenHash = authService.hashSessionToken(token);
      await authService.logout(tokenHash);
    }

    // Clear cookie
    res.clearCookie('pcd_session', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/'
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user!.id,
        username: req.user!.username,
        role: req.user!.role,
        lastLogin: req.user!.last_login_at
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // Manual validation
      if (!currentPassword || typeof currentPassword !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Current password is required'
        });
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
        return res.status(400).json({
          success: false,
          error: 'New password must be 8-128 characters'
        });
      }
      
      await authService.changePassword(req.user!.id, currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
      return;
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  }
);

export default router;