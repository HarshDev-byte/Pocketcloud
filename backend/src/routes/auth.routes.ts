import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { logAuthFailure, logAuthSuccess, logLogout } from '../middleware/activity.middleware';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

const router = Router();

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 attempts per minute per IP
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login - User login
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || typeof username !== 'string') {
      throw new ValidationError('Username is required');
    }

    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required');
    }

    // Attempt login
    const result = await AuthService.login(username, password, {
      ip: req.ip || 'unknown',
      userAgent: req.get('User-Agent')
    });

    // Set secure HTTP-only cookie
    res.cookie('pcd_session', result.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false, // false because we're on HTTP (LAN only)
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    // Log successful login
    logAuthSuccess(req, result.user.id, result.user.username);

    res.json({
      success: true,
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role
      }
    });

  } catch (error: any) {
    // Log failed login attempt
    logAuthFailure(req, req.body.username);

    logger.error('Login failed', {
      username: req.body.username,
      ip: req.ip || 'unknown',
      error: error.message
    });

    if (error.code === 'AUTH_FAILED') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        }
      });
    }

    throw error;
  }
});

// POST /api/auth/logout - User logout
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.pcd_session;
    
    if (token) {
      await AuthService.logout(token);
    }

    // Log logout
    logLogout(req, req.user!.id, req.user!.username);

    // Clear cookie
    res.clearCookie('pcd_session', {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      path: '/'
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error: any) {
    logger.error('Logout failed', { error: error.message });
    throw error;
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error: any) {
    logger.error('Get user info failed', { error: error.message });
    throw error;
  }
});

// POST /api/auth/change-password - Change user password
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || typeof currentPassword !== 'string') {
      throw new ValidationError('Current password is required');
    }

    if (!newPassword || typeof newPassword !== 'string') {
      throw new ValidationError('New password is required');
    }

    await AuthService.changePassword(req.user!.id, currentPassword, newPassword);

    // Clear cookie since all sessions are invalidated
    res.clearCookie('pcd_session', {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      path: '/'
    });

    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again.'
    });

  } catch (error: any) {
    logger.error('Change password failed', {
      userId: req.user?.id,
      error: error.message
    });
    throw error;
  }
});

export default router;