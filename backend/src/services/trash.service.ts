import { db } from '../db/client';
import { File as FileRecord, Folder } from '../db/types';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { DedupService } from './dedup.service';
import * as fs from 'fs';
import * as path from 'path';

interface TrashItem {
  item_type: 'file' | 'folder';
  id: string;
  owner_id: string;
  name: string;
  mime_type: string;
  size: number;
  parent_id: string | null;
  deleted_at: number;
  purge_at: number;
  days_until_purge: number;
}

interface TrashListOptions {
  sortBy?: 'deleted_at' | 'name' | 'size';
  limit?: number;
  offset?: number;
}

interface TrashListResult {
  items: TrashItem[];
  totalCount: number;
  totalSize: number;
  oldestItem: number | null;
}

interface TrashStats {
  itemCount: number;
  totalSize: number;
  daysUntilNextPurge: number | null;
}

interface RestoreResult {
  item: FileRecord | Folder;
  restoredToRoot: boolean;
}

interface EmptyTrashResult {
  filesDeleted: number;
  foldersDeleted: number;
  bytesFreed: number;
}

interface PurgeResult {
  filesDeleted: number;
  foldersDeleted: number;
  bytesFreed: number;
  uploadsCleaned: number;
}

export class TrashService {
  static async softDeleteFile(fileId: string, userId: string): Promise<void> {
    // Get file and verify ownership
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found');
    }

    // If already deleted, return silently (idempotent)
    if (file.is_deleted === 1) {
      return;
    }

    const now = Date.now();
    db.prepare('UPDATE files SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
      .run(now, now, fileId, userId);

    logger.info('File soft deleted', { fileId, userId, filename: file.name });
    
    // Emit real-time event
    setImmediate(() => {
      try {
        const { RealtimeService, WS_EVENTS } = require('./realtime.service');
        RealtimeService.sendToUser(userId, WS_EVENTS.FILE_DELETED, {
          fileId,
          folderId: file.folder_id,
          filename: file.name
        });
        
        // Send storage update (debounced)
        RealtimeService.sendStorageUpdate(userId);
      } catch (error: any) {
        logger.warn('Failed to emit file deleted event', { 
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
          SyncService.recordSyncEvent(file.folder_id!, 'deleted', fileId);
        } catch (error: any) {
          logger.warn('Failed to record sync event', { fileId, error: error.message });
        }
      });
    }
  }

  static async softDeleteFolder(folderId: string, userId: string): Promise<void> {
    // Verify folder exists and is owned by user
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ?').get(folderId, userId) as Folder;
    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    // If already deleted, return silently (idempotent)
    if (folder.is_deleted === 1) {
      return;
    }

    const now = Date.now();

    // Use transaction for atomic operation
    db.transaction(() => {
      // Step 1: Find all descendant folder IDs using recursive CTE
      const allFolderIds = db.prepare(`
        WITH RECURSIVE subtree(id) AS (
          SELECT id FROM folders WHERE id = ? AND owner_id = ?
          UNION ALL
          SELECT f.id FROM folders f
          INNER JOIN subtree s ON f.parent_id = s.id
        )
        SELECT id FROM subtree
      `).all(folderId, userId) as { id: string }[];

      const folderIds = allFolderIds.map(r => r.id);

      // Step 2: Soft delete all files in those folders
      if (folderIds.length > 0) {
        const placeholders = folderIds.map(() => '?').join(',');
        db.prepare(`
          UPDATE files 
          SET is_deleted = 1, deleted_at = ?, updated_at = ? 
          WHERE folder_id IN (${placeholders}) AND owner_id = ? AND is_deleted = 0
        `).run(now, now, ...folderIds, userId);

        // Step 3: Soft delete all folders
        db.prepare(`
          UPDATE folders 
          SET is_deleted = 1, deleted_at = ?, updated_at = ? 
          WHERE id IN (${placeholders}) AND owner_id = ?
        `).run(now, now, ...folderIds, userId);
      }
    })();

    logger.info('Folder soft deleted recursively', { folderId, userId, folderName: folder.name });
  }

  static async listTrash(userId: string, options: TrashListOptions = {}): Promise<TrashListResult> {
    const { sortBy = 'deleted_at', limit = 50, offset = 0 } = options;

    // Validate sort column
    const validSortColumns = ['deleted_at', 'name', 'size'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'deleted_at';
    const sortOrder = sortBy === 'deleted_at' ? 'DESC' : 'ASC';

    // Get paginated items
    const items = db.prepare(`
      SELECT * FROM trash_items 
      WHERE owner_id = ? 
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset) as TrashItem[];

    // Get total count and stats
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN item_type = 'file' THEN size ELSE 0 END) as total_size,
        MIN(deleted_at) as oldest_item
      FROM trash_items 
      WHERE owner_id = ?
    `).get(userId) as { total_count: number; total_size: number; oldest_item: number | null };

    return {
      items,
      totalCount: stats.total_count || 0,
      totalSize: stats.total_size || 0,
      oldestItem: stats.oldest_item
    };
  }

  static async getTrashStats(userId: string): Promise<TrashStats> {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as item_count,
        SUM(CASE WHEN item_type = 'file' THEN size ELSE 0 END) as total_size,
        MIN(days_until_purge) as days_until_next_purge
      FROM trash_items 
      WHERE owner_id = ?
    `).get(userId) as { item_count: number; total_size: number; days_until_next_purge: number | null };

    return {
      itemCount: stats.item_count || 0,
      totalSize: stats.total_size || 0,
      daysUntilNextPurge: stats.days_until_next_purge
    };
  }

  static async restoreFile(fileId: string, userId: string): Promise<RestoreResult> {
    // Get file (include deleted ones)
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 1').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found in trash');
    }

    // Check if parent folder still exists and is not deleted
    let targetFolderId = file.folder_id;
    let restoredToRoot = false;

    if (file.folder_id) {
      const parentOk = db.prepare('SELECT id FROM folders WHERE id = ? AND is_deleted = 0').get(file.folder_id);
      if (!parentOk) {
        targetFolderId = null;
        restoredToRoot = true;
      }
    }

    // Restore file
    const now = Date.now();
    db.prepare(`
      UPDATE files 
      SET is_deleted = 0, deleted_at = null, folder_id = ?, updated_at = ? 
      WHERE id = ?
    `).run(targetFolderId, now, fileId);

    const restoredFile = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as FileRecord;

    logger.info('File restored from trash', { 
      fileId, 
      userId, 
      filename: file.name, 
      restoredToRoot 
    });

    // Emit real-time event
    setImmediate(() => {
      try {
        const { RealtimeService, WS_EVENTS } = require('./realtime.service');
        RealtimeService.sendToUser(userId, WS_EVENTS.FILE_RESTORED, {
          fileId,
          folderId: targetFolderId,
          restoredToRoot,
          file: restoredFile
        });
        
        // Send storage update (debounced)
        RealtimeService.sendStorageUpdate(userId);
      } catch (error: any) {
        logger.warn('Failed to emit file restored event', { 
          fileId, 
          error: error.message 
        });
      }
    });

    return {
      item: restoredFile,
      restoredToRoot
    };
  }

  static async restoreFolder(folderId: string, userId: string): Promise<RestoreResult> {
    // Get folder (include deleted ones)
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 1').get(folderId, userId) as Folder;
    if (!folder) {
      throw new NotFoundError('Folder not found in trash');
    }

    // Check if parent folder still exists and is not deleted
    let targetParentId = folder.parent_id;
    let restoredToRoot = false;

    if (folder.parent_id) {
      const parentOk = db.prepare('SELECT id FROM folders WHERE id = ? AND is_deleted = 0').get(folder.parent_id);
      if (!parentOk) {
        targetParentId = null;
        restoredToRoot = true;
      }
    }

    const now = Date.now();

    // Find all descendant folders and files to restore
    db.transaction(() => {
      // Get all descendant folder IDs
      const allFolderIds = db.prepare(`
        WITH RECURSIVE subtree(id) AS (
          SELECT id FROM folders WHERE id = ? AND owner_id = ?
          UNION ALL
          SELECT f.id FROM folders f
          INNER JOIN subtree s ON f.parent_id = s.id
        )
        SELECT id FROM subtree
      `).all(folderId, userId) as { id: string }[];

      const folderIds = allFolderIds.map(r => r.id);

      if (folderIds.length > 0) {
        const placeholders = folderIds.map(() => '?').join(',');

        // Restore all descendant folders
        db.prepare(`
          UPDATE folders 
          SET is_deleted = 0, deleted_at = null, updated_at = ? 
          WHERE id IN (${placeholders}) AND owner_id = ?
        `).run(now, ...folderIds, userId);

        // Restore all files in those folders
        db.prepare(`
          UPDATE files 
          SET is_deleted = 0, deleted_at = null, updated_at = ? 
          WHERE folder_id IN (${placeholders}) AND owner_id = ?
        `).run(now, ...folderIds, userId);

        // Update top folder's parent_id (null if parent was also deleted)
        db.prepare(`
          UPDATE folders 
          SET parent_id = ? 
          WHERE id = ?
        `).run(targetParentId, folderId);
      }
    })();

    const restoredFolder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId) as Folder;

    logger.info('Folder restored from trash', { 
      folderId, 
      userId, 
      folderName: folder.name, 
      restoredToRoot 
    });

    return {
      item: restoredFolder,
      restoredToRoot
    };
  }

  static async permanentDeleteFile(fileId: string, userId: string): Promise<number> {
    // Get file (include deleted ones)
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found');
    }

    let bytesFreed = file.size;

    // Delete from database and handle deduplication in transaction
    const { deleted: contentDeleted, storagePath } = db.transaction(() => {
      // Delete file record
      db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
      
      // Handle deduplication - decrement ref count and potentially delete content
      if (file.content_checksum) {
        return DedupService.decrementRef(file.content_checksum);
      } else {
        // Legacy file without content_checksum - delete directly
        return { deleted: true, storagePath: file.storage_path };
      }
    })();

    // If content was deleted (last reference), remove thumbnails and HLS files
    if (contentDeleted && storagePath) {
      // Delete thumbnail if exists
      const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || '/mnt/pocketcloud/thumbnails';
      const thumbPath = path.join(THUMBNAIL_DIR, `${fileId}.webp`);
      try {
        if (fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath);
        }
      } catch (error) {
        // Ignore thumbnail deletion errors
      }

      // Delete HLS files if they exist
      const HLS_DIR = process.env.HLS_DIR || '/mnt/pocketcloud/hls';
      const hlsDir = path.join(HLS_DIR, fileId);
      try {
        if (fs.existsSync(hlsDir)) {
          fs.rmSync(hlsDir, { recursive: true, force: true });
        }
      } catch (error) {
        // Ignore HLS deletion errors
      }

      logger.info('File permanently deleted with content removal', { 
        fileId, 
        userId, 
        filename: file.name, 
        bytesFreed,
        contentChecksum: file.content_checksum?.substring(0, 16) + '...'
      });
    } else {
      logger.info('File permanently deleted (content still referenced)', { 
        fileId, 
        userId, 
        filename: file.name, 
        bytesFreed: 0, // No actual bytes freed since content is still used
        contentChecksum: file.content_checksum?.substring(0, 16) + '...'
      });
      
      // No bytes actually freed since content is still referenced by other files
      bytesFreed = 0;
    }

    return bytesFreed;
  }

  static async permanentDeleteFolder(folderId: string, userId: string): Promise<number> {
    // Get folder (include deleted ones)
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ?').get(folderId, userId) as Folder;
    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    // Get all descendant file IDs and storage paths
    const descendantFiles = db.prepare(`
      WITH RECURSIVE subtree(id) AS (
        SELECT id FROM folders WHERE id = ? AND owner_id = ?
        UNION ALL
        SELECT f.id FROM folders f
        INNER JOIN subtree s ON f.parent_id = s.id
      )
      SELECT f.id, f.storage_path, f.size
      FROM files f
      INNER JOIN subtree s ON f.folder_id = s.id
    `).all(folderId, userId) as { id: string; storage_path: string; size: number }[];

    const totalBytesFreed = descendantFiles.reduce((sum, file) => sum + file.size, 0);

    // Delete from database in transaction
    db.transaction(() => {
      // Get all folder IDs to delete
      const allFolderIds = db.prepare(`
        WITH RECURSIVE subtree(id) AS (
          SELECT id FROM folders WHERE id = ? AND owner_id = ?
          UNION ALL
          SELECT f.id FROM folders f
          INNER JOIN subtree s ON f.parent_id = s.id
        )
        SELECT id FROM subtree
      `).all(folderId, userId) as { id: string }[];

      const folderIds = allFolderIds.map(r => r.id);

      if (folderIds.length > 0) {
        const placeholders = folderIds.map(() => '?').join(',');

        // Delete all files in subtree
        db.prepare(`DELETE FROM files WHERE folder_id IN (${placeholders})`).run(...folderIds);

        // Delete all folders in subtree
        db.prepare(`DELETE FROM folders WHERE id IN (${placeholders})`).run(...folderIds);
      }
    })();

    // Delete each file from disk (outside transaction - disk ops are not atomic)
    for (const file of descendantFiles) {
      try {
        if (fs.existsSync(file.storage_path)) {
          fs.unlinkSync(file.storage_path);
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          logger.warn('Failed to delete file from disk during folder deletion', { 
            fileId: file.id, 
            path: file.storage_path, 
            error: error.message 
          });
        }
      }

      // Also try to delete thumbnail
      const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || '/mnt/pocketcloud/thumbnails';
      const thumbPath = path.join(THUMBNAIL_DIR, `${file.id}.webp`);
      try {
        if (fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath);
        }
      } catch (error) {
        // Ignore thumbnail deletion errors
      }
    }

    logger.info('Folder permanently deleted', { 
      folderId, 
      userId, 
      folderName: folder.name, 
      filesDeleted: descendantFiles.length,
      bytesFreed: totalBytesFreed 
    });

    return totalBytesFreed;
  }

  static async emptyTrash(userId: string): Promise<EmptyTrashResult> {
    // Get all trash items for user
    const trashFiles = db.prepare('SELECT id, storage_path, size FROM files WHERE owner_id = ? AND is_deleted = 1').all(userId) as { id: string; storage_path: string; size: number }[];
    const trashFolders = db.prepare('SELECT id FROM folders WHERE owner_id = ? AND is_deleted = 1').all(userId) as { id: string }[];

    const totalBytesFreed = trashFiles.reduce((sum, file) => sum + file.size, 0);

    // Delete from database in transaction
    db.transaction(() => {
      db.prepare('DELETE FROM files WHERE owner_id = ? AND is_deleted = 1').run(userId);
      db.prepare('DELETE FROM folders WHERE owner_id = ? AND is_deleted = 1').run(userId);
    })();

    // Delete each file from disk
    for (const file of trashFiles) {
      try {
        if (fs.existsSync(file.storage_path)) {
          fs.unlinkSync(file.storage_path);
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          logger.warn('Failed to delete file from disk during empty trash', { 
            fileId: file.id, 
            path: file.storage_path, 
            error: error.message 
          });
        }
      }

      // Also try to delete thumbnail
      const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || '/mnt/pocketcloud/thumbnails';
      const thumbPath = path.join(THUMBNAIL_DIR, `${file.id}.webp`);
      try {
        if (fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath);
        }
      } catch (error) {
        // Ignore thumbnail deletion errors
      }
    }

    logger.info('Trash emptied', { 
      userId, 
      filesDeleted: trashFiles.length, 
      foldersDeleted: trashFolders.length, 
      bytesFreed: totalBytesFreed 
    });

    return {
      filesDeleted: trashFiles.length,
      foldersDeleted: trashFolders.length,
      bytesFreed: totalBytesFreed
    };
  }

  static async purgeExpiredItems(): Promise<PurgeResult> {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    // Find expired files
    const expiredFiles = db.prepare(`
      SELECT id, storage_path, size 
      FROM files 
      WHERE is_deleted = 1 AND deleted_at < ? AND storage_path IS NOT NULL
    `).all(thirtyDaysAgo) as { id: string; storage_path: string; size: number }[];

    // Find expired folders
    const expiredFolders = db.prepare(`
      SELECT id 
      FROM folders 
      WHERE is_deleted = 1 AND deleted_at < ?
    `).all(thirtyDaysAgo) as { id: string }[];

    const totalBytesFreed = expiredFiles.reduce((sum, file) => sum + file.size, 0);

    // Delete from database
    db.transaction(() => {
      db.prepare('DELETE FROM files WHERE is_deleted = 1 AND deleted_at < ?').run(thirtyDaysAgo);
      db.prepare('DELETE FROM folders WHERE is_deleted = 1 AND deleted_at < ?').run(thirtyDaysAgo);
    })();

    // Delete each file from disk
    for (const file of expiredFiles) {
      try {
        if (fs.existsSync(file.storage_path)) {
          fs.unlinkSync(file.storage_path);
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          logger.warn('Failed to delete expired file from disk', { 
            fileId: file.id, 
            path: file.storage_path, 
            error: error.message 
          });
        }
      }

      // Also try to delete thumbnail
      const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || '/mnt/pocketcloud/thumbnails';
      const thumbPath = path.join(THUMBNAIL_DIR, `${file.id}.webp`);
      try {
        if (fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath);
        }
      } catch (error) {
        // Ignore thumbnail deletion errors
      }
    }

    // Also purge expired upload sessions
    const expiredUploads = db.prepare('DELETE FROM upload_sessions WHERE expires_at < ?').run(Date.now());

    logger.info('Expired items purged', { 
      filesDeleted: expiredFiles.length, 
      foldersDeleted: expiredFolders.length, 
      bytesFreed: totalBytesFreed,
      uploadsCleaned: expiredUploads.changes
    });

    return {
      filesDeleted: expiredFiles.length,
      foldersDeleted: expiredFolders.length,
      bytesFreed: totalBytesFreed,
      uploadsCleaned: expiredUploads.changes
    };
  }

  // Restore all items from trash
  static async restoreAll(userId: string): Promise<{ restored: number; failed: number }> {
    const trashItems = db.prepare(`
      SELECT id, 'file' as type FROM files WHERE owner_id = ? AND is_deleted = 1
      UNION ALL
      SELECT id, 'folder' as type FROM folders WHERE owner_id = ? AND is_deleted = 1
    `).all(userId, userId) as Array<{ id: string; type: 'file' | 'folder' }>;

    let restored = 0;
    let failed = 0;

    for (const item of trashItems) {
      try {
        if (item.type === 'file') {
          await this.restoreFile(item.id, userId);
        } else {
          await this.restoreFolder(item.id, userId);
        }
        restored++;
      } catch (error) {
        logger.warn('Failed to restore item during restore all', { 
          itemId: item.id, 
          type: item.type, 
          error: (error as Error).message 
        });
        failed++;
      }
    }

    logger.info('Restore all completed', { userId, restored, failed });
    return { restored, failed };
  }
}