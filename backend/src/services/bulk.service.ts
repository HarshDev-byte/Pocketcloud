import { db } from '../db/client';
import { BulkJob, Tag, File as FileRecord } from '../db/types';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { FileService } from './file.service';
import { TrashService } from './trash.service';

const MAX_BULK_ITEMS = 500;
const BATCH_SIZE = 50; // Process in batches for Pi memory management

interface BulkItem {
  id: string;
  type: 'file' | 'folder';
}

interface BulkError {
  itemId: string;
  error: string;
}

interface BulkResult {
  jobId: string;
  message: string;
}

interface BulkStats {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  errors: BulkError[];
}

interface TagResult {
  tagged: number;
  untagged: number;
}

export class BulkService {
  /**
   * Create a bulk job record
   */
  private static createBulkJob(
    userId: string, 
    operation: BulkJob['operation'], 
    total: number
  ): BulkJob {
    const jobId = uuidv4();
    const now = Date.now();
    
    const job: BulkJob = {
      id: jobId,
      user_id: userId,
      operation,
      status: 'running',
      total,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: '[]',
      created_at: now,
      completed_at: null
    };

    db.prepare(`
      INSERT INTO bulk_jobs (
        id, user_id, operation, status, total, processed, 
        succeeded, failed, errors, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id, job.user_id, job.operation, job.status, job.total,
      job.processed, job.succeeded, job.failed, job.errors,
      job.created_at, job.completed_at
    );

    return job;
  }

  /**
   * Update bulk job progress
   */
  private static updateBulkJob(
    jobId: string, 
    processed: number, 
    succeeded: number, 
    failed: number, 
    errors: BulkError[]
  ): void {
    db.prepare(`
      UPDATE bulk_jobs 
      SET processed = ?, succeeded = ?, failed = ?, errors = ?
      WHERE id = ?
    `).run(processed, succeeded, failed, JSON.stringify(errors), jobId);
  }

  /**
   * Complete bulk job
   */
  private static completeBulkJob(jobId: string, status: 'complete' | 'failed'): void {
    db.prepare(`
      UPDATE bulk_jobs 
      SET status = ?, completed_at = ?
      WHERE id = ?
    `).run(status, Date.now(), jobId);
  }

  /**
   * Emit progress via WebSocket
   */
  private static emitProgress(userId: string, job: BulkJob, errors: BulkError[]): void {
    try {
      const { RealtimeService } = require('./realtime.service');
      
      RealtimeService.sendToUser(userId, 'bulk:progress', {
        jobId: job.id,
        operation: job.operation,
        processed: job.processed,
        total: job.total,
        succeeded: job.succeeded,
        failed: job.failed,
        errors: errors.slice(-10) // Only send last 10 errors to avoid large payloads
      });
    } catch (error: any) {
      logger.warn('Failed to emit bulk progress', { 
        jobId: job.id, 
        error: error.message 
      });
    }
  }

  /**
   * Emit completion via WebSocket
   */
  private static emitComplete(userId: string, jobId: string, stats: BulkStats): void {
    try {
      const { RealtimeService } = require('./realtime.service');
      
      RealtimeService.sendToUser(userId, 'bulk:complete', {
        jobId,
        ...stats
      });
    } catch (error: any) {
      logger.warn('Failed to emit bulk completion', { 
        jobId, 
        error: error.message 
      });
    }
  }

  /**
   * Validate bulk items ownership
   */
  private static validateItemsOwnership(userId: string, items: BulkItem[]): void {
    for (const item of items) {
      if (item.type === 'file') {
        const file = db.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ?').get(item.id, userId);
        if (!file) {
          throw new NotFoundError(`File ${item.id} not found or not owned by user`);
        }
      } else if (item.type === 'folder') {
        const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ?').get(item.id, userId);
        if (!folder) {
          throw new NotFoundError(`Folder ${item.id} not found or not owned by user`);
        }
      }
    }
  }

  /**
   * Chunk array into smaller batches
   */
  private static chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Bulk move files and folders
   */
  static async bulkMove(userId: string, items: BulkItem[], targetFolderId: string | null): Promise<BulkResult> {
    // Validate input
    if (items.length > MAX_BULK_ITEMS) {
      throw new ValidationError(`Maximum ${MAX_BULK_ITEMS} items allowed per bulk operation`);
    }

    // Validate target folder
    if (targetFolderId) {
      const targetFolder = db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(targetFolderId, userId);
      if (!targetFolder) {
        throw new NotFoundError('Target folder not found');
      }
    }

    // Validate all items ownership before starting
    this.validateItemsOwnership(userId, items);

    // Create bulk job
    const job = this.createBulkJob(userId, 'move', items.length);
    
    // Process asynchronously
    setImmediate(async () => {
      const errors: BulkError[] = [];
      let processed = 0;
      let succeeded = 0;
      let failed = 0;

      try {
        const batches = this.chunk(items, BATCH_SIZE);
        
        for (const batch of batches) {
          // Process batch in transaction
          try {
            db.transaction(() => {
              for (const item of batch) {
                try {
                  if (item.type === 'file') {
                    // Move file
                    db.prepare(`
                      UPDATE files 
                      SET folder_id = ?, updated_at = ?
                      WHERE id = ? AND owner_id = ?
                    `).run(targetFolderId, Date.now(), item.id, userId);
                  } else {
                    // Move folder
                    db.prepare(`
                      UPDATE folders 
                      SET parent_id = ?, updated_at = ?
                      WHERE id = ? AND owner_id = ?
                    `).run(targetFolderId, Date.now(), item.id, userId);
                  }
                  succeeded++;
                } catch (error: any) {
                  failed++;
                  errors.push({ itemId: item.id, error: error.message });
                  logger.error('Bulk move item failed', { 
                    itemId: item.id, 
                    error: error.message 
                  });
                }
                processed++;
              }
            })();
          } catch (error: any) {
            // Batch transaction failed - mark all items in batch as failed
            for (const item of batch) {
              failed++;
              errors.push({ itemId: item.id, error: 'Transaction failed: ' + error.message });
              processed++;
            }
          }

          // Update job progress
          this.updateBulkJob(job.id, processed, succeeded, failed, errors);
          
          // Emit progress
          this.emitProgress(userId, { ...job, processed, succeeded, failed }, errors);
        }

        // Complete job
        this.completeBulkJob(job.id, 'complete');
        
        // Emit completion
        this.emitComplete(userId, job.id, {
          total: items.length,
          processed,
          succeeded,
          failed,
          errors
        });

        logger.info('Bulk move completed', {
          jobId: job.id,
          userId,
          total: items.length,
          succeeded,
          failed
        });

      } catch (error: any) {
        this.completeBulkJob(job.id, 'failed');
        logger.error('Bulk move failed', { 
          jobId: job.id, 
          error: error.message 
        });
      }
    });

    return {
      jobId: job.id,
      message: 'Bulk move started'
    };
  }

  /**
   * Bulk delete files and folders
   */
  static async bulkDelete(userId: string, items: BulkItem[]): Promise<BulkResult> {
    // Validate input
    if (items.length > MAX_BULK_ITEMS) {
      throw new ValidationError(`Maximum ${MAX_BULK_ITEMS} items allowed per bulk operation`);
    }

    // Validate all items ownership before starting
    this.validateItemsOwnership(userId, items);

    // Create bulk job
    const job = this.createBulkJob(userId, 'delete', items.length);
    
    // Process asynchronously
    setImmediate(async () => {
      const errors: BulkError[] = [];
      let processed = 0;
      let succeeded = 0;
      let failed = 0;

      try {
        const batches = this.chunk(items, BATCH_SIZE);
        
        for (const batch of batches) {
          // Process batch in transaction
          try {
            db.transaction(() => {
              for (const item of batch) {
                try {
                  if (item.type === 'file') {
                    // Soft delete file
                    const now = Date.now();
                    db.prepare(`
                      UPDATE files 
                      SET is_deleted = 1, deleted_at = ?, updated_at = ?
                      WHERE id = ? AND owner_id = ?
                    `).run(now, now, item.id, userId);
                  } else {
                    // Soft delete folder and all contents
                    const now = Date.now();
                    
                    // Get all descendant folder IDs
                    const allFolderIds = db.prepare(`
                      WITH RECURSIVE subtree(id) AS (
                        SELECT id FROM folders WHERE id = ? AND owner_id = ?
                        UNION ALL
                        SELECT f.id FROM folders f
                        INNER JOIN subtree s ON f.parent_id = s.id
                      )
                      SELECT id FROM subtree
                    `).all(item.id, userId) as { id: string }[];

                    const folderIds = allFolderIds.map(r => r.id);

                    if (folderIds.length > 0) {
                      const placeholders = folderIds.map(() => '?').join(',');
                      
                      // Soft delete all files in folders
                      db.prepare(`
                        UPDATE files 
                        SET is_deleted = 1, deleted_at = ?, updated_at = ? 
                        WHERE folder_id IN (${placeholders}) AND owner_id = ? AND is_deleted = 0
                      `).run(now, now, ...folderIds, userId);

                      // Soft delete all folders
                      db.prepare(`
                        UPDATE folders 
                        SET is_deleted = 1, deleted_at = ?, updated_at = ? 
                        WHERE id IN (${placeholders}) AND owner_id = ?
                      `).run(now, now, ...folderIds, userId);
                    }
                  }
                  succeeded++;
                } catch (error: any) {
                  failed++;
                  errors.push({ itemId: item.id, error: error.message });
                  logger.error('Bulk delete item failed', { 
                    itemId: item.id, 
                    error: error.message 
                  });
                }
                processed++;
              }
            })();
          } catch (error: any) {
            // Batch transaction failed - mark all items in batch as failed
            for (const item of batch) {
              failed++;
              errors.push({ itemId: item.id, error: 'Transaction failed: ' + error.message });
              processed++;
            }
          }

          // Update job progress
          this.updateBulkJob(job.id, processed, succeeded, failed, errors);
          
          // Emit progress
          this.emitProgress(userId, { ...job, processed, succeeded, failed }, errors);
        }

        // Complete job
        this.completeBulkJob(job.id, 'complete');
        
        // Emit completion
        this.emitComplete(userId, job.id, {
          total: items.length,
          processed,
          succeeded,
          failed,
          errors
        });

        logger.info('Bulk delete completed', {
          jobId: job.id,
          userId,
          total: items.length,
          succeeded,
          failed
        });

      } catch (error: any) {
        this.completeBulkJob(job.id, 'failed');
        logger.error('Bulk delete failed', { 
          jobId: job.id, 
          error: error.message 
        });
      }
    });

    return {
      jobId: job.id,
      message: 'Bulk delete started'
    };
  }

  /**
   * Bulk copy files (folders not supported)
   */
  static async bulkCopy(userId: string, fileIds: string[], targetFolderId: string | null): Promise<BulkResult> {
    // Validate input
    if (fileIds.length > MAX_BULK_ITEMS) {
      throw new ValidationError(`Maximum ${MAX_BULK_ITEMS} files allowed per bulk operation`);
    }

    // Validate target folder
    if (targetFolderId) {
      const targetFolder = db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(targetFolderId, userId);
      if (!targetFolder) {
        throw new NotFoundError('Target folder not found');
      }
    }

    // Validate all files ownership before starting
    for (const fileId of fileIds) {
      const file = db.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(fileId, userId);
      if (!file) {
        throw new NotFoundError(`File ${fileId} not found or not owned by user`);
      }
    }

    // Create bulk job
    const job = this.createBulkJob(userId, 'copy', fileIds.length);
    
    // Process asynchronously
    setImmediate(async () => {
      const errors: BulkError[] = [];
      let processed = 0;
      let succeeded = 0;
      let failed = 0;

      try {
        const batches = this.chunk(fileIds, BATCH_SIZE);
        
        for (const batch of batches) {
          for (const fileId of batch) {
            try {
              // Get original file
              const originalFile = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId) as FileRecord;
              if (!originalFile) {
                throw new Error('File not found');
              }

              // Create new file record
              const newFileId = uuidv4();
              const now = Date.now();
              
              // Check if content exists in dedup store (reuse if possible)
              const { DedupService } = require('./dedup.service');
              let finalStoragePath = originalFile.storage_path;
              
              if (originalFile.content_checksum) {
                // File uses deduplication - increment reference count
                DedupService.incrementRef(originalFile.content_checksum);
              }

              // Insert new file record
              db.prepare(`
                INSERT INTO files (
                  id, owner_id, folder_id, name, original_name, mime_type,
                  size, storage_path, checksum, content_checksum, is_deleted, deleted_at,
                  created_at, updated_at, version_count, current_version, is_encrypted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                newFileId, userId, targetFolderId, originalFile.name, originalFile.original_name,
                originalFile.mime_type, originalFile.size, finalStoragePath, originalFile.checksum,
                originalFile.content_checksum, 0, null, now, now, 1, 1, originalFile.is_encrypted
              );

              succeeded++;
            } catch (error: any) {
              failed++;
              errors.push({ itemId: fileId, error: error.message });
              logger.error('Bulk copy item failed', { 
                fileId, 
                error: error.message 
              });
            }
            processed++;

            // Update job progress every 10 items
            if (processed % 10 === 0) {
              this.updateBulkJob(job.id, processed, succeeded, failed, errors);
              this.emitProgress(userId, { ...job, processed, succeeded, failed }, errors);
            }
          }
        }

        // Final update
        this.updateBulkJob(job.id, processed, succeeded, failed, errors);
        this.completeBulkJob(job.id, 'complete');
        
        // Emit completion
        this.emitComplete(userId, job.id, {
          total: fileIds.length,
          processed,
          succeeded,
          failed,
          errors
        });

        logger.info('Bulk copy completed', {
          jobId: job.id,
          userId,
          total: fileIds.length,
          succeeded,
          failed
        });

      } catch (error: any) {
        this.completeBulkJob(job.id, 'failed');
        logger.error('Bulk copy failed', { 
          jobId: job.id, 
          error: error.message 
        });
      }
    });

    return {
      jobId: job.id,
      message: 'Bulk copy started'
    };
  }

  /**
   * Bulk tag files
   */
  static async bulkTag(userId: string, fileIds: string[], tagIds: string[]): Promise<TagResult> {
    // Validate files ownership
    for (const fileId of fileIds) {
      const file = db.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(fileId, userId);
      if (!file) {
        throw new NotFoundError(`File ${fileId} not found or not owned by user`);
      }
    }

    // Validate tags ownership
    for (const tagId of tagIds) {
      const tag = db.prepare('SELECT id FROM tags WHERE id = ? AND owner_id = ?').get(tagId, userId);
      if (!tag) {
        throw new NotFoundError(`Tag ${tagId} not found or not owned by user`);
      }
    }

    let tagged = 0;
    const now = Date.now();

    // Insert file-tag relationships
    db.transaction(() => {
      for (const fileId of fileIds) {
        for (const tagId of tagIds) {
          try {
            db.prepare(`
              INSERT OR IGNORE INTO file_tags (file_id, tag_id, added_at)
              VALUES (?, ?, ?)
            `).run(fileId, tagId, now);
            tagged++;
          } catch (error: any) {
            logger.warn('Failed to tag file', { fileId, tagId, error: error.message });
          }
        }
      }
    })();

    logger.info('Bulk tag completed', { userId, fileIds: fileIds.length, tagIds: tagIds.length, tagged });

    return { tagged, untagged: 0 };
  }

  /**
   * Bulk untag files
   */
  static async bulkUntag(userId: string, fileIds: string[], tagIds: string[]): Promise<TagResult> {
    // Validate files ownership
    for (const fileId of fileIds) {
      const file = db.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(fileId, userId);
      if (!file) {
        throw new NotFoundError(`File ${fileId} not found or not owned by user`);
      }
    }

    // Validate tags ownership
    for (const tagId of tagIds) {
      const tag = db.prepare('SELECT id FROM tags WHERE id = ? AND owner_id = ?').get(tagId, userId);
      if (!tag) {
        throw new NotFoundError(`Tag ${tagId} not found or not owned by user`);
      }
    }

    // Remove file-tag relationships
    const fileIdPlaceholders = fileIds.map(() => '?').join(',');
    const tagIdPlaceholders = tagIds.map(() => '?').join(',');
    
    const result = db.prepare(`
      DELETE FROM file_tags 
      WHERE file_id IN (${fileIdPlaceholders}) AND tag_id IN (${tagIdPlaceholders})
    `).run(...fileIds, ...tagIds);

    const untagged = result.changes || 0;

    logger.info('Bulk untag completed', { userId, fileIds: fileIds.length, tagIds: tagIds.length, untagged });

    return { tagged: 0, untagged };
  }

  /**
   * Get bulk job status
   */
  static getBulkJobStatus(jobId: string, userId: string): BulkJob | null {
    const job = db.prepare('SELECT * FROM bulk_jobs WHERE id = ? AND user_id = ?').get(jobId, userId) as BulkJob | undefined;
    return job || null;
  }

  /**
   * Create a new tag
   */
  static createTag(userId: string, name: string, color: string = '#6366f1'): Tag {
    // Validate name
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Tag name is required');
    }

    if (name.length > 50) {
      throw new ValidationError('Tag name must be 50 characters or less');
    }

    // Validate color (hex color)
    if (!/^#[0-9A-F]{6}$/i.test(color)) {
      throw new ValidationError('Color must be a valid hex color (e.g., #6366f1)');
    }

    const tagId = uuidv4();
    const now = Date.now();

    try {
      db.prepare(`
        INSERT INTO tags (id, owner_id, name, color, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(tagId, userId, name.trim(), color, now);

      const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag;
      
      logger.info('Tag created', { tagId, userId, name: name.trim(), color });
      
      return tag;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ValidationError('Tag name already exists');
      }
      throw error;
    }
  }

  /**
   * Update a tag
   */
  static updateTag(tagId: string, userId: string, updates: { name?: string; color?: string }): Tag {
    // Verify tag ownership
    const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND owner_id = ?').get(tagId, userId) as Tag;
    if (!tag) {
      throw new NotFoundError('Tag not found');
    }

    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim().length === 0) {
        throw new ValidationError('Tag name is required');
      }
      if (updates.name.length > 50) {
        throw new ValidationError('Tag name must be 50 characters or less');
      }
      updateFields.push('name = ?');
      updateValues.push(updates.name.trim());
    }

    if (updates.color !== undefined) {
      if (!/^#[0-9A-F]{6}$/i.test(updates.color)) {
        throw new ValidationError('Color must be a valid hex color (e.g., #6366f1)');
      }
      updateFields.push('color = ?');
      updateValues.push(updates.color);
    }

    if (updateFields.length === 0) {
      return tag; // No updates
    }

    updateValues.push(tagId);

    try {
      db.prepare(`
        UPDATE tags SET ${updateFields.join(', ')}
        WHERE id = ?
      `).run(...updateValues);

      const updatedTag = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag;
      
      logger.info('Tag updated', { tagId, userId, updates });
      
      return updatedTag;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ValidationError('Tag name already exists');
      }
      throw error;
    }
  }

  /**
   * Delete a tag
   */
  static deleteTag(tagId: string, userId: string): void {
    // Verify tag ownership
    const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND owner_id = ?').get(tagId, userId) as Tag;
    if (!tag) {
      throw new NotFoundError('Tag not found');
    }

    // Delete tag (file_tags will be deleted by CASCADE)
    db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);

    logger.info('Tag deleted', { tagId, userId, tagName: tag.name });
  }

  /**
   * List all tags for a user
   */
  static listTags(userId: string): Tag[] {
    const tags = db.prepare(`
      SELECT * FROM tags 
      WHERE owner_id = ? 
      ORDER BY name ASC
    `).all(userId) as Tag[];

    return tags;
  }

  /**
   * Get files with a specific tag
   */
  static getFilesWithTag(tagId: string, userId: string, page: number = 1, limit: number = 50): { files: FileRecord[]; totalCount: number } {
    // Verify tag ownership
    const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND owner_id = ?').get(tagId, userId) as Tag;
    if (!tag) {
      throw new NotFoundError('Tag not found');
    }

    const offset = (page - 1) * limit;

    // Get files with this tag
    const files = db.prepare(`
      SELECT f.* FROM files f
      INNER JOIN file_tags ft ON f.id = ft.file_id
      WHERE ft.tag_id = ? AND f.owner_id = ? AND f.is_deleted = 0
      ORDER BY f.name ASC
      LIMIT ? OFFSET ?
    `).all(tagId, userId, limit, offset) as FileRecord[];

    // Get total count
    const totalCount = db.prepare(`
      SELECT COUNT(*) as count FROM files f
      INNER JOIN file_tags ft ON f.id = ft.file_id
      WHERE ft.tag_id = ? AND f.owner_id = ? AND f.is_deleted = 0
    `).get(tagId, userId) as { count: number };

    return {
      files,
      totalCount: totalCount.count
    };
  }

  /**
   * Get tags for a specific file
   */
  static getFileTags(fileId: string, userId: string): Tag[] {
    // Verify file ownership
    const file = db.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(fileId, userId);
    if (!file) {
      throw new NotFoundError('File not found');
    }

    const tags = db.prepare(`
      SELECT t.* FROM tags t
      INNER JOIN file_tags ft ON t.id = ft.tag_id
      WHERE ft.file_id = ? AND t.owner_id = ?
      ORDER BY t.name ASC
    `).all(fileId, userId) as Tag[];

    return tags;
  }

  /**
   * Set tags for a file (replaces all existing tags)
   */
  static setFileTags(fileId: string, userId: string, tagIds: string[]): void {
    // Verify file ownership
    const file = db.prepare('SELECT id FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(fileId, userId);
    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Verify all tags ownership
    for (const tagId of tagIds) {
      const tag = db.prepare('SELECT id FROM tags WHERE id = ? AND owner_id = ?').get(tagId, userId);
      if (!tag) {
        throw new NotFoundError(`Tag ${tagId} not found or not owned by user`);
      }
    }

    const now = Date.now();

    db.transaction(() => {
      // Remove all existing tags for this file
      db.prepare('DELETE FROM file_tags WHERE file_id = ?').run(fileId);

      // Add new tags
      for (const tagId of tagIds) {
        db.prepare(`
          INSERT INTO file_tags (file_id, tag_id, added_at)
          VALUES (?, ?, ?)
        `).run(fileId, tagId, now);
      }
    })();

    logger.info('File tags updated', { fileId, userId, tagCount: tagIds.length });
  }
}