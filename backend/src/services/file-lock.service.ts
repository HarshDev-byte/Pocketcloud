import { db } from '../db/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface FileLock {
  file_id: string;
  locked_by: string;
  reason: string | null;
  locked_at: number;
  expires_at: number | null;
  username?: string;
}

export class FileLockService {
  // Lock a file
  static lockFile(
    fileId: string, 
    userId: string, 
    reason?: string, 
    expiresInMinutes?: number
  ): FileLock {
    // Verify file exists and user has access
    const file = db.prepare(`
      SELECT id FROM files WHERE id = ? AND owner_id = ? AND is_deleted = 0
    `).get(fileId, userId);

    if (!file) {
      throw new AppError('FILE_NOT_FOUND', 'File not found', 404);
    }

    // Check if already locked by someone else
    const existingLock = this.isFileLocked(fileId);
    if (existingLock && existingLock.locked_by !== userId) {
      throw new AppError(
        'FILE_LOCKED',
        `File is locked by ${existingLock.username || 'another user'}`,
        423
      );
    }

    const now = Date.now();
    const expiresAt = expiresInMinutes ? now + (expiresInMinutes * 60 * 1000) : null;

    db.prepare(`
      INSERT OR REPLACE INTO file_locks (file_id, locked_by, reason, locked_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(fileId, userId, reason || null, now, expiresAt);

    const lock = db.prepare(`
      SELECT fl.*, u.username
      FROM file_locks fl
      JOIN users u ON fl.locked_by = u.id
      WHERE fl.file_id = ?
    `).get(fileId) as FileLock;

    logger.info('File locked', { fileId, userId, expiresInMinutes });
    return lock;
  }

  // Unlock a file
  static unlockFile(fileId: string, userId: string, isAdmin: boolean = false): void {
    const lock = db.prepare(`
      SELECT * FROM file_locks WHERE file_id = ?
    `).get(fileId) as FileLock | undefined;

    if (!lock) {
      throw new AppError('NOT_LOCKED', 'File is not locked', 400);
    }

    // Only owner or admin can unlock
    if (lock.locked_by !== userId && !isAdmin) {
      throw new AppError('FORBIDDEN', 'You can only unlock files you locked', 403);
    }

    db.prepare(`DELETE FROM file_locks WHERE file_id = ?`).run(fileId);

    logger.info('File unlocked', { fileId, userId, isAdmin });
  }

  // Check if file is locked
  static isFileLocked(fileId: string): FileLock | null {
    const lock = db.prepare(`
      SELECT fl.*, u.username
      FROM file_locks fl
      JOIN users u ON fl.locked_by = u.id
      WHERE fl.file_id = ?
    `).get(fileId) as FileLock | undefined;

    if (!lock) {
      return null;
    }

    // Check if lock has expired
    if (lock.expires_at && lock.expires_at < Date.now()) {
      // Auto-delete expired lock
      db.prepare(`DELETE FROM file_locks WHERE file_id = ?`).run(fileId);
      logger.info('Expired lock removed', { fileId });
      return null;
    }

    return lock;
  }

  // Get lock status
  static getLockStatus(fileId: string): FileLock | null {
    return this.isFileLocked(fileId);
  }
}
