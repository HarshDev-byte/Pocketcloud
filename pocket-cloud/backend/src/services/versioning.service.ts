import { db } from '../db';
import { LoggerService } from './logger.service';
import { realtimeService } from './realtime.service';
import { DEFAULT_VERSIONING_CONFIG } from '../config/versioning.config';

// Import modules using eval to avoid TypeScript module resolution issues
const fs = eval('require')('fs');
const path = eval('require')('path');
const crypto = eval('require')('crypto');

export interface FileVersion {
  id: string;
  fileId: string;
  versionNum: number;
  size: number;
  checksum: string;
  storagePath: string;
  createdBy: string;
  createdAt: number;
  comment?: string;
  isCurrent: boolean;
  createdByName?: string;
}

export class VersioningService {
  private static readonly VERSIONS_DIR = eval('process.env.VERSIONS_PATH') || '/mnt/pocketcloud/versions';
  
  /**
   * Create a new version of a file before overwriting
   */
  public static async createVersion(
    fileId: string,
    newStoragePath: string,
    userId: string,
    comment?: string
  ): Promise<FileVersion | null> {
    const config = DEFAULT_VERSIONING_CONFIG;
    
    if (!config.enabled) {
      return null;
    }

    const database = db();
    return database.transaction(() => {
      // Get current file info
      const fileStmt = database.prepare(`
        SELECT id, name, size, checksum, storage_path, current_version, version_count
        FROM files 
        WHERE id = ? AND is_deleted = 0
      `);
      
      const file = fileStmt.get(fileId) as any;
      if (!file) {
        throw new Error('File not found');
      }

      // Check if versioning should be skipped for small files
      if (file.size < config.skipVersioningUnder) {
        LoggerService.info('versioning', `Skipping versioning for small file: ${file.name} (${file.size} bytes)`, undefined, { fileId, size: file.size });
        return null;
      }

      // Calculate next version number
      const nextVersion = file.current_version + 1;
      
      // Create version storage directory
      const versionDir = path.join(this.VERSIONS_DIR, fileId, nextVersion.toString());
      fs.mkdirSync(versionDir, { recursive: true });
      
      // Copy current file to version storage (atomic operation)
      const versionPath = path.join(versionDir, file.name);
      const tempVersionPath = `${versionPath}.tmp`;
      
      try {
        // Copy to temp location first
        fs.copyFileSync(file.storage_path, tempVersionPath);
        
        // Atomic rename to final location
        fs.renameSync(tempVersionPath, versionPath);
        
        // Verify the copy
        const originalStats = fs.statSync(file.storage_path);
        const versionStats = fs.statSync(versionPath);
        
        if (originalStats.size !== versionStats.size) {
          throw new Error('Version copy size mismatch');
        }
        
      } catch (error) {
        // Cleanup on failure
        try {
          if (fs.existsSync(tempVersionPath)) fs.unlinkSync(tempVersionPath);
          if (fs.existsSync(versionPath)) fs.unlinkSync(versionPath);
        } catch (cleanupError) {
          LoggerService.error('versioning', 'Failed to cleanup failed version creation', undefined, { error: (cleanupError as Error).message, fileId });
        }
        throw error;
      }

      // Mark previous version as not current
      const updatePreviousStmt = database.prepare(`
        UPDATE file_versions 
        SET is_current = 0 
        WHERE file_id = ? AND is_current = 1
      `);
      updatePreviousStmt.run(fileId);

      // Create version record
      const versionId = crypto.randomUUID();
      const timestamp = Date.now();
      
      const insertVersionStmt = database.prepare(`
        INSERT INTO file_versions (
          id, file_id, version_num, size, checksum, storage_path, 
          created_by, created_at, comment, is_current
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      insertVersionStmt.run(
        versionId,
        fileId,
        nextVersion,
        file.size,
        file.checksum,
        versionPath,
        userId,
        timestamp,
        comment || `Version ${nextVersion}`,
        1 // This becomes the current version
      );

      // Update file record
      const updateFileStmt = database.prepare(`
        UPDATE files 
        SET current_version = ?, version_count = version_count + 1, updated_at = ?
        WHERE id = ?
      `);
      updateFileStmt.run(nextVersion, timestamp, fileId);

      // Now atomically replace the current file
      const tempNewPath = `${file.storage_path}.new`;
      
      try {
        // Copy new file to temp location
        fs.copyFileSync(newStoragePath, tempNewPath);
        
        // Atomic rename to replace current file
        fs.renameSync(tempNewPath, file.storage_path);
        
      } catch (error) {
        // Cleanup on failure
        try {
          if (fs.existsSync(tempNewPath)) fs.unlinkSync(tempNewPath);
        } catch (cleanupError) {
          LoggerService.error('versioning', 'Failed to cleanup failed file replacement', undefined, { error: (cleanupError as Error).message, fileId });
        }
        throw error;
      }

      // Clean up old versions if needed
      this.cleanupOldVersions(fileId, config.maxVersionsPerFile);

      const version: FileVersion = {
        id: versionId,
        fileId,
        versionNum: nextVersion,
        size: file.size,
        checksum: file.checksum,
        storagePath: versionPath,
        createdBy: userId,
        createdAt: timestamp,
        comment: comment || `Version ${nextVersion}`,
        isCurrent: true
      };

      // Broadcast version created event
      const versionMetadata = {
        id: fileId,
        name: file.name,
        size: file.size,
        mime_type: 'application/octet-stream',
        created_at: timestamp,
        updated_at: timestamp,
        owner_id: userId,
        folder_id: null
      };
      realtimeService.broadcastFileCreated(fileId, null, versionMetadata);
      LoggerService.info('versioning', `Created version ${version.versionNum} for file ${fileId}`, userId, { fileId, versionNum: version.versionNum });
      
      return version;
    })();
  }

  /**
   * Get all versions for a file (newest first)
   */
  public static getVersions(fileId: string): FileVersion[] {
    const database = db();
    const stmt = database.prepare(`
      SELECT 
        fv.id,
        fv.file_id as fileId,
        fv.version_num as versionNum,
        fv.size,
        fv.checksum,
        fv.storage_path as storagePath,
        fv.created_by as createdBy,
        fv.created_at as createdAt,
        fv.comment,
        fv.is_current as isCurrent,
        u.username as createdByName
      FROM file_versions fv
      LEFT JOIN users u ON fv.created_by = u.id
      WHERE fv.file_id = ?
      ORDER BY fv.version_num DESC
    `);
    
    return stmt.all(fileId) as FileVersion[];
  }

  /**
   * Restore a specific version as the current version
   */
  public static async restoreVersion(
    fileId: string,
    versionNum: number,
    userId: string
  ): Promise<FileVersion> {
    const database = db();
    return database.transaction(() => {
      // Get the version to restore
      const versionStmt = database.prepare(`
        SELECT * FROM file_versions 
        WHERE file_id = ? AND version_num = ?
      `);
      
      const version = versionStmt.get(fileId, versionNum) as any;
      if (!version) {
        throw new Error('Version not found');
      }

      // Get current file info
      const fileStmt = database.prepare(`
        SELECT * FROM files WHERE id = ? AND is_deleted = 0
      `);
      
      const file = fileStmt.get(fileId) as any;
      if (!file) {
        throw new Error('File not found');
      }

      // First, create a version of the current file (the restore is itself a version)
      this.createVersion(fileId, file.storage_path, userId, `Restored from version ${versionNum}`);

      // Copy version file back as current (atomic operation)
      const tempRestorePath = `${file.storage_path}.restore`;
      
      try {
        // Copy version to temp location
        fs.copyFileSync(version.storage_path, tempRestorePath);
        
        // Atomic rename to replace current file
        fs.renameSync(tempRestorePath, file.storage_path);
        
      } catch (error) {
        // Cleanup on failure
        try {
          if (fs.existsSync(tempRestorePath)) fs.unlinkSync(tempRestorePath);
        } catch (cleanupError) {
          LoggerService.error('versioning', 'Failed to cleanup failed restore', undefined, { error: (cleanupError as Error).message, fileId, versionNum });
        }
        throw error;
      }

      // Update file record with restored version info
      const updateFileStmt = database.prepare(`
        UPDATE files 
        SET size = ?, checksum = ?, updated_at = ?
        WHERE id = ?
      `);
      updateFileStmt.run(version.size, version.checksum, Date.now(), fileId);

      LoggerService.info('versioning', `Restored version ${versionNum} for file ${fileId}`, userId, { fileId, versionNum });
      
      return version;
    })();
  }
  /**
   * Delete old versions, keeping only the most recent N versions
   */
  public static cleanupOldVersions(fileId: string, keepCount: number = 10): number {
    const database = db();
    return database.transaction(() => {
      // Get versions to delete (oldest first, excluding current)
      const versionsStmt = database.prepare(`
        SELECT id, version_num, storage_path
        FROM file_versions 
        WHERE file_id = ? AND is_current = 0
        ORDER BY version_num ASC
      `);
      
      const versions = versionsStmt.all(fileId) as any[];
      
      if (versions.length <= keepCount) {
        return 0; // Nothing to delete
      }

      const versionsToDelete = versions.slice(0, versions.length - keepCount);
      let deletedCount = 0;

      for (const version of versionsToDelete) {
        try {
          // Delete from filesystem
          if (fs.existsSync(version.storage_path)) {
            fs.unlinkSync(version.storage_path);
            
            // Try to remove empty version directory
            const versionDir = path.dirname(version.storage_path);
            try {
              const files = fs.readdirSync(versionDir);
              if (files.length === 0) {
                fs.unlinkSync(versionDir);
              }
            } catch (error) {
              // Ignore directory cleanup errors
            }
          }

          // Delete from database
          const deleteStmt = database.prepare(`DELETE FROM file_versions WHERE id = ?`);
          deleteStmt.run(version.id);
          
          deletedCount++;
          
        } catch (error) {
          LoggerService.error('versioning', `Failed to delete version ${version.version_num} for file ${fileId}`, undefined, { error: (error as Error).message, fileId, versionNum: version.version_num });
        }
      }

      if (deletedCount > 0) {
        LoggerService.info('versioning', `Cleaned up ${deletedCount} old versions for file ${fileId}`, undefined, { fileId, deletedCount });
      }

      return deletedCount;
    })();
  }

  /**
   * Delete a specific version
   */
  public static deleteVersion(fileId: string, versionNum: number): boolean {
    const database = db();
    return database.transaction(() => {
      // Cannot delete current version
      const versionStmt = database.prepare(`
        SELECT id, storage_path, is_current
        FROM file_versions 
        WHERE file_id = ? AND version_num = ?
      `);
      
      const version = versionStmt.get(fileId, versionNum) as any;
      if (!version) {
        throw new Error('Version not found');
      }

      if (version.is_current) {
        throw new Error('Cannot delete current version');
      }

      try {
        // Delete from filesystem
        if (fs.existsSync(version.storage_path)) {
          fs.unlinkSync(version.storage_path);
          
          // Try to remove empty version directory
          const versionDir = path.dirname(version.storage_path);
          try {
            const files = fs.readdirSync(versionDir);
            if (files.length === 0) {
              fs.unlinkSync(versionDir);
            }
          } catch (error) {
            // Ignore directory cleanup errors
          }
        }

        // Delete from database
        const deleteStmt = database.prepare(`DELETE FROM file_versions WHERE id = ?`);
        deleteStmt.run(version.id);
        
        // Update version count
        const updateFileStmt = database.prepare(`
          UPDATE files 
          SET version_count = version_count - 1
          WHERE id = ?
        `);
        updateFileStmt.run(fileId);

        LoggerService.info('versioning', `Deleted version ${versionNum} for file ${fileId}`, undefined, { fileId, versionNum });
        return true;
        
      } catch (error: any) {
        LoggerService.error('versioning', `Failed to delete version ${versionNum} for file ${fileId}`, undefined, { error: error.message, fileId, versionNum });
        throw error;
      }
    })();
  }

  /**
   * Delete all versions except current
   */
  public static deleteAllVersions(fileId: string): number {
    const database = db();
    return database.transaction(() => {
      // Get all non-current versions
      const versionsStmt = database.prepare(`
        SELECT id, version_num, storage_path
        FROM file_versions 
        WHERE file_id = ? AND is_current = 0
      `);
      
      const versions = versionsStmt.all(fileId) as any[];
      let deletedCount = 0;

      for (const version of versions) {
        try {
          // Delete from filesystem
          if (fs.existsSync(version.storage_path)) {
            fs.unlinkSync(version.storage_path);
          }

          // Delete from database
          const deleteStmt = database.prepare(`DELETE FROM file_versions WHERE id = ?`);
          deleteStmt.run(version.id);
          
          deletedCount++;
          
        } catch (error) {
          LoggerService.error('versioning', `Failed to delete version ${version.version_num} for file ${fileId}`, undefined, { error: (error as Error).message, fileId, versionNum: version.version_num });
        }
      }

      // Update version count to 1 (only current version remains)
      const updateFileStmt = database.prepare(`
        UPDATE files 
        SET version_count = 1
        WHERE id = ?
      `);
      updateFileStmt.run(fileId);

      // Clean up empty version directories
      try {
        const fileVersionDir = path.join(this.VERSIONS_DIR, fileId);
        if (fs.existsSync(fileVersionDir)) {
          const subdirs = fs.readdirSync(fileVersionDir);
          for (const subdir of subdirs) {
            const subdirPath = path.join(fileVersionDir, subdir);
            try {
              const files = fs.readdirSync(subdirPath);
              if (files.length === 0) {
                fs.unlinkSync(subdirPath);
              }
            } catch (error) {
              // Ignore cleanup errors
            }
          }
        }
      } catch (error) {
        // Ignore directory cleanup errors
      }

      LoggerService.info('versioning', `Deleted ${deletedCount} versions for file ${fileId}`, undefined, { fileId, deletedCount });
      return deletedCount;
    })();
  }

  /**
   * Get total storage used by versions for a user
   */
  public static getVersionStorageUsed(userId: string): number {
    const database = db();
    const stmt = database.prepare(`
      SELECT COALESCE(SUM(fv.size), 0) as totalSize
      FROM file_versions fv
      JOIN files f ON fv.file_id = f.id
      WHERE f.owner_id = ? AND fv.is_current = 0
    `);
    
    const result = stmt.get(userId) as { totalSize: number };
    return result.totalSize;
  }

  /**
   * Get version statistics
   */
  public static getVersionStats(fileId?: string): any {
    if (fileId) {
      // Stats for specific file
      const database = db();
      const stmt = database.prepare(`
        SELECT 
          COUNT(*) as versionCount,
          COALESCE(SUM(size), 0) as totalSize,
          MAX(created_at) as lastVersionAt
        FROM file_versions 
        WHERE file_id = ?
      `);
      
      return stmt.get(fileId);
    } else {
      // Global stats
      const database = db();
      const stmt = database.prepare(`
        SELECT 
          COUNT(*) as totalVersions,
          COUNT(DISTINCT file_id) as filesWithVersions,
          COALESCE(SUM(size), 0) as totalVersionStorage
        FROM file_versions 
        WHERE is_current = 0
      `);
      
      return stmt.get();
    }
  }

  /**
   * Cleanup old versions based on age
   */
  public static cleanupOldVersionsByAge(maxAgeDays: number = 90): number {
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    
    const database = db();
    return database.transaction(() => {
      // Get old versions to delete
      const versionsStmt = database.prepare(`
        SELECT id, file_id, version_num, storage_path
        FROM file_versions 
        WHERE created_at < ? AND is_current = 0
      `);
      
      const versions = versionsStmt.all(cutoffTime) as any[];
      let deletedCount = 0;

      for (const version of versions) {
        try {
          // Delete from filesystem
          if (fs.existsSync(version.storage_path)) {
            fs.unlinkSync(version.storage_path);
          }

          // Delete from database
          const deleteStmt = database.prepare(`DELETE FROM file_versions WHERE id = ?`);
          deleteStmt.run(version.id);
          
          deletedCount++;
          
        } catch (error) {
          LoggerService.error('versioning', `Failed to delete old version ${version.version_num}`, undefined, { error: (error as Error).message, versionNum: version.version_num });
        }
      }

      // Update version counts for affected files
      const fileIds = [...new Set(versions.map(v => v.file_id))];
      for (const fileId of fileIds) {
        const countStmt = database.prepare(`
          SELECT COUNT(*) as count FROM file_versions WHERE file_id = ?
        `);
        const { count } = countStmt.get(fileId) as { count: number };
        
        const updateStmt = database.prepare(`
          UPDATE files SET version_count = ? WHERE id = ?
        `);
        updateStmt.run(count, fileId);
      }

      if (deletedCount > 0) {
        LoggerService.info('versioning', `Cleaned up ${deletedCount} old versions (older than ${maxAgeDays} days)`, undefined, { deletedCount, maxAgeDays });
      }

      return deletedCount;
    })();
  }
}

// Export singleton instance
export const versioningService = VersioningService;