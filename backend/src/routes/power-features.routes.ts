import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { FavoritesService } from '../services/favorites.service';
import { CommentsService } from '../services/comments.service';
import { RecentsService } from '../services/recents.service';
import { TotpService } from '../services/totp.service';
import { GuestService } from '../services/guest.service';
import { FileLockService } from '../services/file-lock.service';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

// ============================================================================
// FAVORITES
// ============================================================================

// GET /api/favorites - List all favorites
router.get('/favorites', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const favorites = FavoritesService.listFavorites(userId);
    res.json(favorites);
  } catch (err: any) {
    logger.error('Failed to list favorites', { error: err.message });
    res.status(500).json({ error: 'LIST_FAILED', message: 'Failed to list favorites' });
  }
});

// POST /api/favorites - Add to favorites
router.post('/favorites', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileId, folderId } = req.body;
    const userId = req.user!.id;

    FavoritesService.addFavorite(userId, fileId, folderId);
    res.json({ success: true, message: 'Added to favorites' });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      logger.error('Failed to add favorite', { error: err.message });
      res.status(500).json({ error: 'ADD_FAILED', message: 'Failed to add favorite' });
    }
  }
});

// DELETE /api/favorites/:id - Remove from favorites
router.delete('/favorites/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type } = req.query;
    const userId = req.user!.id;

    if (type === 'file') {
      FavoritesService.removeFavorite(userId, id);
    } else if (type === 'folder') {
      FavoritesService.removeFavorite(userId, undefined, id);
    } else {
      res.status(400).json({ error: 'INVALID_TYPE', message: 'Type must be file or folder' });
      return;
    }

    res.json({ success: true, message: 'Removed from favorites' });
  } catch (err: any) {
    logger.error('Failed to remove favorite', { error: err.message });
    res.status(500).json({ error: 'REMOVE_FAILED', message: 'Failed to remove favorite' });
  }
});

// ============================================================================
// COMMENTS
// ============================================================================

// GET /api/files/:id/comments - List comments
router.get('/files/:id/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const comments = CommentsService.listComments(id, userId);
    res.json({ comments });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      logger.error('Failed to list comments', { error: err.message });
      res.status(500).json({ error: 'LIST_FAILED', message: 'Failed to list comments' });
    }
  }
});

// POST /api/files/:id/comments - Add comment
router.post('/files/:id/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user!.id;

    const comment = CommentsService.addComment(id, userId, content);
    res.status(201).json({ comment });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      logger.error('Failed to add comment', { error: err.message });
      res.status(500).json({ error: 'ADD_FAILED', message: 'Failed to add comment' });
    }
  }
});

// PATCH /api/comments/:id - Edit comment
router.patch('/comments/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user!.id;

    const comment = CommentsService.editComment(id, userId, content);
    res.json({ comment });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      logger.error('Failed to edit comment', { error: err.message });
      res.status(500).json({ error: 'EDIT_FAILED', message: 'Failed to edit comment' });
    }
  }
});

// DELETE /api/comments/:id - Delete comment
router.delete('/comments/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    CommentsService.deleteComment(id, userId, isAdmin);
    res.json({ success: true, message: 'Comment deleted' });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      logger.error('Failed to delete comment', { error: err.message });
      res.status(500).json({ error: 'DELETE_FAILED', message: 'Failed to delete comment' });
    }
  }
});

// ============================================================================
// RECENTS
// ============================================================================

// GET /api/files/recents - Get recently accessed files
router.get('/files/recents', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const files = RecentsService.getRecents(userId, limit);
    res.json({ files });
  } catch (err: any) {
    logger.error('Failed to get recents', { error: err.message });
    res.status(500).json({ error: 'GET_FAILED', message: 'Failed to get recent files' });
  }
});

// ============================================================================
// 2FA / TOTP
// ============================================================================

// GET /api/auth/2fa/setup - Generate 2FA setup
router.get('/auth/2fa/setup', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const setup = await TotpService.generateSetup(userId);
    res.json(setup);
  } catch (err: any) {
    logger.error('Failed to generate 2FA setup', { error: err.message });
    res.status(500).json({ error: 'SETUP_FAILED', message: 'Failed to generate 2FA setup' });
  }
});

// POST /api/auth/2fa/enable - Enable 2FA
router.post('/auth/2fa/enable', requireAuth, async (req: Request, res: Response) => {
  try {
    const { token, secret, backupCodes } = req.body;
    const userId = req.user!.id;

    if (!token || !secret || !backupCodes) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'Token, secret, and backup codes required' });
      return;
    }

    const valid = TotpService.verifyAndEnable(userId, token, secret);
    
    if (!valid) {
      res.status(400).json({ error: 'INVALID_TOKEN', message: 'Invalid verification token' });
      return;
    }

    TotpService.saveConfig(userId, secret, backupCodes);
    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (err: any) {
    logger.error('Failed to enable 2FA', { error: err.message });
    res.status(500).json({ error: 'ENABLE_FAILED', message: 'Failed to enable 2FA' });
  }
});

// POST /api/auth/2fa/verify - Verify TOTP for login
router.post('/auth/2fa/verify', async (req: Request, res: Response) => {
  try {
    const { pendingUserId, totpToken } = req.body;

    if (!pendingUserId || !totpToken) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'Pending user ID and TOTP token required' });
      return;
    }

    const valid = TotpService.verifyTotp(pendingUserId, totpToken);
    
    if (!valid) {
      res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid TOTP token' });
      return;
    }

    // Create session
    const { AuthService } = require('../services/auth.service');
    const session = await AuthService.createSessionForUser(pendingUserId, req.ip || 'unknown');
    
    res.cookie('pcd_session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, user: session.user });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      logger.error('Failed to verify 2FA', { error: err.message });
      res.status(500).json({ error: 'VERIFY_FAILED', message: 'Failed to verify 2FA' });
    }
  }
});

// DELETE /api/auth/2fa - Disable 2FA
router.delete('/auth/2fa', requireAuth, async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const userId = req.user!.id;

    if (!password) {
      res.status(400).json({ error: 'MISSING_PASSWORD', message: 'Password required to disable 2FA' });
      return;
    }

    TotpService.disable2fa(userId, password);
    res.json({ success: true, message: '2FA disabled successfully' });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      logger.error('Failed to disable 2FA', { error: err.message });
      res.status(500).json({ error: 'DISABLE_FAILED', message: 'Failed to disable 2FA' });
    }
  }
});

// ============================================================================
// GUEST ACCOUNTS (Admin only)
// ============================================================================

// POST /api/admin/guests - Create guest account
router.post('/admin/guests', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { guestName, expiresInDays } = req.body;
    const adminUserId = req.user!.id;

    if (!guestName) {
      res.status(400).json({ error: 'MISSING_NAME', message: 'Guest name required' });
      return;
    }

    const result = GuestService.createGuestAccount(adminUserId, guestName, expiresInDays);
    res.status(201).json(result);
  } catch (err: any) {
    logger.error('Failed to create guest', { error: err.message });
    res.status(500).json({ error: 'CREATE_FAILED', message: 'Failed to create guest account' });
  }
});

// GET /api/admin/guests - List guest accounts
router.get('/admin/guests', requireAdmin, async (req: Request, res: Response) => {
  try {
    const guests = GuestService.listGuestAccounts();
    res.json({ guests });
  } catch (err: any) {
    logger.error('Failed to list guests', { error: err.message });
    res.status(500).json({ error: 'LIST_FAILED', message: 'Failed to list guest accounts' });
  }
});

// DELETE /api/admin/guests/:id - Remove guest account
router.delete('/admin/guests/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    GuestService.removeGuestAccount(id);
    res.json({ success: true, message: 'Guest account removed' });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      logger.error('Failed to remove guest', { error: err.message });
      res.status(500).json({ error: 'REMOVE_FAILED', message: 'Failed to remove guest account' });
    }
  }
});

// ============================================================================
// FILE LOCKING
// ============================================================================

// POST /api/files/:id/lock - Lock a file
router.post('/files/:id/lock', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, expiresInMinutes } = req.body;
    const userId = req.user!.id;

    const lock = FileLockService.lockFile(id, userId, reason, expiresInMinutes);
    res.json({ lock });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      logger.error('Failed to lock file', { error: err.message });
      res.status(500).json({ error: 'LOCK_FAILED', message: 'Failed to lock file' });
    }
  }
});

// DELETE /api/files/:id/lock - Unlock a file
router.delete('/files/:id/lock', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    FileLockService.unlockFile(id, userId, isAdmin);
    res.json({ success: true, message: 'File unlocked' });
  } catch (err: any) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
    } else {
      logger.error('Failed to unlock file', { error: err.message });
      res.status(500).json({ error: 'UNLOCK_FAILED', message: 'Failed to unlock file' });
    }
  }
});

// GET /api/files/:id/lock - Get lock status
router.get('/files/:id/lock', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lock = FileLockService.getLockStatus(id);
    res.json({ lock });
  } catch (err: any) {
    logger.error('Failed to get lock status', { error: err.message });
    res.status(500).json({ error: 'GET_FAILED', message: 'Failed to get lock status' });
  }
});

export default router;
