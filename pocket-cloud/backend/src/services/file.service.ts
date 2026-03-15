import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { getDatabase } from '../db/client.js';
import { File, Folder, CreateFileData, CreateFolderData } from '../db/types.js';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface BreadcrumbItem {
  id: number;
  name: string;
  path: string;
}

export interface FolderContents {
  folders: Folder[];
  files: File[];
  path: BreadcrumbItem[];
}

export interface StorageStats {
  total: number;
  used: number;
  free: number;
  fileCount: number;
  breakdown: {
    images: number;
    videos: number;
    docs: number;
    other: number;
  };
}

class FileService {
  private readonly STORAGE_PATH = process.env.STORAGE_PATH || '/opt/pocketcloud/storage';
  private get db() { return getDatabase(); }

  /**
   * List folder contents with breadcrumb path
   * Returns { folders: Folder[], files: File[], path: BreadcrumbItem[] }
   * Excludes is_deleted items
   * Sorts: folders first, then files, both alphabetical
   */
  async listFolder(userId: number, folderId?: string): Promise<FolderContents> {
    try {
      let parentId: number | null = null;
      let breadcrumbs: BreadcrumbItem[] = [];

      // If folderId provided, validate it exists and user owns it
      if (folderId) {
        const folder = await this.getFolder(parseInt(folderId), userId);
        parentId = folder.id;
        
        // Build breadcrumb path
        breadcrumbs = await this.buildBreadcrumbs(folder);
      }

      // Get folders in this directory
      const folders = this.db.prepare(`
        SELECT * FROM folders 
        WHERE owner_id = ? AND parent_folder_id ${parentId ? '= ?' : 'IS NULL'} AND is_deleted = 0
        ORDER BY name ASC
      `).all(parentId ? [userId, parentId] : [userId]) as Folder[];

      // Get files in this directory
      const files = this.db.prepare(`
        SELECT * FROM files 
        WHERE owner_id = ? AND parent_folder_id ${parentId ? '= ?' : 'IS NULL'} AND is_deleted = 0
        ORDER BY name ASC
      `).all(parentId ? [userId, parentId] : [userId]) as File[];

      return {
        folders,
        files,
        path: breadcrumbs
      };
    } catch (error: any) {
      throw new Error(`Failed to list folder: ${error.message}`);
    }
  }

  /**
   * Get file metadata with ownership check
   * Checks ownership (or admin). Throws NotFoundError or ForbiddenError.
   */
  async getFile(fileId: number, userId: number): Promise<File> {
    try {
      const file = this.db.prepare(`
        SELECT * FROM files WHERE id = ? AND is_deleted = 0
      `).get([fileId]) as File | undefined;

      if (!file) {
        throw new NotFoundError('File not found');
      }

      // Check ownership or admin access
      const user = this.db.prepare('SELECT role FROM users WHERE id = ?').get([userId]) as { role: string } | undefined;
      if (file.owner_id !== userId && user?.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      return file;
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new Error(`Failed to get file: ${error.message}`);
    }
  }

  /**
   * Stream file download with Range support for video seeking
   * Streams file to response using createReadStream
   * Sets headers: Content-Type, Content-Disposition, Content-Length
   * Supports Range header: returns 206 Partial Content for video seeking
   * Never loads entire file into memory
   */
  async downloadFile(fileId: number, userId: number, res: Response, rangeHeader?: string): Promise<void> {
    try {
      const file = await this.getFile(fileId, userId);
      const filePath = path.join(this.STORAGE_PATH, file.path);

      // Check if file exists on disk
      try {
        await fs.access(filePath);
      } catch {
        throw new NotFoundError('File not found on disk');
      }

      const stat = await fs.stat(filePath);
      const fileSize = stat.size;

      // Set basic headers
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
      res.setHeader('Accept-Ranges', 'bytes');

      // Handle Range requests for video seeking
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0] || '0', 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;

        if (start >= fileSize || end >= fileSize) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
          res.end();
          return;
        }

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunkSize.toString());

        const stream = createReadStream(filePath, { start, end });
        stream.pipe(res);
      } else {
        // Full file download
        res.setHeader('Content-Length', fileSize.toString());
        const stream = createReadStream(filePath);
        stream.pipe(res);
      }
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  /**
   * Create new folder
   * Validates name (no path separators, max 255 chars)
   * Checks no duplicate name in same parent
   * Generates materialized path: parent.path + '/' + name
   */
  async createFolder(userId: number, name: string, parentId?: number): Promise<Folder> {
    try {
      // Validate folder name
      if (!name || name.length > 255) {
        throw new ValidationError('Folder name must be 1-255 characters');
      }
      if (name.includes('/') || name.includes('\\')) {
        throw new ValidationError('Folder name cannot contain path separators');
      }
      if (name === '.' || name === '..') {
        throw new ValidationError('Invalid folder name');
      }

      let parentFolder: Folder | null = null;
      let folderPath = name;

      // If parent specified, validate it
      if (parentId) {
        parentFolder = await this.getFolder(parentId, userId);
        folderPath = `${parentFolder.path}/${name}`;
      }

      // Check for duplicate name in same parent
      const existing = this.db.prepare(`
        SELECT id FROM folders 
        WHERE owner_id = ? AND parent_folder_id ${parentId ? '= ?' : 'IS NULL'} 
        AND name = ? AND is_deleted = 0
      `).get(parentId ? [userId, parentId, name] : [userId, name]);

      if (existing) {
        throw new ValidationError('Folder with this name already exists');
      }

      // Create folder
      const uuid = randomUUID();
      const now = Date.now();
      const fullPath = path.join(this.STORAGE_PATH, folderPath);

      // Create directory on disk
      await fs.mkdir(fullPath, { recursive: true });

      // Insert into database
      const folderData: CreateFolderData = {
        uuid,
        name,
        path: folderPath,
        full_path: fullPath,
        owner_id: userId,
        parent_folder_id: parentId || null
      };

      const result = this.db.prepare(`
        INSERT INTO folders (uuid, name, path, full_path, owner_id, parent_folder_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run([
        folderData.uuid,
        folderData.name,
        folderData.path,
        folderData.full_path,
        folderData.owner_id,
        folderData.parent_folder_id,
        now,
        now
      ]);

      const folder = this.db.prepare('SELECT * FROM folders WHERE id = ?').get([result.lastInsertRowid]) as Folder;
      return folder;
    } catch (error: any) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  }

  /**
   * Rename file
   * Validates new name, checks for duplicates in same folder
   */
  async renameFile(fileId: number, userId: number, newName: string): Promise<File> {
    try {
      // Validate new name
      if (!newName || newName.length > 255) {
        throw new ValidationError('File name must be 1-255 characters');
      }
      if (newName.includes('/') || newName.includes('\\')) {
        throw new ValidationError('File name cannot contain path separators');
      }

      const file = await this.getFile(fileId, userId);

      // Check for duplicate name in same folder
      const existing = this.db.prepare(`
        SELECT id FROM files 
        WHERE owner_id = ? AND parent_folder_id ${file.parent_folder_id ? '= ?' : 'IS NULL'} 
        AND name = ? AND id != ? AND is_deleted = 0
      `).get(file.parent_folder_id ? 
        [userId, file.parent_folder_id, newName, fileId] : 
        [userId, newName, fileId]
      );

      if (existing) {
        throw new ValidationError('File with this name already exists');
      }

      // Update database
      const now = Date.now();
      this.db.prepare(`
        UPDATE files SET name = ?, updated_at = ? WHERE id = ?
      `).run([newName, now, fileId]);

      const updatedFile = this.db.prepare('SELECT * FROM files WHERE id = ?').get([fileId]) as File;
      return updatedFile;
    } catch (error: any) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new Error(`Failed to rename file: ${error.message}`);
    }
  }

  /**
   * Rename folder
   * Validates new name, checks for duplicates in same parent
   */
  async renameFolder(folderId: number, userId: number, newName: string): Promise<Folder> {
    try {
      // Validate new name
      if (!newName || newName.length > 255) {
        throw new ValidationError('Folder name must be 1-255 characters');
      }
      if (newName.includes('/') || newName.includes('\\')) {
        throw new ValidationError('Folder name cannot contain path separators');
      }
      if (newName === '.' || newName === '..') {
        throw new ValidationError('Invalid folder name');
      }

      const folder = await this.getFolder(folderId, userId);

      // Check for duplicate name in same parent
      const existing = this.db.prepare(`
        SELECT id FROM folders 
        WHERE owner_id = ? AND parent_folder_id ${folder.parent_folder_id ? '= ?' : 'IS NULL'} 
        AND name = ? AND id != ? AND is_deleted = 0
      `).get(folder.parent_folder_id ? 
        [userId, folder.parent_folder_id, newName, folderId] : 
        [userId, newName, folderId]
      );

      if (existing) {
        throw new ValidationError('Folder with this name already exists');
      }

      // Update database
      const now = Date.now();
      this.db.prepare(`
        UPDATE folders SET name = ?, updated_at = ? WHERE id = ?
      `).run([newName, now, folderId]);

      const updatedFolder = this.db.prepare('SELECT * FROM folders WHERE id = ?').get([folderId]) as Folder;
      return updatedFolder;
    } catch (error: any) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new Error(`Failed to rename folder: ${error.message}`);
    }
  }

  /**
   * Move file to different folder
   * Updates folder_id, checks target folder exists and owned by user
   */
  async moveFile(fileId: number, userId: number, targetFolderId?: number): Promise<File> {
    try {
      // Validate target folder if specified
      if (targetFolderId) {
        await this.getFolder(targetFolderId, userId);
      }

      // Update database
      const now = Date.now();
      this.db.prepare(`
        UPDATE files SET parent_folder_id = ?, updated_at = ? WHERE id = ?
      `).run([targetFolderId || null, now, fileId]);

      const updatedFile = this.db.prepare('SELECT * FROM files WHERE id = ?').get([fileId]) as File;
      return updatedFile;
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new Error(`Failed to move file: ${error.message}`);
    }
  }

  /**
   * Move folder and update all descendant paths
   * Updates parent_id and materialized paths for folder + all descendants
   */
  async moveFolder(folderId: number, userId: number, targetParentId?: number): Promise<Folder> {
    try {
      const folder = await this.getFolder(folderId, userId);

      // Validate target parent if specified
      let targetParent: Folder | null = null;
      if (targetParentId) {
        targetParent = await this.getFolder(targetParentId, userId);
        
        // Prevent moving folder into itself or its descendants
        if (await this.isDescendantOf(targetParentId, folderId)) {
          throw new ValidationError('Cannot move folder into itself or its descendants');
        }
      }

      // Calculate new path
      const newPath = targetParent ? `${targetParent.path}/${folder.name}` : folder.name;

      // Update folder and all descendants in transaction
      const transaction = this.db.transaction(() => {
        // Update the folder itself
        const now = Date.now();
        this.db.prepare(`
          UPDATE folders SET parent_folder_id = ?, path = ?, updated_at = ? WHERE id = ?
        `).run([targetParentId || null, newPath, now, folderId]);

        // Update all descendant folders
        this.updateDescendantPaths(folder.path, newPath);
      });

      transaction();

      const updatedFolder = this.db.prepare('SELECT * FROM folders WHERE id = ?').get([folderId]) as Folder;
      return updatedFolder;
    } catch (error: any) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new Error(`Failed to move folder: ${error.message}`);
    }
  }

  /**
   * Copy file (creates new file on disk and in database)
   * Copies file on disk (fs.copyFile) + creates new DB record
   * New file gets: new UUID, same name, timestamp = now
   */
  async copyFile(fileId: number, userId: number, targetFolderId?: number): Promise<File> {
    try {
      const originalFile = await this.getFile(fileId, userId);

      // Validate target folder if specified
      if (targetFolderId) {
        await this.getFolder(targetFolderId, userId);
      }

      // Generate new UUID and paths
      const newUuid = randomUUID();
      const now = Date.now();
      
      // Create new file path
      let newPath: string;
      if (targetFolderId) {
        const targetFolder = await this.getFolder(targetFolderId, userId);
        newPath = `${targetFolder.path}/${newUuid}_${originalFile.name}`;
      } else {
        newPath = `${newUuid}_${originalFile.name}`;
      }

      const newFullPath = path.join(this.STORAGE_PATH, newPath);
      const originalFullPath = path.join(this.STORAGE_PATH, originalFile.path);

      // Copy file on disk
      await fs.copyFile(originalFullPath, newFullPath);

      // Create new database record
      const fileData: CreateFileData = {
        uuid: newUuid,
        name: originalFile.name,
        path: newPath,
        full_path: newFullPath,
        mime_type: originalFile.mime_type || 'application/octet-stream',
        size: originalFile.size,
        checksum: originalFile.checksum || '',
        owner_id: userId,
        parent_folder_id: targetFolderId || null,
        is_encrypted: originalFile.is_encrypted,
        metadata: originalFile.metadata || ''
      };

      const result = this.db.prepare(`
        INSERT INTO files (uuid, name, path, full_path, mime_type, size, checksum, owner_id, 
                          parent_folder_id, is_encrypted, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run([
        fileData.uuid,
        fileData.name,
        fileData.path,
        fileData.full_path,
        fileData.mime_type,
        fileData.size,
        fileData.checksum,
        fileData.owner_id,
        fileData.parent_folder_id,
        fileData.is_encrypted,
        fileData.metadata,
        now,
        now
      ]);

      const newFile = this.db.prepare('SELECT * FROM files WHERE id = ?').get([result.lastInsertRowid]) as File;
      return newFile;
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }

  /**
   * Soft delete file
   * Sets is_deleted=1, deleted_at=now
   */
  async softDeleteFile(fileId: number, userId: number): Promise<void> {
    try {
      await this.getFile(fileId, userId);

      const now = Date.now();
      this.db.prepare(`
        UPDATE files SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?
      `).run([now, now, fileId]);
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Soft delete folder and all children recursively
   * Recursively soft-deletes folder + all children (files + subfolders)
   */
  async softDeleteFolder(folderId: number, userId: number): Promise<void> {
    try {
      const folder = await this.getFolder(folderId, userId);

      const now = Date.now();
      
      // Delete in transaction to ensure consistency
      const transaction = this.db.transaction(() => {
        // Recursively delete all descendant folders
        this.recursiveDeleteFolder(folderId, now);
        
        // Delete all files in this folder and descendants
        this.db.prepare(`
          UPDATE files SET is_deleted = 1, deleted_at = ?, updated_at = ?
          WHERE owner_id = ? AND (
            parent_folder_id = ? OR 
            parent_folder_id IN (
              SELECT id FROM folders WHERE path LIKE ? AND owner_id = ?
            )
          )
        `).run([now, now, userId, folderId, `${folder.path}/%`, userId]);
      });

      transaction();
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new Error(`Failed to delete folder: ${error.message}`);
    }
  }

  /**
   * Get storage statistics for user
   * Returns { total: number, used: number, free: number, fileCount: number, breakdown: { images, videos, docs, other } }
   */
  async getStorageStats(userId: number): Promise<StorageStats> {
    try {
      // Get total storage space (simplified - in production use statvfs)
      const totalSpace = 32 * 1024 * 1024 * 1024; // 32GB default
      
      // Get user's file statistics
      const userStats = this.db.prepare(`
        SELECT 
          COUNT(*) as fileCount,
          COALESCE(SUM(size), 0) as totalSize
        FROM files 
        WHERE owner_id = ? AND is_deleted = 0
      `).get([userId]) as { fileCount: number; totalSize: number };

      // Get breakdown by file type
      const breakdown = {
        images: 0,
        videos: 0,
        docs: 0,
        other: 0
      };

      const typeStats = this.db.prepare(`
        SELECT mime_type, COALESCE(SUM(size), 0) as size
        FROM files 
        WHERE owner_id = ? AND is_deleted = 0 AND mime_type IS NOT NULL
        GROUP BY mime_type
      `).all([userId]) as { mime_type: string; size: number }[];

      typeStats.forEach(({ mime_type, size }) => {
        if (mime_type.startsWith('image/')) {
          breakdown.images += size;
        } else if (mime_type.startsWith('video/')) {
          breakdown.videos += size;
        } else if (mime_type.includes('pdf') || mime_type.includes('document') || 
                   mime_type.includes('text') || mime_type.includes('office')) {
          breakdown.docs += size;
        } else {
          breakdown.other += size;
        }
      });

      return {
        total: totalSpace,
        used: userStats.totalSize,
        free: totalSpace - userStats.totalSize,
        fileCount: userStats.fileCount,
        breakdown
      };
    } catch (error: any) {
      throw new Error(`Failed to get storage stats: ${error.message}`);
    }
  }

  // Helper methods

  private async getFolder(folderId: number, userId: number): Promise<Folder> {
    const folder = this.db.prepare(`
      SELECT * FROM folders WHERE id = ? AND is_deleted = 0
    `).get([folderId]) as Folder | undefined;

    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    // Check ownership or admin access
    const user = this.db.prepare('SELECT role FROM users WHERE id = ?').get([userId]) as { role: string } | undefined;
    if (folder.owner_id !== userId && user?.role !== 'admin') {
      throw new ForbiddenError('Access denied');
    }

    return folder;
  }

  private async buildBreadcrumbs(folder: Folder): Promise<BreadcrumbItem[]> {
    const breadcrumbs: BreadcrumbItem[] = [];
    let currentFolder: Folder | null = folder;

    while (currentFolder) {
      breadcrumbs.unshift({
        id: currentFolder.id,
        name: currentFolder.name,
        path: currentFolder.path
      });

      if (currentFolder.parent_folder_id) {
        currentFolder = this.db.prepare(`
          SELECT * FROM folders WHERE id = ? AND is_deleted = 0
        `).get([currentFolder.parent_folder_id]) as Folder | undefined || null;
      } else {
        currentFolder = null;
      }
    }

    return breadcrumbs;
  }

  private async isDescendantOf(potentialDescendant: number, ancestor: number): Promise<boolean> {
    const descendant = this.db.prepare(`
      SELECT parent_folder_id FROM folders WHERE id = ? AND is_deleted = 0
    `).get([potentialDescendant]) as { parent_folder_id: number | null } | undefined;

    if (!descendant || !descendant.parent_folder_id) {
      return false;
    }

    if (descendant.parent_folder_id === ancestor) {
      return true;
    }

    return this.isDescendantOf(descendant.parent_folder_id, ancestor);
  }

  private updateDescendantPaths(oldPath: string, newPath: string): void {
    // Get all descendant folders
    const descendants = this.db.prepare(`
      SELECT id, path FROM folders 
      WHERE path LIKE ? AND is_deleted = 0
    `).all([`${oldPath}/%`]) as { id: number; path: string }[];

    // Update each descendant's path
    descendants.forEach(({ id, path: currentPath }) => {
      const newDescendantPath = currentPath.replace(oldPath, newPath);
      this.db.prepare(`
        UPDATE folders SET path = ?, updated_at = ? WHERE id = ?
      `).run([newDescendantPath, Date.now(), id]);
    });
  }

  private recursiveDeleteFolder(folderId: number, deletedAt: number): void {
    // Get all child folders
    const childFolders = this.db.prepare(`
      SELECT id FROM folders WHERE parent_folder_id = ? AND is_deleted = 0
    `).all([folderId]) as { id: number }[];

    // Recursively delete children first
    childFolders.forEach(({ id }) => {
      this.recursiveDeleteFolder(id, deletedAt);
    });

    // Delete this folder
    this.db.prepare(`
      UPDATE folders SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?
    `).run([deletedAt, deletedAt, folderId]);
  }
}

export const fileService = new FileService();