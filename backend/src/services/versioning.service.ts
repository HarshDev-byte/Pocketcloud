import { db } from '../db/client';
import { File as FileRecord, FileVersion } from '../db/types';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { DedupService } from './dedup.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';

const MAX_VERSIONS_PER_FILE = 10;
const MIN_SIZE_TO_VERSION = 10240; // Don't version files < 10KB

interface VersionListResult {
  versions: (FileVersion & { created_by_username?: string })[];
  currentVersion: number;
  totalVersions: number;
  versionsStorageBytes: number;
}

export class VersioningService {
  private static generateStoragePath(userId: string, filename: string, fileId: string): string {
    const ext = path.extname(filename);
    const date = new Date();
    return path.join(
      process.env.STORAGE_PATH!,
      userId,
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, '0'),
      `${fileId}${ext}`
    );
  }

  static async createVersion(
    fileId: string, 
    newStoragePath: string, 
    newSize: number, 
    newChecksum: string, 
    userId: string, 
    label?: string
  ): Promise<void> {
    // Get current file record
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Skip versioning for small files
    if (file.size < MIN_SIZE_TO_VERSION) {
      logger.info('Skipping version creation for small file', { 
        fileId, 
        size: file.size, 
        minSize: MIN_SIZE_TO_VERSION 
      });
      return;
    }

    // Skip versioning if checksum is identical (same content)
    if (newChecksum === file.checksum) {
      logger.info('Skipping version creation for identical content', { 
        fileId, 
        checksum: newChecksum 
      });
      return;
    }

    // Create version storage directory
    const versionsDir = path.join(process.env.STORAGE_PATH!, '.versions', fileId);
    fs.mkdirSync(versionsDir, { recursive: true });

    // Create version file path
    const versionPath = path.join(versionsDir, `v${file.current_version}_${Date.now()}`);

    // For deduplication: check if we need to copy the file or if it's already deduplicated
    let needsCopy = true;
    if (file.content_checksum) {
      // File uses deduplication - we need to copy the content to preserve the version
      // since the original storage_path might be shared with other files
      const contentStore = DedupService.getContent(file.content_checksum);
      if (contentStore && fs.existsSync(contentStore.storage_path)) {
        try {
          fs.copyFileSync(contentStore.storage_path, versionPath);
          needsCopy = false;
        } catch (error: any) {
          logger.warn('Failed to copy from content store, falling back to file path', { 
            fileId, 
            contentChecksum: file.content_checksum,
            error: error.message 
          });
        }
      }
    }

    // Fallback: copy from file's storage path
    if (needsCopy) {
      try {
        fs.copyFileSync(file.storage_path, versionPath);
      } catch (error: any) {
        logger.error('Failed to copy file for versioning', { 
          fileId, 
          sourcePath: file.storage_path, 
          versionPath, 
          error: error.message 
        });
        throw new Error('Failed to create version backup');
      }
    }

    // Store current version in versions table and update file record in transaction
    db.transaction(() => {
      // Insert version record
      const versionId = uuidv4();
      db.prepare(`
        INSERT INTO file_versions (
          id, file_id, version_num, size, checksum, storage_path, 
          created_by, created_at, label, is_current
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        versionId,
        fileId,
        file.current_version,
        file.size,
        file.checksum,
        versionPath,
        userId,
        Date.now(),
        label || `v${file.current_version}`
      );

      // Update file record with new version and content checksum
      db.prepare(`
        UPDATE files SET 
          storage_path = ?, 
          size = ?, 
          checksum = ?, 
          content_checksum = ?,
          current_version = current_version + 1,
          version_count = version_count + 1,
          updated_at = ?
        WHERE id = ?
      `).run(newStoragePath, newSize, newChecksum, newChecksum, Date.now(), fileId);
    })();

    // Prune old versions if over limit
    await this.pruneOldVersions(fileId);

    logger.info('Version created successfully', { 
      fileId, 
      versionNum: file.current_version, 
      newVersion: file.current_version + 1,
      label: label || `v${file.current_version}`,
      deduplicated: !!file.content_checksum
    });
  }

  static async pruneOldVersions(fileId: string): Promise<void> {
    // Count versions for this file
    const versionCount = db.prepare('SELECT COUNT(*) as count FROM file_versions WHERE file_id = ?').get(fileId) as { count: number };
    
    if (versionCount.count <= MAX_VERSIONS_PER_FILE) {
      return; // Nothing to prune
    }

    // Get oldest versions to delete
    const versionsToDelete = db.prepare(`
      SELECT * FROM file_versions 
      WHERE file_id = ? AND is_current = 0 
      ORDER BY version_num ASC 
      LIMIT ?
    `).all(fileId, versionCount.count - MAX_VERSIONS_PER_FILE) as FileVersion[];

    // Delete each version
    for (const version of versionsToDelete) {
      try {
        // Delete from disk
        if (fs.existsSync(version.storage_path)) {
          fs.unlinkSync(version.storage_path);
        }

        // Delete from database
        db.prepare('DELETE FROM file_versions WHERE id = ?').run(version.id);

        logger.info('Pruned old version', { 
          fileId, 
          versionId: version.id, 
          versionNum: version.version_num 
        });
      } catch (error: any) {
        logger.error('Failed to prune version', { 
          fileId, 
          versionId: version.id, 
          error: error.message 
        });
      }
    }
  }

  static async listVersions(fileId: string, userId: string): Promise<VersionListResult> {
    // Verify file ownership
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Get all versions with creator usernames
    const versions = db.prepare(`
      SELECT v.*, u.username as created_by_username
      FROM file_versions v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.file_id = ?
      ORDER BY v.version_num DESC
    `).all(fileId) as (FileVersion & { created_by_username?: string })[];

    // Calculate total storage used by versions
    const storageStats = db.prepare(`
      SELECT SUM(size) as total_bytes
      FROM file_versions
      WHERE file_id = ?
    `).get(fileId) as { total_bytes: number | null };

    return {
      versions,
      currentVersion: file.current_version,
      totalVersions: file.version_count,
      versionsStorageBytes: storageStats.total_bytes || 0
    };
  }

  static async restoreVersion(fileId: string, versionNum: number, userId: string): Promise<FileRecord> {
    // Verify file ownership
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Get version record
    const version = db.prepare('SELECT * FROM file_versions WHERE file_id = ? AND version_num = ?').get(fileId, versionNum) as FileVersion;
    if (!version) {
      throw new NotFoundError('Version not found');
    }

    // Verify version file exists on disk
    if (!fs.existsSync(version.storage_path)) {
      throw new NotFoundError('Version file not found on disk');
    }

    // Before restoring, save current as a new version
    await this.createVersion(
      fileId, 
      file.storage_path, 
      file.size, 
      file.checksum, 
      userId, 
      'Before restore'
    );

    // Check if restored content already exists in dedup store
    const duplicate = DedupService.findDuplicate(version.checksum);
    let finalStoragePath: string;

    if (duplicate) {
      // Content already exists - use existing storage and increment ref count
      finalStoragePath = duplicate.storage_path;
      DedupService.incrementRef(version.checksum);
      
      logger.info('Version restore using existing deduplicated content', {
        fileId,
        versionNum,
        existingPath: finalStoragePath,
        checksum: version.checksum.substring(0, 16) + '...'
      });
    } else {
      // Generate new storage path for restored version
      finalStoragePath = this.generateStoragePath(userId, file.name, fileId);
      
      // Ensure directory exists
      fs.mkdirSync(path.dirname(finalStoragePath), { recursive: true });

      // Copy version file to new location
      fs.copyFileSync(version.storage_path, finalStoragePath);
      
      // Register new content in dedup store
      DedupService.registerContent(version.checksum, finalStoragePath, version.size);
      
      logger.info('Version restore created new content', {
        fileId,
        versionNum,
        newPath: finalStoragePath,
        checksum: version.checksum.substring(0, 16) + '...'
      });
    }

    // Handle deduplication for the old file content
    if (file.content_checksum) {
      const { deleted } = DedupService.decrementRef(file.content_checksum);
      if (deleted) {
        logger.info('Old file content removed during version restore', {
          fileId,
          oldChecksum: file.content_checksum.substring(0, 16) + '...'
        });
      }
    }

    // Update file record
    const now = Date.now();
    db.prepare(`
      UPDATE files SET 
        storage_path = ?, 
        size = ?, 
        checksum = ?, 
        content_checksum = ?,
        updated_at = ?
      WHERE id = ?
    `).run(finalStoragePath, version.size, version.checksum, version.checksum, now, fileId);

    // Get updated file record
    const updatedFile = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as FileRecord;

    logger.info('Version restored', { 
      fileId, 
      versionNum, 
      userId, 
      restoredPath: finalStoragePath,
      deduplicated: !!duplicate
    });

    return updatedFile;
  }

  static async downloadVersion(fileId: string, versionNum: number, userId: string, res: Response): Promise<void> {
    // Verify file ownership
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Get version record
    const version = db.prepare('SELECT * FROM file_versions WHERE file_id = ? AND version_num = ?').get(fileId, versionNum) as FileVersion;
    if (!version) {
      throw new NotFoundError('Version not found');
    }

    // Check version file exists on disk
    if (!fs.existsSync(version.storage_path)) {
      throw new NotFoundError('Version file not found on disk');
    }

    const stat = fs.statSync(version.storage_path);
    const ext = path.extname(file.name);
    const baseName = path.basename(file.name, ext);
    const versionFilename = `${baseName}_v${versionNum}${ext}`;

    // Set headers for download
    res.writeHead(200, {
      'Content-Disposition': `attachment; filename="${encodeURIComponent(versionFilename)}"`,
      'Content-Type': file.mime_type,
      'Content-Length': stat.size,
    });

    // Stream version file
    const stream = fs.createReadStream(version.storage_path);
    stream.pipe(res);

    stream.on('error', (error) => {
      logger.error('Stream error during version download', { 
        fileId, 
        versionNum, 
        error: error.message 
      });
      res.destroy();
    });

    logger.info('Version download started', { 
      fileId, 
      versionNum, 
      userId, 
      filename: versionFilename 
    });
  }

  static async deleteVersion(fileId: string, versionNum: number, userId: string): Promise<void> {
    // Verify file ownership
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(fileId, userId) as FileRecord;
    if (!file) {
      throw new NotFoundError('File not found');
    }

    // Cannot delete current version
    if (versionNum === file.current_version) {
      throw new ValidationError('Cannot delete the current version');
    }

    // Get version record
    const version = db.prepare('SELECT * FROM file_versions WHERE file_id = ? AND version_num = ?').get(fileId, versionNum) as FileVersion;
    if (!version) {
      throw new NotFoundError('Version not found');
    }

    // Delete from disk and database
    try {
      if (fs.existsSync(version.storage_path)) {
        fs.unlinkSync(version.storage_path);
      }

      db.prepare('DELETE FROM file_versions WHERE id = ?').run(version.id);

      logger.info('Version deleted', { 
        fileId, 
        versionNum, 
        userId, 
        versionId: version.id 
      });
    } catch (error: any) {
      logger.error('Failed to delete version', { 
        fileId, 
        versionNum, 
        error: error.message 
      });
      throw new Error('Failed to delete version');
    }
  }

  static async getVersionStorageUsed(userId: string): Promise<number> {
    const result = db.prepare(`
      SELECT SUM(v.size) as total
      FROM file_versions v
      JOIN files f ON v.file_id = f.id
      WHERE f.owner_id = ?
    `).get(userId) as { total: number | null };

    return result.total || 0;
  }

  static async checkForExistingFile(userId: string, filename: string, folderId: string | null): Promise<FileRecord | null> {
    const existingFile = db.prepare(`
      SELECT * FROM files 
      WHERE owner_id = ? AND name = ? AND folder_id IS ? AND is_deleted = 0
    `).get(userId, filename, folderId) as FileRecord | undefined;

    return existingFile || null;
  }
}