import { db } from '../db/client';
import { logger } from '../utils/logger';
import { unlinkSync, existsSync } from 'fs';

interface ContentStore {
  checksum: string;
  storage_path: string;
  size: number;
  ref_count: number;
  created_at: number;
}

interface DedupStats {
  uniqueFiles: number;
  uniqueBytes: number;
  totalFileRecords: number;
  logicalBytes: number;
  savedBytes: number;
  deduplicationRatio: number;
}

interface OrphanScanResult {
  orphansFound: number;
  orphansCleaned: number;
  bytesFreed: number;
}

export class DedupService {
  /**
   * Find existing content by checksum
   */
  static findDuplicate(checksum: string): ContentStore | null {
    try {
      const result = db.prepare(`
        SELECT checksum, storage_path, size, ref_count, created_at 
        FROM content_store 
        WHERE checksum = ?
      `).get(checksum) as ContentStore | undefined;

      return result || null;
    } catch (error: any) {
      logger.error('Failed to find duplicate content', { 
        checksum: checksum.substring(0, 16) + '...', 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Register new content in the store
   * Handles race conditions by checking for duplicates again
   */
  static registerContent(checksum: string, storagePath: string, size: number): ContentStore {
    const transaction = db.transaction(() => {
      // Check if content was registered by another concurrent upload
      const existing = this.findDuplicate(checksum);
      if (existing) {
        // Another upload completed the same file concurrently
        this.incrementRef(checksum);
        logger.info('Content registered concurrently, incrementing ref count', {
          checksum: checksum.substring(0, 16) + '...',
          existingPath: existing.storage_path,
          newPath: storagePath
        });
        return existing;
      }

      // Register new content
      const now = Date.now();
      db.prepare(`
        INSERT INTO content_store (checksum, storage_path, size, ref_count, created_at)
        VALUES (?, ?, ?, 1, ?)
      `).run(checksum, storagePath, size, now);

      logger.info('New content registered', {
        checksum: checksum.substring(0, 16) + '...',
        storagePath,
        size
      });

      return {
        checksum,
        storage_path: storagePath,
        size,
        ref_count: 1,
        created_at: now
      };
    });

    return transaction();
  }

  /**
   * Increment reference count for existing content
   */
  static incrementRef(checksum: string): void {
    try {
      const result = db.prepare(`
        UPDATE content_store 
        SET ref_count = ref_count + 1 
        WHERE checksum = ?
      `).run(checksum);

      if (result.changes === 0) {
        logger.warn('Attempted to increment ref count for non-existent content', {
          checksum: checksum.substring(0, 16) + '...'
        });
      } else {
        logger.debug('Incremented ref count', {
          checksum: checksum.substring(0, 16) + '...'
        });
      }
    } catch (error: any) {
      logger.error('Failed to increment ref count', {
        checksum: checksum.substring(0, 16) + '...',
        error: error.message
      });
      throw error;
    }
  }
  /**
   * Decrement reference count and delete file if no more references
   */
  static decrementRef(checksum: string): { deleted: boolean; storagePath?: string } {
    const transaction = db.transaction(() => {
      // Decrement ref count
      const result = db.prepare(`
        UPDATE content_store 
        SET ref_count = ref_count - 1 
        WHERE checksum = ?
      `).run(checksum);

      if (result.changes === 0) {
        logger.warn('Attempted to decrement ref count for non-existent content', {
          checksum: checksum.substring(0, 16) + '...'
        });
        return { deleted: false };
      }

      // Check if ref count reached zero
      const updated = db.prepare(`
        SELECT ref_count, storage_path 
        FROM content_store 
        WHERE checksum = ?
      `).get(checksum) as { ref_count: number; storage_path: string } | undefined;

      if (!updated) {
        logger.warn('Content disappeared after decrement', {
          checksum: checksum.substring(0, 16) + '...'
        });
        return { deleted: false };
      }

      if (updated.ref_count <= 0) {
        // Last reference removed - safe to delete file from disk
        const storagePath = updated.storage_path;
        
        // Remove from content store
        db.prepare('DELETE FROM content_store WHERE checksum = ?').run(checksum);
        
        // Delete physical file
        try {
          if (existsSync(storagePath)) {
            unlinkSync(storagePath);
            logger.info('Deleted unreferenced file from disk', {
              checksum: checksum.substring(0, 16) + '...',
              storagePath
            });
          }
        } catch (error: any) {
          logger.error('Failed to delete file from disk', {
            checksum: checksum.substring(0, 16) + '...',
            storagePath,
            error: error.message
          });
        }

        return { deleted: true, storagePath };
      }

      logger.debug('Decremented ref count', {
        checksum: checksum.substring(0, 16) + '...',
        newRefCount: updated.ref_count
      });

      return { deleted: false };
    });

    return transaction();
  }

  /**
   * Get deduplication statistics
   */
  static getDedupStats(): DedupStats {
    try {
      // Get content store stats
      const contentStats = db.prepare(`
        SELECT 
          COUNT(*) as unique_files,
          SUM(size) as unique_bytes
        FROM content_store
      `).get() as { unique_files: number; unique_bytes: number };

      // Get file records stats
      const fileStats = db.prepare(`
        SELECT 
          COUNT(*) as total_file_records,
          SUM(size) as logical_bytes
        FROM files 
        WHERE is_deleted = 0
      `).get() as { total_file_records: number; logical_bytes: number };

      const uniqueFiles = contentStats.unique_files || 0;
      const uniqueBytes = contentStats.unique_bytes || 0;
      const totalFileRecords = fileStats.total_file_records || 0;
      const logicalBytes = fileStats.logical_bytes || 0;
      const savedBytes = Math.max(0, logicalBytes - uniqueBytes);
      const deduplicationRatio = uniqueFiles > 0 ? totalFileRecords / uniqueFiles : 1;

      return {
        uniqueFiles,
        uniqueBytes,
        totalFileRecords,
        logicalBytes,
        savedBytes,
        deduplicationRatio: Math.round(deduplicationRatio * 100) / 100
      };
    } catch (error: any) {
      logger.error('Failed to get dedup stats', { error: error.message });
      return {
        uniqueFiles: 0,
        uniqueBytes: 0,
        totalFileRecords: 0,
        logicalBytes: 0,
        savedBytes: 0,
        deduplicationRatio: 1
      };
    }
  }

  /**
   * Scan for orphaned content store entries and clean them up
   */
  static scanOrphans(): OrphanScanResult {
    const transaction = db.transaction(() => {
      // Find content store entries with no file references
      const orphans = db.prepare(`
        SELECT cs.checksum, cs.storage_path, cs.size
        FROM content_store cs
        LEFT JOIN files f ON f.content_checksum = cs.checksum AND f.is_deleted = 0
        WHERE f.content_checksum IS NULL
      `).all() as Array<{ checksum: string; storage_path: string; size: number }>;

      let bytesFreed = 0;
      let orphansCleaned = 0;

      for (const orphan of orphans) {
        try {
          // Delete from content store
          db.prepare('DELETE FROM content_store WHERE checksum = ?').run(orphan.checksum);
          
          // Delete physical file
          if (existsSync(orphan.storage_path)) {
            unlinkSync(orphan.storage_path);
            bytesFreed += orphan.size;
          }
          
          orphansCleaned++;
          
          logger.info('Cleaned up orphaned content', {
            checksum: orphan.checksum.substring(0, 16) + '...',
            storagePath: orphan.storage_path,
            size: orphan.size
          });
        } catch (error: any) {
          logger.error('Failed to clean up orphaned content', {
            checksum: orphan.checksum.substring(0, 16) + '...',
            error: error.message
          });
        }
      }

      return {
        orphansFound: orphans.length,
        orphansCleaned,
        bytesFreed
      };
    });

    return transaction();
  }

  /**
   * Get content store entry by checksum (for internal use)
   */
  static getContent(checksum: string): ContentStore | null {
    return this.findDuplicate(checksum);
  }

  /**
   * Check if content exists in store
   */
  static contentExists(checksum: string): boolean {
    try {
      const result = db.prepare(`
        SELECT 1 FROM content_store WHERE checksum = ?
      `).get(checksum);
      return !!result;
    } catch (error: any) {
      logger.error('Failed to check content existence', {
        checksum: checksum.substring(0, 16) + '...',
        error: error.message
      });
      return false;
    }
  }

  /**
   * Find existing content by checksum (alias for findDuplicate)
   */
  static findExistingContent(checksum: string): ContentStore | null {
    return this.findDuplicate(checksum);
  }

  /**
   * Create a file record pointing to existing deduplicated content
   */
  static createDedupFile(
    userId: string,
    folderId: string | null,
    filename: string,
    mimeType: string,
    checksum: string,
    existingContent: ContentStore
  ): any {
    const { v4: uuidv4 } = require('uuid');
    const fileId = uuidv4();
    const now = Date.now();

    // Increment reference count
    this.incrementRef(checksum);

    // Create file record
    db.prepare(`
      INSERT INTO files (
        id, owner_id, folder_id, name, original_name, mime_type, 
        size, storage_path, checksum, content_checksum, 
        is_deleted, created_at, updated_at, version_count, current_version, is_encrypted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, 1, 0)
    `).run(
      fileId,
      userId,
      folderId,
      filename,
      filename,
      mimeType,
      existingContent.size,
      existingContent.storage_path,
      checksum,
      checksum,
      now,
      now
    );

    logger.info('Created deduplicated file record', {
      fileId,
      filename,
      checksum: checksum.substring(0, 16) + '...',
      size: existingContent.size
    });

    // Return file record
    return db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  }
}