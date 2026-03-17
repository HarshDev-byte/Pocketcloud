import { db } from '../db/client';
import { Share, File as FileRecord, Folder } from '../db/types';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';
import { AppError, NotFoundError } from '../utils/errors';

interface CreateShareParams {
  fileId?: string;
  folderId?: string;
  password?: string;
  expiresInHours?: number;
  maxDownloads?: number;
  allowUpload?: boolean;
  label?: string;
}

interface ShareResult {
  share: Share;
  url: string;
}

interface ShareWithDetails extends Share {
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  folder_name?: string;
  isExpired: boolean;
  isDownloadLimitReached: boolean;
  shareUrl: string;
}

interface ShareInfo {
  name: string;
  size?: number;
  mimeType?: string;
  requiresPassword: boolean;
  expiresAt: number | null;
  downloadCount: number;
  maxDownloads: number | null;
  isFolder: boolean;
  allowUpload: boolean;
}

export class ShareService {
  private static getBaseUrl(): string {
    return process.env.PI_IP ? `http://${process.env.PI_IP}:3000` : 'http://192.168.4.1:3000';
  }

  static async createShare(userId: string, params: CreateShareParams): Promise<ShareResult> {
    // Validate parameters
    if ((!params.fileId && !params.folderId) || (params.fileId && params.folderId)) {
      throw new AppError('INVALID_PARAMS', 'Must specify either fileId or folderId, not both', 400);
    }

    // Verify ownership
    if (params.fileId) {
      const file = db.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(params.fileId, userId);
      if (!file) {
        throw new NotFoundError('File not found or access denied');
      }
    }

    if (params.folderId) {
      const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(params.folderId, userId);
      if (!folder) {
        throw new NotFoundError('Folder not found or access denied');
      }
    }

    // Check share limit (max 100 active shares per user)
    const activeShares = db.prepare(`
      SELECT COUNT(*) as count 
      FROM shares 
      WHERE owner_id = ? 
        AND (expires_at IS NULL OR expires_at > ?)
    `).get(userId, Date.now()) as { count: number };

    if (activeShares.count >= 100) {
      throw new AppError('SHARE_LIMIT', 'Maximum number of active shares reached (100)', 429);
    }

    // Generate unique token
    let token: string;
    let attempts = 0;
    do {
      token = crypto.randomBytes(16).toString('hex');
      attempts++;
      if (attempts > 10) {
        throw new AppError('TOKEN_GENERATION_FAILED', 'Failed to generate unique token', 500);
      }
    } while (db.prepare('SELECT id FROM shares WHERE token = ?').get(token));

    // Hash password if provided
    const passwordHash = params.password 
      ? await bcrypt.hash(params.password, 10)
      : null;

    // Calculate expiry
    const expiresAt = params.expiresInHours 
      ? Date.now() + params.expiresInHours * 3600 * 1000
      : null;

    // Create share record
    const shareId = uuidv4();
    const now = Date.now();

    const share: Share = {
      id: shareId,
      owner_id: userId,
      file_id: params.fileId || null,
      folder_id: params.folderId || null,
      token,
      password_hash: passwordHash,
      expires_at: expiresAt,
      max_downloads: params.maxDownloads || null,
      download_count: 0,
      allow_upload: params.allowUpload && params.folderId ? 1 : 0,
      label: params.label || null,
      created_at: now,
      last_accessed: null
    };

    db.prepare(`
      INSERT INTO shares (
        id, owner_id, file_id, folder_id, token, password_hash,
        expires_at, max_downloads, download_count, allow_upload,
        label, created_at, last_accessed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      share.id,
      share.owner_id,
      share.file_id,
      share.folder_id,
      share.token,
      share.password_hash,
      share.expires_at,
      share.max_downloads,
      share.download_count,
      share.allow_upload,
      share.label,
      share.created_at,
      share.last_accessed
    );

    const shareUrl = `${this.getBaseUrl()}/s/${token}`;

    logger.info('Share created', {
      shareId,
      userId,
      fileId: params.fileId,
      folderId: params.folderId,
      hasPassword: !!params.password,
      expiresAt
    });

    return { share, url: shareUrl };
  }

  static async validateShare(token: string, password?: string): Promise<Share> {
    // Get share by token
    const share = db.prepare('SELECT * FROM shares WHERE token = ?').get(token) as Share;
    if (!share) {
      throw new NotFoundError('Share not found');
    }

    // Check if the shared item still exists
    if (share.file_id) {
      const file = db.prepare('SELECT id FROM files WHERE id = ? AND is_deleted = 0').get(share.file_id);
      if (!file) {
        throw new NotFoundError('Shared file no longer exists');
      }
    }

    if (share.folder_id) {
      const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND is_deleted = 0').get(share.folder_id);
      if (!folder) {
        throw new NotFoundError('Shared folder no longer exists');
      }
    }

    // Check expiry
    if (share.expires_at && share.expires_at < Date.now()) {
      throw new AppError('SHARE_EXPIRED', 'This link has expired', 410);
    }

    // Check download limit
    if (share.max_downloads && share.download_count >= share.max_downloads) {
      throw new AppError('DOWNLOAD_LIMIT', 'Download limit reached', 410);
    }

    // Check password
    if (share.password_hash) {
      if (!password) {
        throw new AppError('PASSWORD_REQUIRED', 'Password required', 401);
      }
      const valid = await bcrypt.compare(password, share.password_hash);
      if (!valid) {
        throw new AppError('WRONG_PASSWORD', 'Wrong password', 401);
      }
    }

    // Update last accessed
    db.prepare('UPDATE shares SET last_accessed = ? WHERE id = ?').run(Date.now(), share.id);

    return share;
  }

  static async getShareInfo(token: string): Promise<ShareInfo> {
    const share = db.prepare('SELECT * FROM shares WHERE token = ?').get(token) as Share;
    if (!share) {
      throw new NotFoundError('Share not found');
    }

    let name: string;
    let size: number | undefined;
    let mimeType: string | undefined;

    if (share.file_id) {
      const file = db.prepare('SELECT name, size, mime_type FROM files WHERE id = ? AND is_deleted = 0').get(share.file_id) as FileRecord;
      if (!file) {
        throw new NotFoundError('Shared file no longer exists');
      }
      name = file.name;
      size = file.size;
      mimeType = file.mime_type;
    } else {
      const folder = db.prepare('SELECT name FROM folders WHERE id = ? AND is_deleted = 0').get(share.folder_id) as Folder;
      if (!folder) {
        throw new NotFoundError('Shared folder no longer exists');
      }
      name = folder.name;
    }

    return {
      name,
      size,
      mimeType,
      requiresPassword: !!share.password_hash,
      expiresAt: share.expires_at,
      downloadCount: share.download_count,
      maxDownloads: share.max_downloads,
      isFolder: !!share.folder_id,
      allowUpload: !!share.allow_upload
    };
  }

  static incrementDownloadCount(shareId: string): void {
    db.prepare('UPDATE shares SET download_count = download_count + 1 WHERE id = ?').run(shareId);
  }

  static async listShares(userId: string): Promise<ShareWithDetails[]> {
    const shares = db.prepare(`
      SELECT s.*, 
             f.name as file_name, 
             f.size as file_size, 
             f.mime_type,
             fo.name as folder_name
      FROM shares s
      LEFT JOIN files f ON s.file_id = f.id
      LEFT JOIN folders fo ON s.folder_id = fo.id
      WHERE s.owner_id = ?
      ORDER BY s.created_at DESC
    `).all(userId) as (Share & {
      file_name?: string;
      file_size?: number;
      mime_type?: string;
      folder_name?: string;
    })[];

    const baseUrl = this.getBaseUrl();
    const now = Date.now();

    return shares.map(share => ({
      ...share,
      isExpired: share.expires_at ? share.expires_at < now : false,
      isDownloadLimitReached: share.max_downloads ? share.download_count >= share.max_downloads : false,
      shareUrl: `${baseUrl}/s/${share.token}`
    }));
  }

  static async revokeShare(shareId: string, userId: string): Promise<void> {
    const result = db.prepare('DELETE FROM shares WHERE id = ? AND owner_id = ?').run(shareId, userId);
    
    if (result.changes === 0) {
      throw new NotFoundError('Share not found or access denied');
    }

    logger.info('Share revoked', { shareId, userId });
  }

  static async cleanExpiredShares(): Promise<{ deleted: number }> {
    const now = Date.now();
    const result = db.prepare('DELETE FROM shares WHERE expires_at IS NOT NULL AND expires_at < ?').run(now);
    
    logger.info('Expired shares cleaned', { deleted: result.changes });
    
    return { deleted: result.changes };
  }

  static async getShareByToken(token: string): Promise<Share | null> {
    return db.prepare('SELECT * FROM shares WHERE token = ?').get(token) as Share || null;
  }

  static async getFolderContents(folderId: string): Promise<{
    folder: Folder;
    files: FileRecord[];
    subfolders: Folder[];
  }> {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND is_deleted = 0').get(folderId) as Folder;
    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    const files = db.prepare(`
      SELECT * FROM files 
      WHERE folder_id = ? AND is_deleted = 0 
      ORDER BY name ASC
    `).all(folderId) as FileRecord[];

    const subfolders = db.prepare(`
      SELECT * FROM folders 
      WHERE parent_id = ? AND is_deleted = 0 
      ORDER BY name ASC
    `).all(folderId) as Folder[];

    return { folder, files, subfolders };
  }
}