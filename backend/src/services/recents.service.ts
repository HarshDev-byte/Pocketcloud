import { db } from '../db/client';
import { logger } from '../utils/logger';

export type AccessType = 'view' | 'download' | 'edit';

export class RecentsService {
  // Record file access (non-blocking)
  static recordAccess(userId: string, fileId: string, accessType: AccessType = 'view'): void {
    setImmediate(() => {
      try {
        const now = Date.now();

        db.prepare(`
          INSERT OR REPLACE INTO file_access (user_id, file_id, accessed_at, access_type)
          VALUES (?, ?, ?, ?)
        `).run(userId, fileId, now, accessType);

        logger.debug('File access recorded', { userId, fileId, accessType });
      } catch (err: any) {
        logger.warn('Failed to record file access', { 
          userId, 
          fileId, 
          error: err.message 
        });
      }
    });
  }

  // Get recently accessed files
  static getRecents(userId: string, limit: number = 50): any[] {
    const files = db.prepare(`
      SELECT f.*, fa.accessed_at, fa.access_type
      FROM file_access fa
      JOIN files f ON fa.file_id = f.id
      WHERE fa.user_id = ? AND f.is_deleted = 0
      ORDER BY fa.accessed_at DESC
      LIMIT ?
    `).all(userId, limit);

    return files;
  }
}
