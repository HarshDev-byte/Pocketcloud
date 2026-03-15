import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createReadStream, existsSync, statSync } from 'fs';
import { join } from 'path';
import { ShareService } from '../services/share.service';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Rate limiting for public share endpoints
const shareRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// AUTHENTICATED ROUTES (file owner)

/**
 * Create a new share
 */
router.post('/api/shares', authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { fileId, folderId, expiresInHours, password, maxDownloads } = req.body;

    const result = ShareService.createShare(userId, {
      fileId,
      folderId,
      expiresIn: expiresInHours,
      password,
      maxDownloads
    });

    if (result.success) {
      res.json({ success: true, shareUrl: result.shareUrl });
    } else {
      res.status(400).json({ error: result.error });
    }

  } catch (error) {
    console.error('Create share route error:', error);
    res.status(500).json({ error: 'Failed to create share' });
  }
});

/**
 * List user's active shares
 */
router.get('/api/shares', authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const shares = ShareService.listShares(userId);
    res.json({ shares });

  } catch (error) {
    console.error('List shares route error:', error);
    res.status(500).json({ error: 'Failed to list shares' });
  }
});

/**
 * Revoke a share
 */
router.delete('/api/shares/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const shareId = req.params.id;

    const success = ShareService.revokeShare(shareId, userId);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Share not found' });
    }

  } catch (error) {
    console.error('Revoke share route error:', error);
    res.status(500).json({ error: 'Failed to revoke share' });
  }
});
// PUBLIC ROUTES (no auth needed)

/**
 * Serve share page HTML
 */
router.get('/s/:token', shareRateLimit, (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    
    // Validate token format (32 hex chars)
    if (!/^[a-f0-9]{32}$/i.test(token)) {
      return res.status(404).send('Share not found');
    }

    const shareInfo = ShareService.getPublicShareInfo(token);
    if (!shareInfo) {
      return res.status(410).send('Share has expired or no longer exists');
    }

    // Read and serve the share page HTML
    const htmlPath = join(__dirname, '../pages/share.page.html');
    if (!existsSync(htmlPath)) {
      return res.status(500).send('Share page not found');
    }

    // Inject share data into HTML
    let html = require('fs').readFileSync(htmlPath, 'utf8');
    html = html.replace('{{SHARE_DATA}}', JSON.stringify({
      token,
      name: shareInfo.name,
      size: shareInfo.size,
      type: shareInfo.type,
      isFolder: shareInfo.isFolder,
      requiresPassword: shareInfo.requiresPassword,
      expiresAt: shareInfo.expiresAt,
      downloadCount: shareInfo.downloadCount,
      maxDownloads: shareInfo.maxDownloads
    }));

    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error) {
    console.error('Share page route error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Submit password for protected share
 */
router.post('/s/:token/auth', shareRateLimit, (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const { password } = req.body;

    const validation = ShareService.validateShare(token, password);
    
    if (validation.valid) {
      const accessToken = ShareService.generateAccessToken(token);
      res.json({ success: true, accessToken });
    } else {
      res.status(401).json({ error: validation.error || 'Invalid password' });
    }

  } catch (error) {
    console.error('Share auth route error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * Download shared file
 */
router.get('/s/:token/download', shareRateLimit, (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const accessToken = req.query.access_token as string;

    // First validate the share
    const validation = ShareService.validateShare(token);
    if (!validation.valid) {
      if (validation.error === 'Share has expired') {
        return res.status(410).json({ error: validation.error });
      }
      return res.status(404).json({ error: validation.error });
    }

    const { share, file } = validation;

    // Check if password is required and access token is valid
    if (share!.password_hash) {
      if (!accessToken || !ShareService.validateAccessToken(accessToken, token)) {
        return res.status(401).json({ error: 'Valid access token required' });
      }
    }

    // Only support file downloads for now (folder downloads would need ZIP)
    if (!file) {
      return res.status(400).json({ error: 'Folder downloads not supported yet' });
    }

    // Check if file exists on disk
    if (!existsSync(file.storage_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Increment download count
    ShareService.incrementDownloadCount(share!.id);

    // Stream the file
    const stats = statSync(file.storage_path);
    const readStream = createReadStream(file.storage_path);

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Cache-Control', 'no-cache');

    readStream.pipe(res);

  } catch (error) {
    console.error('Share download route error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

/**
 * Get share info (public metadata)
 */
router.get('/s/:token/info', shareRateLimit, (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const shareInfo = ShareService.getPublicShareInfo(token);
    
    if (!shareInfo) {
      return res.status(410).json({ error: 'Share has expired or no longer exists' });
    }

    res.json(shareInfo);

  } catch (error) {
    console.error('Share info route error:', error);
    res.status(500).json({ error: 'Failed to get share info' });
  }
});

/**
 * Get shared folder contents
 */
router.get('/s/:token/contents', shareRateLimit, (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const accessToken = req.query.access_token as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Validate share first
    const validation = ShareService.validateShare(token);
    if (!validation.valid) {
      if (validation.error === 'Share has expired') {
        return res.status(410).json({ error: validation.error });
      }
      return res.status(404).json({ error: validation.error });
    }

    const { share } = validation;

    // Check if password is required
    if (share!.password_hash) {
      if (!accessToken || !ShareService.validateAccessToken(accessToken, token)) {
        return res.status(401).json({ error: 'Valid access token required' });
      }
    }

    const contents = ShareService.getSharedFolderContents(token, accessToken ? undefined : undefined);
    if (!contents) {
      return res.status(404).json({ error: 'Folder contents not available' });
    }

    // Simple pagination
    const startIndex = (page - 1) * limit;
    const allItems = [...contents.folders, ...contents.files];
    const paginatedItems = allItems.slice(startIndex, startIndex + limit);

    res.json({
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total: allItems.length,
        hasMore: startIndex + limit < allItems.length
      }
    });

  } catch (error) {
    console.error('Share contents route error:', error);
    res.status(500).json({ error: 'Failed to get folder contents' });
  }
});

export default router;