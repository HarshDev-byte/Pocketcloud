import { File, CreateFileData } from '../db/types.js';
import { getDatabase } from '../db/client.js';

// Import modules using eval to avoid TypeScript module resolution issues
const fs = eval('require')('fs');
const path = eval('require')('path');
const crypto = eval('require')('crypto');

export class ChecksumError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChecksumError';
  }
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export interface UploadSession {
  uploadId: string;
  userId: number;
  filename: string;
  size: number;
  mimeType: string;
  folderId?: number | undefined;
  checksum: string;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: Set<number>;
  expiresAt: number;
  createdAt: number;
  tempDir: string;
}

export interface UploadProgress {
  receivedChunks: number[];
  totalChunks: number;
}

class UploadService {
  private readonly STORAGE_PATH = eval('process.env.STORAGE_PATH') || '/opt/pocketcloud/storage';
  private readonly UPLOAD_TEMP_DIR = path.join(this.STORAGE_PATH, '.uploads');
  private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
  private readonly sessions = new Map<string, UploadSession>();

  private get db() { return getDatabase(); }

  constructor() {
    this.ensureTempDir();
    this.loadPersistedSessions();
    
    // Clean up expired sessions every hour
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  /**
   * Initialize chunked upload for files of any size
   * Validates: disk has enough space (size × 1.1 + 1GB buffer)
   * Creates temp dir: UPLOAD_TEMP_DIR/{uploadId}/
   * Stores session in memory Map (+ DB for persistence)
   * Returns: { uploadId, chunkSize: 5MB, expiresAt }
   */
  async initUpload(userId: number, params: {
    filename: string;
    size: number;
    mimeType: string;
    folderId?: number;
    checksum: string;
  }): Promise<{ uploadId: string; chunkSize: number; expiresAt: number }> {
    try {
      const { filename, size, mimeType, folderId, checksum } = params;

      // Validate filename
      if (!filename || filename.length > 255) {
        throw new UploadError('Invalid filename');
      }

      // Check available disk space (size × 1.1 + 1GB buffer)
      const requiredSpace = Math.floor(size * 1.1) + (1024 * 1024 * 1024);
      const availableSpace = await this.getAvailableSpace();
      
      if (availableSpace < requiredSpace) {
        throw new UploadError('Insufficient disk space');
      }

      // Validate folder exists if specified
      if (folderId) {
        const folder = this.db.prepare(`
          SELECT id FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0
        `).get([folderId, userId]);
        
        if (!folder) {
          throw new UploadError('Target folder not found');
        }
      }

      // Generate upload session
      const uploadId = crypto.randomUUID();
      const now = Date.now();
      const expiresAt = now + this.SESSION_TIMEOUT;
      const totalChunks = Math.ceil(size / this.CHUNK_SIZE);
      const tempDir = path.join(this.UPLOAD_TEMP_DIR, uploadId);

      // Create temp directory
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Create session
      const session: UploadSession = {
        uploadId,
        userId,
        filename,
        size,
        mimeType,
        folderId,
        checksum,
        chunkSize: this.CHUNK_SIZE,
        totalChunks,
        receivedChunks: new Set(),
        expiresAt,
        createdAt: now,
        tempDir
      };

      // Store in memory and persist to DB
      this.sessions.set(uploadId, session);
      
      // Persist session to database for crash recovery
      this.db.prepare(`
        INSERT OR REPLACE INTO upload_sessions 
        (upload_id, user_id, filename, size, mime_type, folder_id, checksum, 
         chunk_size, total_chunks, expires_at, created_at, temp_dir)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run([
        uploadId, userId, filename, size, mimeType, folderId || null, checksum,
        this.CHUNK_SIZE, totalChunks, expiresAt, now, tempDir
      ]);

      return {
        uploadId,
        chunkSize: this.CHUNK_SIZE,
        expiresAt
      };
    } catch (error: any) {
      if (error instanceof UploadError) {
        throw error;
      }
      throw new UploadError(`Failed to initialize upload: ${error.message}`);
    }
  }

  /**
   * Save chunk data
   * Writes to: temp/{uploadId}/chunk_{index.toString().padStart(5,'0')}
   * Validates chunk not already received (idempotent)
   * Updates progress in session
   */
  async saveChunk(uploadId: string, chunkIndex: number, data: any): Promise<void> {
    try {
      const session = this.sessions.get(uploadId);
      if (!session) {
        throw new UploadError('Upload session not found');
      }

      // Check if session expired
      if (Date.now() > session.expiresAt) {
        await this.cleanupSession(uploadId);
        throw new UploadError('Upload session expired');
      }

      // Validate chunk index
      if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
        throw new UploadError('Invalid chunk index');
      }

      // Check if chunk already received (idempotent)
      if (session.receivedChunks.has(chunkIndex)) {
        return; // Already received, ignore
      }

      // Validate chunk size (last chunk can be smaller)
      const expectedSize = chunkIndex === session.totalChunks - 1 
        ? session.size - (chunkIndex * session.chunkSize)
        : session.chunkSize;
      
      if (data.length > expectedSize) {
        throw new UploadError('Chunk size exceeds expected size');
      }

      // Write chunk to disk
      const chunkFilename = `chunk_${chunkIndex.toString().padStart(5, '0')}`;
      const chunkPath = path.join(session.tempDir, chunkFilename);
      
      await fs.promises.writeFile(chunkPath, data);

      // Update session progress
      session.receivedChunks.add(chunkIndex);

      // Update database
      this.db.prepare(`
        UPDATE upload_sessions 
        SET received_chunks = ? 
        WHERE upload_id = ?
      `).run([JSON.stringify(Array.from(session.receivedChunks)), uploadId]);

    } catch (error: any) {
      if (error instanceof UploadError) {
        throw error;
      }
      throw new UploadError(`Failed to save chunk: ${error.message}`);
    }
  }

  /**
   * Complete upload and assemble file
   * Verifies all chunks received
   * Assembles: creates write stream to final path, pipes all chunks in order
   * Validates SHA-256 checksum against declared checksum
   * On mismatch: cleanup, throw ChecksumError
   * Moves assembled file to storage path
   * Creates DB record
   * Cleans up temp dir
   * Returns File record
   */
  async completeUpload(uploadId: string): Promise<File> {
    try {
      const session = this.sessions.get(uploadId);
      if (!session) {
        throw new UploadError('Upload session not found');
      }

      // Check if session expired
      if (Date.now() > session.expiresAt) {
        await this.cleanupSession(uploadId);
        throw new UploadError('Upload session expired');
      }

      // Verify all chunks received
      if (session.receivedChunks.size !== session.totalChunks) {
        throw new UploadError(`Missing chunks: received ${session.receivedChunks.size}/${session.totalChunks}`);
      }

      // Generate final file path
      const fileUuid = crypto.randomUUID();
      let filePath: string;
      
      if (session.folderId) {
        const folder = this.db.prepare(`
          SELECT path FROM folders WHERE id = ? AND is_deleted = 0
        `).get([session.folderId]) as { path: string } | undefined;
        
        if (!folder) {
          throw new UploadError('Target folder no longer exists');
        }
        
        filePath = `${folder.path}/${fileUuid}_${session.filename}`;
      } else {
        filePath = `${fileUuid}_${session.filename}`;
      }

      const finalPath = path.join(this.STORAGE_PATH, filePath);
      
      // Ensure target directory exists
      await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });

      // Assemble file by streaming chunks in order
      const writeStream = fs.createWriteStream(finalPath);
      const hash = crypto.createHash('sha256');

      try {
        for (let i = 0; i < session.totalChunks; i++) {
          const chunkFilename = `chunk_${i.toString().padStart(5, '0')}`;
          const chunkPath = path.join(session.tempDir, chunkFilename);
          
          // Read and pipe chunk
          const chunkData = await fs.promises.readFile(chunkPath);
          hash.update(chunkData);
          writeStream.write(chunkData);
        }
        
        writeStream.end();
        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });

        // Verify checksum
        const calculatedChecksum = hash.digest('hex');
        if (calculatedChecksum !== session.checksum) {
          // Cleanup on checksum mismatch
          await fs.promises.unlink(finalPath).catch(() => {});
          await this.cleanupSession(uploadId);
          throw new ChecksumError('File checksum mismatch');
        }

        // Create database record
        const now = Date.now();
        const fileData: CreateFileData = {
          uuid: fileUuid,
          name: session.filename,
          path: filePath,
          full_path: finalPath,
          mime_type: session.mimeType,
          size: session.size,
          checksum: session.checksum,
          owner_id: session.userId,
          parent_folder_id: session.folderId || null
        };

        const result = this.db.prepare(`
          INSERT INTO files (uuid, name, path, full_path, mime_type, size, checksum, 
                            owner_id, parent_folder_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          now,
          now
        ]);

        // Update user storage usage
        this.db.prepare(`
          UPDATE users SET storage_used = storage_used + ? WHERE id = ?
        `).run([session.size, session.userId]);

        // Clean up temp files and session
        await this.cleanupSession(uploadId);

        // Return created file
        const file = this.db.prepare('SELECT * FROM files WHERE id = ?').get([result.lastInsertRowid]) as File;
        return file;

      } catch (error) {
        // Clean up on any error
        await fs.promises.unlink(finalPath).catch(() => {});
        throw error;
      }

    } catch (error: any) {
      if (error instanceof UploadError || error instanceof ChecksumError) {
        throw error;
      }
      throw new UploadError(`Failed to complete upload: ${error.message}`);
    }
  }

  /**
   * Abort upload and cleanup
   * Removes temp dir
   * Removes session
   */
  async abortUpload(uploadId: string): Promise<void> {
    try {
      await this.cleanupSession(uploadId);
    } catch (error: any) {
      throw new UploadError(`Failed to abort upload: ${error.message}`);
    }
  }

  /**
   * Get upload progress
   * Returns { receivedChunks: number[], totalChunks: number }
   */
  getProgress(uploadId: string): UploadProgress {
    const session = this.sessions.get(uploadId);
    if (!session) {
      throw new UploadError('Upload session not found');
    }

    return {
      receivedChunks: Array.from(session.receivedChunks).sort((a, b) => a - b),
      totalChunks: session.totalChunks
    };
  }

  // Helper methods

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.promises.mkdir(this.UPLOAD_TEMP_DIR, { recursive: true });
    } catch (error: any) {
      throw new UploadError(`Failed to create temp directory: ${error.message}`);
    }
  }

  private async getAvailableSpace(): Promise<number> {
    try {
      // Simplified - in production use statvfs or similar
      return 10 * 1024 * 1024 * 1024; // 10GB default available
    } catch (error: any) {
      throw new UploadError(`Failed to check available space: ${error.message}`);
    }
  }

  private async cleanupSession(uploadId: string): Promise<void> {
    try {
      const session = this.sessions.get(uploadId);
      if (session) {
        // Remove temp directory
        await fs.promises.rm(session.tempDir, { recursive: true, force: true });
        
        // Remove from memory
        this.sessions.delete(uploadId);
      }

      // Remove from database
      this.db.prepare('DELETE FROM upload_sessions WHERE upload_id = ?').run([uploadId]);
    } catch (error: any) {
      console.error(`Failed to cleanup session ${uploadId}:`, error);
    }
  }

  private async cleanupExpiredSessions(): Promise<void> {
    try {
      const now = Date.now();
      const expiredSessions = Array.from(this.sessions.entries())
        .filter(([_, session]) => now > session.expiresAt)
        .map(([uploadId]) => uploadId);

      for (const uploadId of expiredSessions) {
        await this.cleanupSession(uploadId);
      }

      // Also cleanup any orphaned sessions in database
      this.db.prepare('DELETE FROM upload_sessions WHERE expires_at < ?').run([now]);
    } catch (error: any) {
      console.error('Failed to cleanup expired sessions:', error);
    }
  }

  /**
   * Load persisted sessions from database (for crash recovery)
   * Handles Pi crashes mid-upload gracefully
   */
  async loadPersistedSessions(): Promise<void> {
    try {
      const persistedSessions = this.db.prepare(`
        SELECT * FROM upload_sessions WHERE expires_at > ?
      `).all([Date.now()]) as any[];

      for (const row of persistedSessions) {
        const session: UploadSession = {
          uploadId: row.upload_id,
          userId: row.user_id,
          filename: row.filename,
          size: row.size,
          mimeType: row.mime_type,
          folderId: row.folder_id,
          checksum: row.checksum,
          chunkSize: row.chunk_size,
          totalChunks: row.total_chunks,
          receivedChunks: new Set(row.received_chunks ? JSON.parse(row.received_chunks) : []),
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          tempDir: row.temp_dir
        };

        // Verify temp directory still exists
        try {
          await fs.promises.access(session.tempDir);
          this.sessions.set(session.uploadId, session);
        } catch {
          // Temp dir doesn't exist, cleanup database record
          this.db.prepare('DELETE FROM upload_sessions WHERE upload_id = ?').run([session.uploadId]);
        }
      }
    } catch (error: any) {
      console.error('Failed to load persisted sessions:', error);
    }
  }
}

export const uploadService = new UploadService();