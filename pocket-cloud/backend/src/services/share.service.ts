// Mock crypto module for compatibility
const crypto = {
  randomBytes: (size: number) => ({
    toString: (encoding: string) => 'mock-random-' + Math.random().toString(36).substring(2, 15)
  }),
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 15)
};

import bcrypt from 'bcryptjs';
import { db } from '../db';
import { File, Folder } from '../db/types';

export interface CreateShareRequest {
  fileId?: string;
  folderId?: string;
  expiresIn?: number; // hours
  password?: string;
  maxDownloads?: number;
}

export interface ShareInfo {
  id: string;
  token: string;
  owner_id: string;
  file_id?: string;
  folder_id?: string;
  password_hash?: string;
  expires_at?: number;
  max_downloads?: number;
  download_count: number;
  created_at: number;
  updated_at: number;
}

export interface ShareValidationResult {
  valid: boolean;
  share?: ShareInfo;
  file?: File;
  folder?: Folder;
  error?: string;
}

export interface PublicShareInfo {
  name: string;
  size?: number;
  type: string;
  isFolder: boolean;
  requiresPassword: boolean;
  expiresAt?: number;
  downloadCount?: number;
  maxDownloads?: number;
}

export class ShareService {
  private static readonly MAX_SHARES_PER_USER = 50;
  private static readonly TOKEN_LENGTH = 16; // 16 bytes = 32 hex chars

  /**
   * Create a new share
   */
  public static createShare(userId: string, request: CreateShareRequest): { success: boolean; shareUrl?: string; error?: string } {
    try {
      // Validate input
      if (!request.fileId && !request.folderId) {
        return { success: false, error: 'Either fileId or folderId must be provided' };
      }

      if (request.fileId && request.folderId) {
        return { success: false, error: 'Cannot share both file and folder in same share' };
      }

      // Check user's share limit
      const userShareCount = this.getUserShareCount(userId);
      if (userShareCount >= this.MAX_SHARES_PER_USER) {
        return { success: false, error: `Maximum ${this.MAX_SHARES_PER_USER} shares per user` };
      }

      // Verify ownership
      if (request.fileId) {
        const file = this.getFileById(request.fileId);
        if (!file || String(file.owner_id) !== String(userId) || file.is_deleted) {
          return { success: false, error: 'File not found or access denied' };
        }
      }

      if (request.folderId) {
        const folder = this.getFolderById(request.folderId);
        if (!folder || String(folder.owner_id) !== String(userId) || folder.is_deleted) {
          return { success: false, error: 'Folder not found or access denied' };
        }
      }

      // Generate cryptographically secure token
      const token = crypto.randomBytes(this.TOKEN_LENGTH).toString('hex');
      const shareId = crypto.randomUUID();

      // Calculate expiry
      let expiresAt: number | null = null;
      if (request.expiresIn && request.expiresIn > 0) {
        expiresAt = Date.now() + (request.expiresIn * 60 * 60 * 1000); // hours to ms
      }

      // Hash password if provided
      let passwordHash: string | null = null;
      if (request.password) {
        passwordHash = bcrypt.hashSync(request.password, 10);
      }

      // Insert share record
      const timestamp = Date.now();
      const insertStmt = db.prepare(`
        INSERT INTO shares (id, token, owner_id, file_id, folder_id, password_hash, expires_at, max_downloads, download_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `);

      insertStmt.run(
        shareId,
        token,
        userId,
        request.fileId || null,
        request.folderId || null,
        passwordHash,
        expiresAt,
        request.maxDownloads || null,
        timestamp,
        timestamp
      );

      const shareUrl = `http://192.168.4.1/s/${token}`;
      return { success: true, shareUrl };

    } catch (error) {
      console.error('Create share error:', error);
      return { success: false, error: 'Failed to create share' };
    }
  }

  /**
   * Validate share token and optional password
   */
  public static validateShare(token: string, password?: string): ShareValidationResult {
    try {
      // Get share by token
      const shareStmt = db.prepare('SELECT * FROM shares WHERE token = ?');
      const share = shareStmt.get(token) as ShareInfo;

      if (!share) {
        return { valid: false, error: 'Share not found' };
      }

      // Check expiry
      if (share.expires_at && Date.now() > Number(share.expires_at)) {
        return { valid: false, error: 'Share has expired' };
      }

      // Check download limit
      if (share.max_downloads && share.download_count >= Number(share.max_downloads)) {
        return { valid: false, error: 'Download limit reached' };
      }

      // Check password if required
      if (share.password_hash) {
        if (!password) {
          return { valid: false, error: 'Password required' };
        }

        // Timing-safe password comparison
        const isValidPassword = bcrypt.compareSync(password, share.password_hash);
        if (!isValidPassword) {
          return { valid: false, error: 'Invalid password' };
        }
      }

      // Get associated file or folder
      let file: File | undefined;
      let folder: Folder | undefined;

      if (share.file_id) {
        file = this.getFileById(share.file_id);
        if (!file || file.is_deleted) {
          return { valid: false, error: 'Shared file no longer exists' };
        }
      }

      if (share.folder_id) {
        folder = this.getFolderById(share.folder_id);
        if (!folder || folder.is_deleted) {
          return { valid: false, error: 'Shared folder no longer exists' };
        }
      }

      return { valid: true, share, file, folder };

    } catch (error) {
      console.error('Validate share error:', error);
      return { valid: false, error: 'Failed to validate share' };
    }
  }

  /**
   * Increment download count for a share
   */
  public static incrementDownloadCount(shareId: string): boolean {
    try {
      const updateStmt = db.prepare(`
        UPDATE shares 
        SET download_count = download_count + 1, updated_at = ?
        WHERE id = ?
      `);
      
      const result = updateStmt.run(Date.now(), shareId);
      return result.changes > 0;

    } catch (error) {
      console.error('Increment download count error:', error);
      return false;
    }
  }

  /**
   * Revoke a share
   */
  public static revokeShare(shareId: string, userId: string): boolean {
    try {
      const deleteStmt = db.prepare('DELETE FROM shares WHERE id = ? AND owner_id = ?');
      const result = deleteStmt.run(shareId, userId);
      return result.changes > 0;

    } catch (error) {
      console.error('Revoke share error:', error);
      return false;
    }
  }

  /**
   * List all active shares for a user
   */
  public static listShares(userId: string): Array<ShareInfo & { fileName?: string; folderName?: string }> {
    try {
      const stmt = db.prepare(`
        SELECT s.*, 
               f.name as fileName,
               folder.name as folderName
        FROM shares s
        LEFT JOIN files f ON s.file_id = f.id
        LEFT JOIN folders folder ON s.folder_id = folder.id
        WHERE s.owner_id = ?
        ORDER BY s.created_at DESC
      `);

      return stmt.all(userId) as Array<ShareInfo & { fileName?: string; folderName?: string }>;

    } catch (error) {
      console.error('List shares error:', error);
      return [];
    }
  }

  /**
   * Get public share info (no sensitive data)
   */
  public static getPublicShareInfo(token: string): PublicShareInfo | null {
    try {
      const validation = this.validateShare(token);
      if (!validation.valid || !validation.share) {
        return null;
      }

      const { share, file, folder } = validation;

      if (file) {
        return {
          name: file.name,
          size: file.size,
          type: file.mime_type,
          isFolder: false,
          requiresPassword: !!share.password_hash,
          expiresAt: share.expires_at || undefined,
          downloadCount: share.download_count,
          maxDownloads: share.max_downloads || undefined
        };
      }

      if (folder) {
        return {
          name: folder.name,
          type: 'folder',
          isFolder: true,
          requiresPassword: !!share.password_hash,
          expiresAt: share.expires_at || undefined,
          downloadCount: share.download_count,
          maxDownloads: share.max_downloads || undefined
        };
      }

      return null;

    } catch (error) {
      console.error('Get public share info error:', error);
      return null;
    }
  }

  /**
   * Get folder contents for shared folder
   */
  public static getSharedFolderContents(token: string, password?: string): { files: File[]; folders: Folder[] } | null {
    try {
      const validation = this.validateShare(token, password);
      if (!validation.valid || !validation.folder) {
        return null;
      }

      const folderId = validation.folder.id;

      // Get files in folder
      const filesStmt = db.prepare(`
        SELECT * FROM files 
        WHERE folder_id = ? AND is_deleted = 0
        ORDER BY name ASC
      `);
      const files = filesStmt.all(folderId) as File[];

      // Get subfolders
      const foldersStmt = db.prepare(`
        SELECT * FROM folders 
        WHERE parent_id = ? AND is_deleted = 0
        ORDER BY name ASC
      `);
      const folders = foldersStmt.all(folderId) as Folder[];

      return { files, folders };

    } catch (error) {
      console.error('Get shared folder contents error:', error);
      return null;
    }
  }

  /**
   * Clean expired shares
   */
  public static cleanExpiredShares(): number {
    try {
      const now = Date.now();
      const deleteStmt = db.prepare('DELETE FROM shares WHERE expires_at IS NOT NULL AND expires_at < ?');
      const result = deleteStmt.run(now);
      
      if (result.changes > 0) {
        console.log(`Cleaned ${result.changes} expired shares`);
      }
      
      return result.changes;

    } catch (error) {
      console.error('Clean expired shares error:', error);
      return 0;
    }
  }

  /**
   * Generate access token for password-protected shares
   */
  public static generateAccessToken(shareToken: string): string {
    const payload = {
      shareToken,
      timestamp: Date.now(),
      expires: Date.now() + (15 * 60 * 1000) // 15 minutes
    };
    
    const token = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return token;
  }

  /**
   * Validate access token for password-protected shares
   */
  public static validateAccessToken(accessToken: string, shareToken: string): boolean {
    try {
      const normalizedToken = accessToken.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(normalizedToken));
      
      return payload.shareToken === shareToken && 
             payload.expires > Date.now();

    } catch (error) {
      return false;
    }
  }

  /**
   * Get user's share count
   */
  private static getUserShareCount(userId: string): number {
    try {
      const stmt = db.prepare('SELECT COUNT(*) as count FROM shares WHERE owner_id = ?');
      const result = stmt.get(userId) as { count: number };
      return result.count;

    } catch (error) {
      console.error('Get user share count error:', error);
      return 0;
    }
  }

  /**
   * Get file by ID
   */
  private static getFileById(fileId: string): File | null {
    try {
      const stmt = db.prepare('SELECT * FROM files WHERE id = ?');
      return stmt.get(fileId) as File || null;

    } catch (error) {
      console.error('Get file by ID error:', error);
      return null;
    }
  }

  /**
   * Get folder by ID
   */
  private static getFolderById(folderId: string): Folder | null {
    try {
      const stmt = db.prepare('SELECT * FROM folders WHERE id = ?');
      return stmt.get(folderId) as Folder || null;

    } catch (error) {
      console.error('Get folder by ID error:', error);
      return null;
    }
  }
}