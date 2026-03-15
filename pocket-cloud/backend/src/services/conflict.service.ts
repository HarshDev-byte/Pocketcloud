import { LoggerService } from './logger.service.js';
import { versioningService } from './versioning.service.js';

// Import modules using eval to avoid TypeScript module resolution issues
const path = eval('require')('path');
const fs = eval('require')('fs');
const crypto = eval('require')('crypto');
const db = eval('require')('../db/index.js');

export interface ConflictInfo {
  fileId: string;
  fileName: string;
  clientChecksum: string;
  serverChecksum: string;
  clientModifiedAt: number;
  serverModifiedAt: number;
  clientSize: number;
  serverSize: number;
  lastModifiedBy?: string;
}

export interface ConflictResolution {
  strategy: 'keep_both' | 'last_write_wins' | 'use_server_version';
  newFileName?: string;
  createVersion: boolean;
}

export class ConflictService {
  
  /**
   * Detect if there's a conflict when uploading a file
   */
  public static detectConflict(
    fileId: string,
    clientChecksum: string,
    clientModifiedAt: number,
    clientSize: number
  ): ConflictInfo | null {
    const stmt = db.prepare(`
      SELECT 
        f.id,
        f.name,
        f.checksum as serverChecksum,
        f.updated_at as serverModifiedAt,
        f.size as serverSize,
        u.username as lastModifiedBy
      FROM files f
      LEFT JOIN users u ON f.owner_id = u.id
      WHERE f.id = ? AND f.is_deleted = 0
    `);
    
    const file = stmt.get(fileId) as any;
    if (!file) {
      return null; // File doesn't exist, no conflict
    }

    // Check if checksums differ (file was modified)
    if (file.serverChecksum === clientChecksum) {
      return null; // No changes, no conflict
    }

    // Check if client's version is older than server's version
    if (clientModifiedAt < file.serverModifiedAt) {
      return {
        fileId,
        fileName: file.name,
        clientChecksum,
        serverChecksum: file.serverChecksum,
        clientModifiedAt,
        serverModifiedAt: file.serverModifiedAt,
        clientSize,
        serverSize: file.serverSize,
        lastModifiedBy: file.lastModifiedBy
      };
    }

    return null; // Client version is newer, no conflict
  }

  /**
   * Resolve a conflict using the specified strategy
   */
  public static async resolveConflict(
    conflictInfo: ConflictInfo,
    strategy: 'keep_both' | 'last_write_wins' | 'use_server_version',
    userId: string,
    clientFilePath?: string
  ): Promise<{ success: boolean; newFileId?: string; message: string }> {
    
    try {
      switch (strategy) {
        case 'keep_both':
          return await this.resolveKeepBoth(conflictInfo, userId, clientFilePath!);
          
        case 'last_write_wins':
          return await this.resolveLastWriteWins(conflictInfo, userId, clientFilePath!);
          
        case 'use_server_version':
          return await this.resolveUseServerVersion(conflictInfo);
          
        default:
          throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
      }
    } catch (error: any) {
      LoggerService.error('conflict', 'Conflict resolution failed', undefined, { error: error.message });
      return {
        success: false,
        message: `Conflict resolution failed: ${error.message}`
      };
    }
  }

  /**
   * Keep both versions - save client version with conflict suffix
   */
  private static async resolveKeepBoth(
    conflictInfo: ConflictInfo,
    userId: string,
    clientFilePath: string
  ): Promise<{ success: boolean; newFileId?: string; message: string }> {
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(conflictInfo.fileName);
    const nameWithoutExt = path.basename(conflictInfo.fileName, ext);
    const conflictFileName = `${nameWithoutExt} (conflict ${timestamp})${ext}`;

    // Get file info for folder placement
    const fileStmt = db.prepare(`
      SELECT folder_id, storage_path FROM files WHERE id = ?
    `);
    const file = fileStmt.get(conflictInfo.fileId) as any;
    
    // Create new file record for conflict version
    const newFileId = crypto.randomUUID();
    const newStoragePath = path.join(
      path.dirname(file.storage_path),
      `${newFileId}${ext}`
    );

    // Copy client file to new location
    const tempPath = `${newStoragePath}.tmp`;
    try {
      fs.copyFileSync(clientFilePath, tempPath);
      fs.renameSync(tempPath, newStoragePath);
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }

    // Insert new file record
    const insertStmt = db.prepare(`
      INSERT INTO files (
        id, owner_id, folder_id, name, original_name, mime_type, 
        size, storage_path, checksum, is_deleted, created_at, updated_at,
        version_count, current_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, 1)
    `);

    const timestamp_ms = Date.now();
    insertStmt.run(
      newFileId,
      userId,
      file.folder_id,
      conflictFileName,
      conflictFileName,
      this.getMimeType(conflictFileName),
      conflictInfo.clientSize,
      newStoragePath,
      conflictInfo.clientChecksum,
      timestamp_ms,
      timestamp_ms
    );

    // Create initial version record
    await versioningService.createVersion(
      newFileId,
      newStoragePath,
      userId,
      'Conflict resolution - client version'
    );

    LoggerService.info('conflict', `Resolved conflict by keeping both versions. New file: ${conflictFileName}`, userId, { conflictFileName, originalFileId: conflictInfo.fileId });

    return {
      success: true,
      newFileId,
      message: `Conflict resolved. Your version saved as "${conflictFileName}"`
    };
  }

  /**
   * Last write wins - overwrite server version, save old as version
   */
  private static async resolveLastWriteWins(
    conflictInfo: ConflictInfo,
    userId: string,
    clientFilePath: string
  ): Promise<{ success: boolean; message: string }> {
    
    // Create version of current server file before overwriting
    await versioningService.createVersion(
      conflictInfo.fileId,
      clientFilePath,
      userId,
      'Conflict resolution - overwritten by client'
    );

    // Update file record with client version info
    const updateStmt = db.prepare(`
      UPDATE files 
      SET size = ?, checksum = ?, updated_at = ?
      WHERE id = ?
    `);
    
    updateStmt.run(
      conflictInfo.clientSize,
      conflictInfo.clientChecksum,
      Date.now(),
      conflictInfo.fileId
    );

    LoggerService.info('conflict', `Resolved conflict using last write wins for file ${conflictInfo.fileId}`, userId, { fileId: conflictInfo.fileId });

    return {
      success: true,
      message: 'Conflict resolved. Your version overwrote the server version.'
    };
  }

  /**
   * Use server version - discard client changes
   */
  private static async resolveUseServerVersion(
    conflictInfo: ConflictInfo
  ): Promise<{ success: boolean; message: string }> {
    
    // Nothing to do - just keep server version as-is
    LoggerService.info('conflict', `Resolved conflict by keeping server version for file ${conflictInfo.fileId}`, undefined, { fileId: conflictInfo.fileId });

    return {
      success: true,
      message: 'Conflict resolved. Server version kept, your changes discarded.'
    };
  }

  /**
   * Get MIME type for file extension
   */
  private static getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.zip': 'application/zip'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get conflict resolution statistics
   */
  public static getConflictStats(): any {
    // This would track conflict resolution statistics
    // For now, return basic info
    return {
      totalConflicts: 0,
      resolvedByKeepBoth: 0,
      resolvedByLastWriteWins: 0,
      resolvedByUseServer: 0
    };
  }
}

export const conflictService = ConflictService;