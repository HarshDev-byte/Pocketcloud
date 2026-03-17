import { db } from '../db/client';
import { UploadSession, File as FileRecord } from '../db/types';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import { DedupService } from './dedup.service';

const CHUNK_SIZE_BYTES = parseInt(process.env.CHUNK_SIZE_BYTES || '5242880'); // 5MB
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_BYTES || '53687091200'); // 50GB

interface InitUploadParams {
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
  folderId?: string;
}

interface InitUploadResult {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

interface ChunkResult {
  received: number;
  progress: string;
}

interface ProgressResult {
  uploadId: string;
  totalChunks: number;
  receivedChunks: number[];
}

export class UploadService {
  // Track active uploads for graceful shutdown
  private static activeUploads = new Set<string>();

  static getActiveUploadCount(): number {
    return this.activeUploads.size;
  }

  static async initUpload(userId: string, params: InitUploadParams): Promise<InitUploadResult> {
    // Validate filename
    const filename = params.filename.replace(/[/\\]/g, '').trim();
    if (!filename || filename.length > 255) {
      throw new Error('INVALID_FILENAME');
    }

    // Validate size
    if (params.size <= 0 || params.size > MAX_FILE_SIZE_BYTES) {
      throw new Error('INVALID_FILE_SIZE');
    }

    // Validate mime type
    if (!params.mimeType || typeof params.mimeType !== 'string') {
      throw new Error('INVALID_MIME_TYPE');
    }

    // Validate checksum (64-char hex string)
    if (!/^[a-f0-9]{64}$/i.test(params.checksum)) {
      throw new Error('INVALID_CHECKSUM');
    }

    // Validate folder if provided
    if (params.folderId) {
      const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0').get(params.folderId, userId);
      if (!folder) {
        throw new Error('FOLDER_NOT_FOUND');
      }
    }

    // Check user quota
    const { QuotaService } = require('./quota.service');
    QuotaService.checkUploadAllowed(userId, params.size);

    // Check disk space using disk.utils
    const { assertSufficientSpace } = require('../utils/disk.utils');
    assertSufficientSpace(params.size * 1.1); // Add 10% buffer for temp files

    const uploadId = uuidv4();
    const totalChunks = Math.ceil(params.size / CHUNK_SIZE_BYTES);

    // Create temp directory
    const tempDir = path.join(process.env.UPLOAD_TEMP_DIR!, uploadId);
    fs.mkdirSync(tempDir, { recursive: true });

    // Insert upload session record with status
    const now = Date.now();
    const expiresAt = now + (24 * 60 * 60 * 1000); // 24 hours

    db.prepare(`
      INSERT INTO upload_sessions (
        id, user_id, folder_id, filename, mime_type, total_size,
        chunk_size, total_chunks, received_chunks, checksum,
        temp_dir, created_at, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uploadId,
      userId,
      params.folderId || null,
      filename,
      params.mimeType,
      params.size,
      CHUNK_SIZE_BYTES,
      totalChunks,
      '[]',
      params.checksum.toLowerCase(),
      tempDir,
      now,
      expiresAt,
      'active'
    );

    logger.info('Upload session initialized', {
      uploadId,
      userId,
      filename,
      size: params.size,
      totalChunks
    });

    return {
      uploadId,
      chunkSize: CHUNK_SIZE_BYTES,
      totalChunks
    };
  }

  static async saveChunk(uploadId: string, chunkIndex: number, data: Buffer): Promise<ChunkResult> {
    // Track this upload as active
    this.activeUploads.add(uploadId);

    // Get upload session
    const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(uploadId) as UploadSession;
    if (!session) {
      throw new Error('UPLOAD_SESSION_NOT_FOUND');
    }

    // Check if session was interrupted
    if (session.status === 'interrupted') {
      throw new Error('UPLOAD_INTERRUPTED');
    }

    // Check if expired
    if (Date.now() > session.expires_at) {
      throw new Error('UPLOAD_SESSION_EXPIRED');
    }

    // Parse received chunks
    const receivedChunks = JSON.parse(session.received_chunks) as number[];

    // Check if chunk already received (idempotent)
    if (receivedChunks.includes(chunkIndex)) {
      return {
        received: chunkIndex,
        progress: `${receivedChunks.length}/${session.total_chunks}`
      };
    }

    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= session.total_chunks) {
      throw new Error('INVALID_CHUNK_INDEX');
    }

    // Validate chunk size
    const isLastChunk = chunkIndex === session.total_chunks - 1;
    const expectedSize = isLastChunk 
      ? session.total_size - (chunkIndex * session.chunk_size)
      : session.chunk_size;

    if (data.length !== expectedSize) {
      throw new Error(`INVALID_CHUNK_SIZE: expected ${expectedSize}, got ${data.length}`);
    }

    // Write chunk to disk
    const chunkPath = path.join(session.temp_dir, `chunk_${String(chunkIndex).padStart(6, '0')}`);
    try {
      fs.writeFileSync(chunkPath, data, { flag: 'wx' });
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // Chunk already exists, treat as idempotent
        return {
          received: chunkIndex,
          progress: `${receivedChunks.length}/${session.total_chunks}`
        };
      }
      throw error;
    }

    // Update received chunks in database
    const updatedChunks = [...receivedChunks, chunkIndex].sort((a, b) => a - b);
    db.prepare('UPDATE upload_sessions SET received_chunks = ? WHERE id = ?').run(
      JSON.stringify(updatedChunks),
      uploadId
    );

    logger.info('Chunk received', {
      uploadId,
      chunkIndex,
      size: data.length,
      progress: `${updatedChunks.length}/${session.total_chunks}`
    });

    // Emit progress events (async, don't block response)
    setImmediate(() => {
      try {
        const { RealtimeService, WS_EVENTS } = require('./realtime.service');
        
        // Emit progress every 5% or every 10 chunks
        const percent = Math.floor((updatedChunks.length / session.total_chunks) * 100);
        if (percent % 5 === 0 || updatedChunks.length % 10 === 0) {
          RealtimeService.sendToUser(session.user_id, WS_EVENTS.UPLOAD_PROGRESS, {
            uploadId,
            percent,
            receivedChunks: updatedChunks.length,
            totalChunks: session.total_chunks,
            filename: session.filename
          });
        }
      } catch (error: any) {
        logger.warn('Failed to emit upload progress', { 
          uploadId, 
          error: error.message 
        });
      }
    });

    return {
      received: chunkIndex,
      progress: `${updatedChunks.length}/${session.total_chunks}`
    };
  }

  static async completeUpload(uploadId: string, userId: string): Promise<FileRecord> {
    // Track this upload as active
    this.activeUploads.add(uploadId);

    let finalStoragePath: string = ''; // Declare in outer scope for cleanup

    try {
      // Get upload session
      const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?').get(uploadId, userId) as UploadSession;
      if (!session) {
        throw new Error('UPLOAD_SESSION_NOT_FOUND');
      }

      // Check all chunks received
      const receivedChunks = JSON.parse(session.received_chunks) as number[];
      const expectedChunks = Array.from({ length: session.total_chunks }, (_, i) => i);
      const missingChunks = expectedChunks.filter(i => !receivedChunks.includes(i));

      if (missingChunks.length > 0) {
        throw new Error(`MISSING_CHUNKS: ${missingChunks.join(',')}`);
      }

      // Determine temporary assembly path
      const fileId = uuidv4();
      const ext = path.extname(session.filename);
      const tempAssemblyPath = path.join(session.temp_dir, `assembled${ext}`);

      // Assemble file using streams (memory efficient) and verify checksum
      const writeStream = fs.createWriteStream(tempAssemblyPath);
      const hash = crypto.createHash('sha256');

      let finalFileRecord: FileRecord | null = null;

      for (let i = 0; i < session.total_chunks; i++) {
        const chunkPath = path.join(session.temp_dir, `chunk_${String(i).padStart(6, '0')}`);
        const chunkData = fs.readFileSync(chunkPath);
        hash.update(chunkData);
        writeStream.write(chunkData);
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Validate checksum
      const actualChecksum = hash.digest('hex');
      if (actualChecksum !== session.checksum) {
        fs.unlinkSync(tempAssemblyPath); // Remove bad file
        throw new Error('CHECKSUM_MISMATCH');
      }

      // Validate MIME type (detect actual type from file content)
      const { detectMimeType, isMimeTypeTrusted } = require('../utils/mimetype.utils');
      const actualMime = await detectMimeType(tempAssemblyPath);
      
      if (!isMimeTypeTrusted(session.mime_type, actualMime)) {
        fs.unlinkSync(tempAssemblyPath);
        throw new Error(`MIME_MISMATCH: File content (${actualMime}) does not match declared type (${session.mime_type})`);
      }

      // Use actual detected MIME type in DB (more reliable than client claim)
      const finalMimeType = actualMime !== 'application/octet-stream' ? actualMime : session.mime_type;

      // Check disk space before moving file
      const { assertSufficientSpace } = require('../utils/disk.utils');
      assertSufficientSpace(session.total_size);

      // DEDUPLICATION: Check if this content already exists
      const duplicate = DedupService.findDuplicate(actualChecksum);

      if (duplicate) {
        // DUPLICATE FOUND - reuse existing storage
        finalStoragePath = duplicate.storage_path;
        DedupService.incrementRef(actualChecksum);
        
        // Delete the assembled temp file (not needed)
        fs.unlinkSync(tempAssemblyPath);
        
        logger.info('Deduplication hit - reusing existing file', {
          uploadId,
          checksum: actualChecksum.substring(0, 16) + '...',
          existingPath: finalStoragePath,
          savedBytes: session.total_size
        });
      } else {
        // UNIQUE FILE - store it
        const date = new Date();
        finalStoragePath = path.join(
          process.env.STORAGE_PATH!,
          session.user_id,
          String(date.getFullYear()),
          String(date.getMonth() + 1).padStart(2, '0'),
          `${fileId}${ext}`
        );

        // Ensure storage directory exists
        fs.mkdirSync(path.dirname(finalStoragePath), { recursive: true });
        
        // Move assembled file to final storage location
        fs.renameSync(tempAssemblyPath, finalStoragePath);
        
        // Register content in dedup store
        DedupService.registerContent(actualChecksum, finalStoragePath, session.total_size);
        
        logger.info('New unique file stored', {
          uploadId,
          checksum: actualChecksum.substring(0, 16) + '...',
          storagePath: finalStoragePath,
          size: session.total_size
        });
      }

      // Check if file with same name already exists in same folder
      const { VersioningService } = require('./versioning.service');
      const existingFile = await VersioningService.checkForExistingFile(
        session.user_id, 
        session.filename, 
        session.folder_id
      );

      if (existingFile) {
        // File exists - create version and update existing record
        await VersioningService.createVersion(
          existingFile.id,
          finalStoragePath,
          session.total_size,
          actualChecksum,
          session.user_id,
          `Upload ${new Date().toISOString().slice(0, 19)}`
        );

        // Update existing file record with new content checksum
        db.prepare(`
          UPDATE files 
          SET content_checksum = ?, storage_path = ?, checksum = ?, size = ?, updated_at = ?
          WHERE id = ?
        `).run(actualChecksum, finalStoragePath, actualChecksum, session.total_size, Date.now(), existingFile.id);

        // Get updated file record
        finalFileRecord = db.prepare('SELECT * FROM files WHERE id = ?').get(existingFile.id) as FileRecord;

        // Clean up temp directory
        fs.rmSync(session.temp_dir, { recursive: true, force: true });

        // Delete upload session
        db.prepare('DELETE FROM upload_sessions WHERE id = ?').run(uploadId);

        logger.info('Upload completed with versioning', {
          uploadId,
          fileId: existingFile.id,
          filename: session.filename,
          size: session.total_size,
          newVersion: finalFileRecord.current_version,
          deduplicated: !!duplicate
        });
      } else {
        // New file - create file record
        const now = Date.now();
        const fileRecord: Omit<FileRecord, 'id'> & { id: string } = {
          id: fileId,
          owner_id: session.user_id,
          folder_id: session.folder_id,
          name: session.filename,
          original_name: session.filename,
          mime_type: finalMimeType, // Use detected MIME type
          size: session.total_size,
          storage_path: finalStoragePath,
          checksum: actualChecksum,
          content_checksum: actualChecksum, // Add content checksum for deduplication
          is_deleted: 0,
          deleted_at: null,
          created_at: now,
          updated_at: now,
          version_count: 1,
          current_version: 1,
          is_encrypted: 0 // Default to not encrypted
        };

        const insertFile = db.prepare(`
          INSERT INTO files (
            id, owner_id, folder_id, name, original_name, mime_type,
            size, storage_path, checksum, content_checksum, is_deleted, deleted_at,
            created_at, updated_at, version_count, current_version, is_encrypted
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const deleteSession = db.prepare('DELETE FROM upload_sessions WHERE id = ?');

        db.transaction(() => {
          insertFile.run(
            fileRecord.id,
            fileRecord.owner_id,
            fileRecord.folder_id,
            fileRecord.name,
            fileRecord.original_name,
            fileRecord.mime_type,
            fileRecord.size,
            fileRecord.storage_path,
            fileRecord.checksum,
            fileRecord.content_checksum,
            fileRecord.is_deleted,
            fileRecord.deleted_at,
            fileRecord.created_at,
            fileRecord.updated_at,
            fileRecord.version_count,
            fileRecord.current_version,
            fileRecord.is_encrypted
          );
          deleteSession.run(uploadId);
        })();

        // Clean up temp directory
        fs.rmSync(session.temp_dir, { recursive: true, force: true });

        finalFileRecord = fileRecord as FileRecord;

        logger.info('Upload completed successfully', {
          uploadId,
          fileId,
          filename: session.filename,
          size: session.total_size,
          checksum: actualChecksum,
          deduplicated: !!duplicate
        });
      }

      // Index content for search (async, don't block response)
      setImmediate(async () => {
        try {
          const { SearchService } = require('./search.service');
          const preview = SearchService.extractContentPreview(finalStoragePath, session.mime_type);
          if (preview) {
            await SearchService.indexFileContent(finalFileRecord!.id, preview);
          }
        } catch (error: any) {
          logger.warn('Failed to index file content for search', { 
            fileId: finalFileRecord!.id, 
            error: error.message 
          });
        }
      });

      // Queue media processing (async, don't block response)
      setImmediate(async () => {
        try {
          const { MediaService } = require('./media.service');
          await MediaService.enqueueFile(finalFileRecord!.id, session.mime_type);
        } catch (error: any) {
          logger.warn('Failed to enqueue media processing', { 
            fileId: finalFileRecord!.id, 
            error: error.message 
          });
        }
      });

      // Emit real-time events
      setImmediate(() => {
        try {
          const { RealtimeService, WS_EVENTS } = require('./realtime.service');
          
          // Notify user of file creation
          RealtimeService.sendToUser(session.user_id, WS_EVENTS.FILE_CREATED, {
            file: finalFileRecord,
            folderId: finalFileRecord!.folder_id
          });
          
          // Notify user of upload completion
          RealtimeService.sendToUser(session.user_id, WS_EVENTS.UPLOAD_COMPLETE, {
            uploadId,
            file: finalFileRecord
          });
          
          // Send storage update (debounced)
          RealtimeService.sendStorageUpdate(session.user_id);
        } catch (error: any) {
          logger.warn('Failed to emit real-time events', { 
            uploadId, 
            error: error.message 
          });
        }
      });

      // Fire webhooks
      setImmediate(() => {
        try {
          const { WebhookService } = require('./webhook.service');
          WebhookService.fireEvent(session.user_id, 'upload.complete', {
            file: {
              id: finalFileRecord!.id,
              name: finalFileRecord!.name,
              size: finalFileRecord!.size,
              mimeType: finalFileRecord!.mime_type,
              checksum: finalFileRecord!.checksum
            }
          });
        } catch (error: any) {
          logger.warn('Failed to fire webhook', { 
            uploadId, 
            error: error.message 
          });
        }
      });

      // Record sync event
      if (finalFileRecord!.folder_id) {
        setImmediate(() => {
          try {
            const { SyncService } = require('./sync.service');
            SyncService.recordSyncEvent(
              finalFileRecord!.folder_id!,
              'created',
              finalFileRecord!.id
            );
          } catch (error: any) {
            logger.warn('Failed to record sync event', { 
              fileId: finalFileRecord!.id, 
              error: error.message 
            });
          }
        });
      }

      // Record upload statistics for analytics
      setImmediate(() => {
        try {
          const { AnalyticsService } = require('./analytics.service');
          AnalyticsService.recordUploadStat(session.user_id, finalFileRecord!.size);
        } catch (error: any) {
          logger.warn('Failed to record upload stat', { 
            fileId: finalFileRecord!.id, 
            error: error.message 
          });
        }
      });

      // Run pipeline rules
      setImmediate(() => {
        try {
          const { PipelineService } = require('./pipeline.service');
          PipelineService.runRulesForFile(finalFileRecord!.id, session.user_id, 'upload');
        } catch (error: any) {
          logger.warn('Failed to run pipeline rules', { 
            fileId: finalFileRecord!.id, 
            error: error.message 
          });
        }
      });

      return finalFileRecord;

    } catch (error) {
      // Clean up on error
      if (finalStoragePath && fs.existsSync(finalStoragePath)) {
        fs.unlinkSync(finalStoragePath);
      }
      throw error;
    } finally {
      // Always remove from active uploads
      this.activeUploads.delete(uploadId);
    }
  }

  static async abortUpload(uploadId: string, userId: string): Promise<void> {
    try {
      // Get upload session
      const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?').get(uploadId, userId) as UploadSession;
      if (!session) {
        throw new Error('UPLOAD_SESSION_NOT_FOUND');
      }

      // Remove temp directory
      if (fs.existsSync(session.temp_dir)) {
        fs.rmSync(session.temp_dir, { recursive: true, force: true });
      }

      // Delete upload session record
      db.prepare('DELETE FROM upload_sessions WHERE id = ?').run(uploadId);

      logger.info('Upload aborted', { uploadId, userId });
    } finally {
      // Always remove from active uploads
      this.activeUploads.delete(uploadId);
    }
  }

  static async getProgress(uploadId: string, userId: string): Promise<ProgressResult> {
    // Get upload session
    const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ? AND user_id = ?').get(uploadId, userId) as UploadSession;
    if (!session) {
      throw new Error('UPLOAD_SESSION_NOT_FOUND');
    }

    // Check if session was interrupted
    if (session.status === 'interrupted') {
      throw new Error('UPLOAD_INTERRUPTED: Upload was interrupted by server restart. Please restart the upload.');
    }

    const receivedChunks = JSON.parse(session.received_chunks) as number[];

    return {
      uploadId,
      totalChunks: session.total_chunks,
      receivedChunks
    };
  }

  static async cleanStalledUploads(): Promise<{ cleaned: number }> {
    const now = Date.now();
    const stalledSessions = db.prepare('SELECT * FROM upload_sessions WHERE expires_at < ?').all(now) as UploadSession[];

    let cleaned = 0;
    for (const session of stalledSessions) {
      try {
        // Remove temp directory
        if (fs.existsSync(session.temp_dir)) {
          fs.rmSync(session.temp_dir, { recursive: true, force: true });
        }

        // Delete session record
        db.prepare('DELETE FROM upload_sessions WHERE id = ?').run(session.id);
        cleaned++;

        logger.info('Cleaned stalled upload', { uploadId: session.id });
      } catch (error) {
        logger.error('Failed to clean stalled upload', { uploadId: session.id, error });
      }
    }

    return { cleaned };
  }
}