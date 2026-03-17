import { db } from '../db/client';
import { File as FileRecord, Folder } from '../db/types';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import * as fs from 'fs';

import { Response } from 'express';

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

interface FolderContents {
  folders: Folder[];
  files: FileRecord[];
  breadcrumb: BreadcrumbItem[];
}

interface StorageStats {
  fileCount: number;
  usedBytes: number;
  totalDiskBytes: number;
  freeDiskBytes: number;
  breakdown: {
    images: number;
    videos: number;
    audio: number;
    documents: number;
    other: number;
  };
}

interface TrashContents {
  files: FileRecord[];
  folders: Folder[];
}

export class FileService {
  private static sanitizeName(name: string): string {
    // Remove invalid characters and limit length
    const sanitized = name
      .replace(/[/\\:*?"<>|\x00-\x1f]/g, '')
      .trim()
      .substring(0, 255);
    
    if (!sanitized) {
      throw new ValidationError('Name cannot be empty after sanitization');
    }
    
    return sanitized;
  }

  static async listFolder(userId: string, folderId?: string): Promise<FolderContents> {
    let folder: Folder | null = null;
    
    // If folderId provided, verify it exists and is owned by user
    if (folderId) {
      folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(folderId, userId) as Folder;
      if (!folder) {
        throw new NotFoundError('Folder not found');
      }
    }

    // Query folders in this directory
    const folders = db.prepare(`
      SELECT * FROM folders 
      WHERE owner_id = ? AND parent_id IS ? AND is_deleted = 0 
      ORDER BY name ASC
    `).all(userId, folderId || null) as Folder[];

    // Query files in this directory
    const files = db.prepare(`
      SELECT * FROM files 
      WHERE owner_id = ? AND folder_id IS ? AND is_deleted = 0 
      ORDER BY name ASC
    `).all(userId, folderId || null) as FileRecord[];

    // Build breadcrumb path
    const breadcrumb: BreadcrumbItem[] = [{ id: null, name: 'Home' }];
    
    if (folder) {
      const pathItems: BreadcrumbItem[] = [];
      let currentFolder: Folder | null = folder;
      
      // Walk up the parent chain
      while (currentFolder) {
        pathItems.unshift({ id: currentFolder.id, name: currentFolder.name });
        
        if (currentFolder.parent_id) {
          currentFolder = db.prepare('SELECT * FROM folders WHERE id = ?').get(currentFolder.parent_id) as Folder;
        } else {
          currentFolder = null;
        }
      }
      
      breadcrumb.push(...pathItems);
    }

    return { folders, files, breadcrumb };
  }

  static async getFile(fileId: string, userId: string): Promise<FileRecord> {
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND is_deleted = 0').get(fileId) as FileRecord;
    
    if (!file) {
      throw new NotFoundError('File not found');
    }
    
    if (file.owner_id !== userId) {
      throw new ForbiddenError('Access denied');
    }
    
    return file;
  }

  static async streamFile(fileId: string, userId: string, res: Response, rangeHeader?: string): Promise<void> {
    const file = await this.getFile(fileId, userId);
    
    // Verify file exists on disk
    if (!fs.existsSync(file.storage_path)) {
      throw new NotFoundError('File not found on disk');
    }

    const stat = fs.statSync(file.storage_path);
    const fileSize = stat.size;

    if (rangeHeader) {
      // Handle range requests (for video seeking, resume downloads)
      const range = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(range[0], 10) || 0;
      const end = parseInt(range[1], 10) || fileSize - 1;
      const chunkSize = end - start + 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).set({
          'Content-Range': `bytes */${fileSize}`
        });
        return;
      }

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': file.mime_type,
      });

      const stream = fs.createReadStream(file.storage_path, { start, end });
      stream.pipe(res);
      
      stream.on('error', (error) => {
        logger.error('Stream error during range download', { fileId, error: error.message });
        res.destroy();
      });
    } else {
      // Full file download
      res.writeHead(200, {
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
        'Content-Type': file.mime_type,
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
      });

      const stream = fs.createReadStream(file.storage_path);
      stream.pipe(res);
      
      stream.on('error', (error) => {
        logger.error('Stream error during download', { fileId, error: error.message });
        res.destroy();
      });
    }

    logger.info('File download started', {
      fileId,
      userId,
      filename: file.name,
      size: fileSize,
      range: rangeHeader || 'full'
    });
  }

  static async getFileStream(fileId: string, userId: string): Promise<fs.ReadStream> {
    const file = await this.getFile(fileId, userId);
    
    // Verify file exists on disk
    if (!fs.existsSync(file.storage_path)) {
      throw new NotFoundError('File not found on disk');
    }

    return fs.createReadStream(file.storage_path);
  }

  static async createFolder(userId: string, name: string, parentId?: string): Promise<Folder> {
    const sanitizedName = this.sanitizeName(name);
    let path = `/${sanitizedName}`;
    
    // If parentId provided, verify parent exists and build path
    if (parentId) {
      const parent = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(parentId, userId) as Folder;
      if (!parent) {
        throw new NotFoundError('Parent folder not found');
      }
      path = `${parent.path}/${sanitizedName}`;
    }

    // Check for duplicate name in same parent
    const existing = db.prepare(`
      SELECT id FROM folders 
      WHERE owner_id = ? AND parent_id IS ? AND name = ? AND is_deleted = 0
    `).get(userId, parentId || null, sanitizedName);
    
    if (existing) {
      throw new ConflictError('Folder already exists');
    }

    // Create folder
    const folderId = require('uuid').v4();
    const now = Date.now();
    
    db.prepare(`
      INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(folderId, userId, parentId || null, sanitizedName, path, now, now);

    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId) as Folder;
    
    logger.info('Folder created', { folderId, userId, name: sanitizedName, parentId });
    
    // Emit real-time event
    setImmediate(() => {
      try {
        const { RealtimeService, WS_EVENTS } = require('./realtime.service');
        RealtimeService.sendToUser(userId, WS_EVENTS.FOLDER_CREATED, {
          folder: folder
        });
      } catch (error: any) {
        logger.warn('Failed to emit folder created event', { 
          folderId, 
          error: error.message 
        });
      }
    });
    
    return folder;
  }

  static async renameFile(fileId: string, userId: string, newName: string): Promise<FileRecord> {
    const sanitizedName = this.sanitizeName(newName);
    const file = await this.getFile(fileId, userId);

    // Check for duplicate name in same folder
    const existing = db.prepare(`
      SELECT id FROM files 
      WHERE owner_id = ? AND folder_id IS ? AND name = ? AND is_deleted = 0 AND id != ?
    `).get(userId, file.folder_id, sanitizedName, fileId);
    
    if (existing) {
      throw new ConflictError('File with this name already exists');
    }

    // Update file name
    const now = Date.now();
    db.prepare('UPDATE files SET name = ?, updated_at = ? WHERE id = ?').run(sanitizedName, now, fileId);

    const updatedFile = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as FileRecord;
    
    logger.info('File renamed', { fileId, userId, oldName: file.name, newName: sanitizedName });
    
    // Emit real-time event
    setImmediate(() => {
      try {
        const { RealtimeService, WS_EVENTS } = require('./realtime.service');
        RealtimeService.sendToUser(userId, WS_EVENTS.FILE_UPDATED, {
          fileId,
          changes: { name: sanitizedName },
          folderId: file.folder_id
        });
      } catch (error: any) {
        logger.warn('Failed to emit file renamed event', { 
          fileId, 
          error: error.message 
        });
      }
    });

    // Record sync event
    if (file.folder_id) {
      setImmediate(() => {
        try {
          const { SyncService } = require('./sync.service');
          SyncService.recordSyncEvent(file.folder_id!, 'modified', fileId, file.name, sanitizedName);
        } catch (error: any) {
          logger.warn('Failed to record sync event', { fileId, error: error.message });
        }
      });
    }
    
    return updatedFile;
  }

  static async renameFolder(folderId: string, userId: string, newName: string): Promise<Folder> {
    const sanitizedName = this.sanitizeName(newName);
    
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(folderId, userId) as Folder;
    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    // Check for duplicate name in same parent
    const existing = db.prepare(`
      SELECT id FROM folders 
      WHERE owner_id = ? AND parent_id IS ? AND name = ? AND is_deleted = 0 AND id != ?
    `).get(userId, folder.parent_id, sanitizedName, folderId);
    
    if (existing) {
      throw new ConflictError('Folder with this name already exists');
    }

    // Update folder name and path
    const now = Date.now();
    const oldPath = folder.path;
    const newPath = folder.parent_id 
      ? folder.path.replace(/\/[^/]+$/, `/${sanitizedName}`)
      : `/${sanitizedName}`;

    // Update this folder and all descendant paths in a transaction
    db.transaction(() => {
      // Update the folder itself
      db.prepare('UPDATE folders SET name = ?, path = ?, updated_at = ? WHERE id = ?').run(sanitizedName, newPath, now, folderId);
      
      // Update all descendant folder paths
      db.prepare(`
        UPDATE folders 
        SET path = REPLACE(path, ?, ?), updated_at = ?
        WHERE path LIKE ? AND owner_id = ?
      `).run(oldPath, newPath, now, `${oldPath}/%`, userId);
    })();

    const updatedFolder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId) as Folder;
    
    logger.info('Folder renamed', { folderId, userId, oldName: folder.name, newName: sanitizedName });
    
    return updatedFolder;
  }

  static async moveFile(fileId: string, userId: string, targetFolderId?: string): Promise<FileRecord> {
    const file = await this.getFile(fileId, userId);

    // If targetFolderId provided, verify target folder exists
    if (targetFolderId) {
      const targetFolder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(targetFolderId, userId);
      if (!targetFolder) {
        throw new NotFoundError('Target folder not found');
      }
    }

    // Check for duplicate name in target folder
    const existing = db.prepare(`
      SELECT id FROM files 
      WHERE owner_id = ? AND folder_id IS ? AND name = ? AND is_deleted = 0 AND id != ?
    `).get(userId, targetFolderId || null, file.name, fileId);
    
    if (existing) {
      throw new ConflictError('File with this name already exists in target folder');
    }

    // Move file
    const now = Date.now();
    db.prepare('UPDATE files SET folder_id = ?, updated_at = ? WHERE id = ?').run(targetFolderId || null, now, fileId);

    const updatedFile = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as FileRecord;
    
    logger.info('File moved', { fileId, userId, targetFolderId });
    
    // Emit real-time event
    setImmediate(() => {
      try {
        const { RealtimeService, WS_EVENTS } = require('./realtime.service');
        RealtimeService.sendToUser(userId, WS_EVENTS.FILE_MOVED, {
          fileId,
          oldFolderId: file.folder_id,
          newFolderId: targetFolderId,
          file: updatedFile
        });
      } catch (error: any) {
        logger.warn('Failed to emit file moved event', { 
          fileId, 
          error: error.message 
        });
      }
    });

    // Record sync events (delete from old, create in new)
    setImmediate(() => {
      try {
        const { SyncService } = require('./sync.service');
        if (file.folder_id) {
          SyncService.recordSyncEvent(file.folder_id, 'deleted', fileId);
        }
        if (targetFolderId) {
          SyncService.recordSyncEvent(targetFolderId, 'created', fileId);
        }
      } catch (error: any) {
        logger.warn('Failed to record sync events', { fileId, error: error.message });
      }
    });
    
    return updatedFile;
  }

  static async softDeleteFile(fileId: string, userId: string): Promise<void> {
    const file = await this.getFile(fileId, userId);

    const now = Date.now();
    db.prepare('UPDATE files SET is_deleted = 1, deleted_at = ? WHERE id = ?').run(now, fileId);

    logger.info('File soft deleted', { fileId, userId, filename: file.name });
  }

  static async softDeleteFolder(folderId: string, userId: string): Promise<void> {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(folderId, userId) as Folder;
    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    const now = Date.now();

    // Use transaction to recursively delete folder and all contents
    db.transaction(() => {
      // Find all descendant folders using recursive CTE
      const descendantFolders = db.prepare(`
        WITH RECURSIVE subtree(id) AS (
          SELECT id FROM folders WHERE id = ?
          UNION ALL
          SELECT f.id FROM folders f 
          JOIN subtree s ON f.parent_id = s.id
          WHERE f.owner_id = ?
        )
        SELECT id FROM subtree
      `).all(folderId, userId) as { id: string }[];

      const folderIds = descendantFolders.map(f => f.id);

      // Soft delete all files in these folders
      for (const id of folderIds) {
        db.prepare('UPDATE files SET is_deleted = 1, deleted_at = ? WHERE folder_id = ? AND owner_id = ?').run(now, id, userId);
      }

      // Soft delete all folders
      for (const id of folderIds) {
        db.prepare('UPDATE folders SET is_deleted = 1, deleted_at = ? WHERE id = ?').run(now, id);
      }
    })();

    logger.info('Folder soft deleted recursively', { folderId, userId, folderName: folder.name });
  }

  static async getStorageStats(userId: string): Promise<StorageStats> {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as file_count,
        SUM(size) as total_size,
        SUM(CASE WHEN mime_type LIKE 'image/%' THEN size ELSE 0 END) as images_size,
        SUM(CASE WHEN mime_type LIKE 'video/%' THEN size ELSE 0 END) as videos_size,
        SUM(CASE WHEN mime_type LIKE 'audio/%' THEN size ELSE 0 END) as audio_size,
        SUM(CASE WHEN mime_type LIKE 'application/pdf' OR mime_type LIKE 'application/msword' OR mime_type LIKE 'application/vnd.openxmlformats-officedocument%' THEN size ELSE 0 END) as docs_size
      FROM files 
      WHERE owner_id = ? AND is_deleted = 0
    `).get(userId) as any;

    // Get disk stats
    const storagePath = process.env.STORAGE_PATH!;
    let totalDiskBytes = 0;
    let freeDiskBytes = 0;

    try {
      const { execSync } = require('child_process');
      const dfOutput = execSync(`df -B1 ${storagePath}`, { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        totalDiskBytes = parseInt(parts[1]) || 0;
        freeDiskBytes = parseInt(parts[3]) || 0;
      }
    } catch (error) {
      logger.error('Failed to get disk stats', { error });
    }

    const usedBytes = stats.total_size || 0;
    const otherSize = usedBytes - (stats.images_size + stats.videos_size + stats.audio_size + stats.docs_size);

    return {
      fileCount: stats.file_count || 0,
      usedBytes,
      totalDiskBytes,
      freeDiskBytes,
      breakdown: {
        images: stats.images_size || 0,
        videos: stats.videos_size || 0,
        audio: stats.audio_size || 0,
        documents: stats.docs_size || 0,
        other: Math.max(0, otherSize)
      }
    };
  }

  static async listTrash(userId: string): Promise<TrashContents> {
    const files = db.prepare(`
      SELECT * FROM files 
      WHERE owner_id = ? AND is_deleted = 1 
      ORDER BY deleted_at DESC
    `).all(userId) as FileRecord[];

    const folders = db.prepare(`
      SELECT * FROM folders 
      WHERE owner_id = ? AND is_deleted = 1 
      ORDER BY deleted_at DESC
    `).all(userId) as Folder[];

    return { files, folders };
  }

  static async restoreFile(fileId: string, userId: string): Promise<void> {
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 1').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found in trash');
    }

    // If parent folder is also deleted, restore to root
    let targetFolderId = file.folder_id;
    if (targetFolderId) {
      const parentFolder = db.prepare('SELECT is_deleted FROM folders WHERE id = ?').get(targetFolderId) as { is_deleted: number };
      if (parentFolder && parentFolder.is_deleted === 1) {
        targetFolderId = null;
      }
    }

    db.prepare('UPDATE files SET is_deleted = 0, deleted_at = null, folder_id = ? WHERE id = ?').run(targetFolderId, fileId);

    logger.info('File restored from trash', { fileId, userId });
  }

  static async permanentDeleteFile(fileId: string, userId: string): Promise<void> {
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Delete from database and filesystem in transaction
    db.transaction(() => {
      db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
      
      // Remove from disk (ignore errors if file doesn't exist)
      try {
        if (fs.existsSync(file.storage_path)) {
          fs.unlinkSync(file.storage_path);
        }
      } catch (error) {
        logger.warn('Failed to delete file from disk', { fileId, path: file.storage_path, error });
      }
    })();

    logger.info('File permanently deleted', { fileId, userId, filename: file.name });
  }

  // Get photo files for gallery
  static async getPhotoFiles(userId: string): Promise<FileRecord[]> {
    const photos = db.prepare(`
      SELECT * FROM files 
      WHERE owner_id = ? 
        AND is_deleted = 0 
        AND mime_type LIKE 'image/%'
      ORDER BY 
        CASE WHEN exif_date IS NOT NULL THEN exif_date ELSE created_at END DESC
      LIMIT 1000
    `).all(userId) as FileRecord[];

    return photos;
  }

  // Get recently accessed files
  static async getRecentFiles(userId: string, limit: number = 50): Promise<FileRecord[]> {
    // For now, return recently created files since we don't track access times yet
    const recentFiles = db.prepare(`
      SELECT * FROM files 
      WHERE owner_id = ? 
        AND is_deleted = 0
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(userId, limit) as FileRecord[];

    return recentFiles;
  }

  // Get shares for a specific file
  static async getFileShares(fileId: string, userId: string): Promise<any[]> {
    // First verify the user owns the file
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId);
    if (!file) {
      throw new NotFoundError('File not found');
    }

    const shares = db.prepare(`
      SELECT id, token, expires_at, max_downloads, download_count, 
             (password_hash IS NOT NULL) as has_password, created_at
      FROM shares 
      WHERE file_id = ? AND owner_id = ?
      ORDER BY created_at DESC
    `).all(fileId, userId);

    return shares;
  }

  // Create share for a specific file
  static async createFileShare(fileId: string, userId: string, options: any): Promise<any> {
    // First verify the user owns the file
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId);
    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Import ShareService to create the share
    const { ShareService } = await import('./share.service');
    
    const shareParams = {
      fileId,
      password: options.password,
      expiresInHours: options.expires_in ? this.parseExpiryToHours(options.expires_in) : undefined,
      maxDownloads: options.max_downloads,
      label: options.label
    };

    return await ShareService.createShare(userId, shareParams);
  }

  private static parseExpiryToHours(expiryString: string): number | undefined {
    if (!expiryString || expiryString === 'never') return undefined;
    
    if (expiryString.endsWith('h')) {
      return parseInt(expiryString.slice(0, -1));
    } else if (expiryString.endsWith('d')) {
      return parseInt(expiryString.slice(0, -1)) * 24;
    }
    
    return undefined;
  }
}