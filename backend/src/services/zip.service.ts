import archiver from 'archiver';
import { Response } from 'express';
import { db } from '../db/client';
import { File as FileRecord, Folder } from '../db/types';
import { FileService } from './file.service';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface ZipSizeEstimate {
  sizeBytes: number;
  fileName: string;
  fileCount: number;
  encryptedCount: number;
}

export class ZipService {
  /**
   * Stream a folder as a ZIP file without creating temporary files
   * Handles nested folders recursively and preserves folder structure
   */
  static async streamFolderZip(folderId: string | null, userId: string, res: Response): Promise<void> {
    let folder: Folder | null = null;
    let folderName = 'PocketCloud';

    // If folderId provided, verify it exists and is owned by user
    if (folderId) {
      folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(folderId, userId) as Folder;
      if (!folder) {
        throw new NotFoundError('Folder not found');
      }
      folderName = folder.name;
    }

    // Set response headers BEFORE streaming starts
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folderName)}.zip"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');

    // Create archiver instance with no compression for Pi performance
    const archive = archiver('zip', {
      zlib: { level: 0 } // Store only, no compression - critical for Pi performance
    });

    // Handle archiver errors
    archive.on('error', (err) => {
      logger.error('ZIP stream error', { 
        folderId, 
        userId, 
        error: err.message 
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: {
            code: 'ZIP_STREAM_ERROR',
            message: 'Failed to create ZIP stream'
          }
        });
      } else {
        // Headers already sent, can't send error response
        // Just destroy the connection
        res.destroy();
      }
    });

    // Track progress
    let filesAdded = 0;
    let bytesProcessed = 0;

    archive.on('entry', (entry: any) => {
      if (entry.name && !entry.name.endsWith('/')) { // Check if it's a file (not a directory)
        filesAdded++;
        bytesProcessed += entry.stats?.size || 0;
        
        if (filesAdded % 100 === 0) {
          logger.info('ZIP progress', { 
            folderId, 
            filesAdded, 
            bytesProcessed 
          });
        }
      }
    });

    // Pipe archive to response
    archive.pipe(res);

    try {
      // Recursively add folder contents to archive
      await this.addFolderToArchive(archive, folderId, userId, '');

      // Finalize the archive (this triggers the 'end' event)
      await archive.finalize();

      logger.info('ZIP stream completed', {
        folderId,
        userId,
        folderName,
        filesAdded,
        bytesProcessed
      });

    } catch (error: any) {
      logger.error('Error during ZIP creation', {
        folderId,
        userId,
        error: error.message
      });
      
      // If we haven't started streaming yet, we can send an error
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: {
            code: 'ZIP_CREATION_ERROR',
            message: error.message
          }
        });
      } else {
        // Already streaming, just destroy the connection
        res.destroy();
      }
    }
  }
  /**
   * Recursively add folder contents to archive
   */
  private static async addFolderToArchive(
    archive: archiver.Archiver, 
    folderId: string | null, 
    userId: string, 
    zipPath: string
  ): Promise<void> {
    // Get folder contents
    const { files, folders } = await FileService.listFolder(userId, folderId || undefined);

    // Add all files in current folder
    for (const file of files) {
      try {
        // Handle encrypted files
        if (file.is_encrypted === 1) {
          // Add placeholder text file for encrypted files
          const placeholderContent = `This file is encrypted and cannot be included in ZIP download.

File: ${file.name}
Size: ${file.size} bytes
Encrypted: Yes

To access this file:
1. Download it individually from PocketCloud
2. Use the decryption password you set when encrypting it
3. The file will be decrypted in your browser

PocketCloud uses zero-knowledge encryption - the server cannot decrypt your files.`;

          archive.append(Buffer.from(placeholderContent), {
            name: path.join(zipPath, file.name + '.ENCRYPTED.txt'),
            date: new Date(file.created_at)
          });
          continue;
        }

        // Check if file exists on disk
        if (!fs.existsSync(file.storage_path)) {
          logger.warn('File missing from disk, skipping in ZIP', { 
            fileId: file.id, 
            path: file.storage_path 
          });
          
          // Add placeholder for missing file
          const missingContent = `This file is missing from storage and cannot be included in ZIP download.

File: ${file.name}
Original Size: ${file.size} bytes
Last Modified: ${new Date(file.updated_at).toISOString()}

This may indicate a storage issue. Please contact your administrator.`;

          archive.append(Buffer.from(missingContent), {
            name: path.join(zipPath, file.name + '.MISSING.txt'),
            date: new Date(file.created_at)
          });
          continue;
        }

        // Add file to archive with original metadata
        archive.file(file.storage_path, {
          name: path.join(zipPath, file.name),
          date: new Date(file.created_at)
        });

      } catch (error: any) {
        logger.warn('Error adding file to ZIP', {
          fileId: file.id,
          fileName: file.name,
          error: error.message
        });
        
        // Add error placeholder
        const errorContent = `Error adding file to ZIP: ${error.message}

File: ${file.name}
Error: ${error.message}`;

        archive.append(Buffer.from(errorContent), {
          name: path.join(zipPath, file.name + '.ERROR.txt'),
          date: new Date()
        });
      }
    }

    // Recursively add subfolders
    for (const subfolder of folders) {
      const subfolderPath = path.join(zipPath, subfolder.name);
      await this.addFolderToArchive(archive, subfolder.id, userId, subfolderPath);
    }
  }

  /**
   * Stream multiple specific files as a ZIP
   * Used for "Download selected" bulk action
   */
  static async streamMultiFileZip(
    fileIds: string[], 
    userId: string, 
    zipName: string, 
    res: Response
  ): Promise<void> {
    // Validate input
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('File IDs array is required and cannot be empty');
    }

    if (fileIds.length > 500) {
      throw new Error('Cannot download more than 500 files at once');
    }

    // Verify ownership of ALL files before starting
    const files: FileRecord[] = [];
    for (const fileId of fileIds) {
      const file = db.prepare(`
        SELECT * FROM files 
        WHERE id = ? AND owner_id = ? AND is_deleted = 0
      `).get(fileId, userId) as FileRecord;

      if (!file) {
        throw new ForbiddenError(`File not found or access denied: ${fileId}`);
      }

      files.push(file);
    }

    // Set response headers
    const sanitizedZipName = zipName.replace(/[^a-zA-Z0-9\-_\s]/g, '').trim() || 'files';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(sanitizedZipName)}.zip"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');

    // Create archiver instance
    const archive = archiver('zip', {
      zlib: { level: 0 } // No compression for Pi performance
    });

    // Handle archiver errors
    archive.on('error', (err) => {
      logger.error('Multi-file ZIP stream error', { 
        fileIds: fileIds.slice(0, 5), // Log first 5 IDs only
        fileCount: fileIds.length,
        userId, 
        error: err.message 
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: {
            code: 'ZIP_STREAM_ERROR',
            message: 'Failed to create ZIP stream'
          }
        });
      } else {
        res.destroy();
      }
    });

    // Pipe archive to response
    archive.pipe(res);

    try {
      let filesAdded = 0;
      const fileNameCounts = new Map<string, number>();

      // Add each file to archive
      for (const file of files) {
        try {
          // Handle encrypted files
          if (file.is_encrypted === 1) {
            const placeholderContent = `This file is encrypted and cannot be included in ZIP download.

File: ${file.name}
Size: ${file.size} bytes
Encrypted: Yes

To access this file, download it individually from PocketCloud and decrypt with your password.`;

            let fileName = file.name + '.ENCRYPTED.txt';
            
            // Handle duplicate names
            const count = fileNameCounts.get(fileName) || 0;
            if (count > 0) {
              const ext = path.extname(fileName);
              const base = path.basename(fileName, ext);
              fileName = `${base}_${count}${ext}`;
            }
            fileNameCounts.set(fileName, count + 1);

            archive.append(Buffer.from(placeholderContent), {
              name: fileName,
              date: new Date(file.created_at)
            });
            filesAdded++;
            continue;
          }

          // Check if file exists on disk
          if (!fs.existsSync(file.storage_path)) {
            logger.warn('File missing from disk in multi-file ZIP', { 
              fileId: file.id, 
              path: file.storage_path 
            });
            continue; // Skip missing files in multi-file download
          }

          // Handle duplicate file names
          let fileName = file.name;
          const count = fileNameCounts.get(fileName) || 0;
          if (count > 0) {
            const ext = path.extname(fileName);
            const base = path.basename(fileName, ext);
            fileName = `${base}_${count}${ext}`;
          }
          fileNameCounts.set(file.name, count + 1);

          // Add file to archive
          archive.file(file.storage_path, {
            name: fileName,
            date: new Date(file.created_at)
          });
          filesAdded++;

        } catch (error: any) {
          logger.warn('Error adding file to multi-file ZIP', {
            fileId: file.id,
            fileName: file.name,
            error: error.message
          });
        }
      }

      // Finalize the archive
      await archive.finalize();

      logger.info('Multi-file ZIP stream completed', {
        requestedFiles: fileIds.length,
        filesAdded,
        userId,
        zipName: sanitizedZipName
      });

    } catch (error: any) {
      logger.error('Error during multi-file ZIP creation', {
        fileIds: fileIds.slice(0, 5),
        fileCount: fileIds.length,
        userId,
        error: error.message
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: {
            code: 'ZIP_CREATION_ERROR',
            message: error.message
          }
        });
      } else {
        res.destroy();
      }
    }
  }

  /**
   * Get estimated ZIP size for a folder without creating the ZIP
   * Returns sum of file sizes (no compression assumed)
   */
  static async getZipSizeEstimate(folderId: string | null, userId: string): Promise<ZipSizeEstimate> {
    let folder: Folder | null = null;
    let folderName = 'PocketCloud';

    // If folderId provided, verify it exists and is owned by user
    if (folderId) {
      folder = db.prepare('SELECT * FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(folderId, userId) as Folder;
      if (!folder) {
        throw new NotFoundError('Folder not found');
      }
      folderName = folder.name;
    }

    // Get all files in folder and subfolders using recursive CTE
    const stats = db.prepare(`
      WITH RECURSIVE folder_tree(id) AS (
        SELECT ? as id
        UNION ALL
        SELECT f.id FROM folders f
        INNER JOIN folder_tree ft ON f.parent_id = ft.id
        WHERE f.owner_id = ? AND f.is_deleted = 0
      )
      SELECT 
        COUNT(*) as file_count,
        SUM(CASE WHEN is_encrypted = 0 THEN size ELSE 0 END) as total_size,
        SUM(CASE WHEN is_encrypted = 1 THEN 1 ELSE 0 END) as encrypted_count
      FROM files 
      WHERE folder_id IN (SELECT id FROM folder_tree) 
        AND owner_id = ? 
        AND is_deleted = 0
    `).get(folderId, userId, userId) as {
      file_count: number;
      total_size: number;
      encrypted_count: number;
    };

    // Add estimated size for placeholder files (encrypted and missing files)
    const placeholderSize = 500; // Estimated bytes per placeholder text file
    const estimatedPlaceholderBytes = (stats.encrypted_count || 0) * placeholderSize;

    return {
      sizeBytes: (stats.total_size || 0) + estimatedPlaceholderBytes,
      fileName: `${folderName}.zip`,
      fileCount: stats.file_count || 0,
      encryptedCount: stats.encrypted_count || 0
    };
  }

  /**
   * Get estimated ZIP size for multiple specific files
   */
  static async getMultiFileZipSizeEstimate(fileIds: string[], userId: string): Promise<ZipSizeEstimate> {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('File IDs array is required and cannot be empty');
    }

    if (fileIds.length > 500) {
      throw new Error('Cannot estimate size for more than 500 files at once');
    }

    // Get file sizes
    const placeholders = fileIds.map(() => '?').join(',');
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as file_count,
        SUM(CASE WHEN is_encrypted = 0 THEN size ELSE 0 END) as total_size,
        SUM(CASE WHEN is_encrypted = 1 THEN 1 ELSE 0 END) as encrypted_count
      FROM files 
      WHERE id IN (${placeholders}) 
        AND owner_id = ? 
        AND is_deleted = 0
    `).get(...fileIds, userId) as {
      file_count: number;
      total_size: number;
      encrypted_count: number;
    };

    // Verify all files were found and owned by user
    if ((stats.file_count || 0) !== fileIds.length) {
      throw new ForbiddenError('Some files not found or access denied');
    }

    const placeholderSize = 500;
    const estimatedPlaceholderBytes = (stats.encrypted_count || 0) * placeholderSize;

    return {
      sizeBytes: (stats.total_size || 0) + estimatedPlaceholderBytes,
      fileName: 'files.zip',
      fileCount: stats.file_count || 0,
      encryptedCount: stats.encrypted_count || 0
    };
  }
}