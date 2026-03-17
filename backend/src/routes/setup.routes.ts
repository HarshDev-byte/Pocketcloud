import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

const router = Router();

// POST /api/setup/admin - Create initial admin user
router.post('/admin', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      throw new ValidationError('Username is required');
    }
    
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    
    // Check if any users already exist
    const existingUsers = await AuthService.getUserCount();
    if (existingUsers > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SETUP_ALREADY_COMPLETE',
          message: 'Setup has already been completed'
        }
      });
    }
    
    const user = await AuthService.createInitialAdmin(username.trim(), password);
    
    res.json({
      success: true,
      message: 'Admin user created successfully',
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
    
  } catch (error: any) {
    logger.error('Setup admin failed', { error: error.message });
    throw error;
  }
});

// POST /api/setup/complete - Mark setup as complete
router.post('/complete', async (req: Request, res: Response) => {
  try {
    // Check if at least one user exists
    const userCount = await AuthService.getUserCount();
    if (userCount === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_ADMIN_USER',
          message: 'Admin user must be created first'
        }
      });
    }
    
    // Setup is considered complete when admin user exists
    res.json({
      success: true,
      message: 'Setup completed successfully'
    });
    
  } catch (error: any) {
    logger.error('Setup complete failed', { error: error.message });
    throw error;
  }
});

// GET /api/setup/status - Check setup status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userCount = await AuthService.getUserCount();
    const isComplete = userCount > 0;
    
    res.json({
      success: true,
      setupComplete: isComplete,
      hasUsers: userCount > 0
    });
    
  } catch (error: any) {
    logger.error('Setup status check failed', { error: error.message });
    throw error;
  }
});

export default router;