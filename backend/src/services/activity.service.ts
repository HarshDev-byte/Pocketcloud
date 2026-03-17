import { db } from '../db/client';
import { ActivityLog } from '../db/types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Action type constants
export const Actions = {
  // Files
  FILE_UPLOAD: 'file.upload',
  FILE_DOWNLOAD: 'file.download',
  FILE_DELETE: 'file.delete',
  FILE_RESTORE: 'file.restore',
  FILE_RENAME: 'file.rename',
  FILE_MOVE: 'file.move',
  FILE_COPY: 'file.copy',
  FILE_PURGE: 'file.purge',        // permanent delete
  FILE_VERSION_RESTORE: 'file.version.restore',

  // Folders
  FOLDER_CREATE: 'folder.create',
  FOLDER_RENAME: 'folder.rename',
  FOLDER_MOVE: 'folder.move',
  FOLDER_DELETE: 'folder.delete',
  FOLDER_RESTORE: 'folder.restore',

  // Sharing
  SHARE_CREATE: 'share.create',
  SHARE_ACCESS: 'share.access',      // someone downloaded via share link
  SHARE_REVOKE: 'share.revoke',

  // Auth
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_FAIL: 'auth.fail',
  AUTH_PASSWORD_CHANGE: 'auth.password_change',

  // Admin
  ADMIN_USER_CREATE: 'admin.user.create',
  ADMIN_USER_DELETE: 'admin.user.delete',
  ADMIN_MEDIA_REPROCESS: 'admin.media.reprocess',
  ADMIN_SETTINGS: 'admin.settings',
  ADMIN_SYSTEM_MAINTENANCE: 'admin.system.maintenance',

  // Files - Additional actions
  FILE_VIEW: 'file.view',
  FILE_STREAM: 'file.stream',

  // System
  SYSTEM_CLEANUP: 'system.cleanup',
  SYSTEM_STARTUP: 'system.startup',
} as const;

export type ActionType = typeof Actions[keyof typeof Actions];

interface LogEntry {
  userId?: string;
  action: ActionType;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: object;
}

interface ActivityOptions {
  userId?: string;
  action?: string;
  resourceType?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
}

interface ActivityEntry extends ActivityLog {
  username?: string;
}

interface ActivityResult {
  entries: ActivityEntry[];
  total: number;
  hasMore: boolean;
}

export class ActivityService {
  /**
   * Log an activity entry (async, non-blocking)
   */
  static log(entry: LogEntry): void {
    // Use setImmediate to ensure logging never blocks the main operation
    setImmediate(() => {
      try {
        const id = uuidv4();
        const now = Date.now();
        
        db.prepare(`
          INSERT INTO activity_log (
            id, user_id, action, resource_type, resource_id, 
            resource_name, ip_address, user_agent, details, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          entry.userId || null,
          entry.action,
          entry.resourceType || null,
          entry.resourceId || null,
          entry.resourceName || null,
          entry.ipAddress || null,
          entry.userAgent || null,
          entry.details ? JSON.stringify(entry.details) : null,
          now
        );

        logger.debug('Activity logged', {
          id,
          userId: entry.userId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId
        });
      } catch (error: any) {
        // Activity logging must NEVER crash the main operation
        logger.warn('Failed to log activity', { 
          error: error.message,
          entry: { ...entry, details: entry.details ? '[object]' : undefined }
        });
      }
    });
  }

  /**
   * Get activity log with filtering and pagination
   */
  static async getActivityLog(options: ActivityOptions): Promise<ActivityResult> {
    const {
      userId,
      action,
      resourceType,
      dateFrom,
      dateTo,
      limit = 50,
      offset = 0
    } = options;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];

    if (userId) {
      conditions.push('a.user_id = ?');
      params.push(userId);
    }

    if (action) {
      conditions.push('a.action = ?');
      params.push(action);
    }

    if (resourceType) {
      conditions.push('a.resource_type = ?');
      params.push(resourceType);
    }

    if (dateFrom) {
      conditions.push('a.created_at >= ?');
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push('a.created_at <= ?');
      params.push(dateTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countSql = `
      SELECT COUNT(*) as count
      FROM activity_log a
      ${whereClause}
    `;
    const countResult = db.prepare(countSql).get(...params) as { count: number };
    const total = countResult.count;

    // Get entries with user information
    const entriesSql = `
      SELECT a.*, u.username
      FROM activity_log a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const entries = db.prepare(entriesSql).all(...params, limit, offset) as ActivityEntry[];

    // Parse JSON details
    const processedEntries = entries.map(entry => ({
      ...entry,
      details: entry.details ? JSON.parse(entry.details) : null
    }));

    return {
      entries: processedEntries,
      total,
      hasMore: offset + limit < total
    };
  }

  /**
   * Get recent activity for a specific user
   */
  static async getRecentActivity(userId: string, limit: number = 20): Promise<ActivityEntry[]> {
    const sql = `
      SELECT a.*, u.username
      FROM activity_log a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `;

    const entries = db.prepare(sql).all(userId, limit) as ActivityEntry[];

    // Parse JSON details
    return entries.map(entry => ({
      ...entry,
      details: entry.details ? JSON.parse(entry.details) : null
    }));
  }

  /**
   * Get activity statistics for dashboard
   */
  static async getActivityStats(userId?: string): Promise<{
    totalActions: number;
    todayActions: number;
    topActions: Array<{ action: string; count: number }>;
    recentDays: Array<{ date: string; count: number }>;
  }> {
    const userFilter = userId ? 'WHERE user_id = ?' : '';
    const params = userId ? [userId] : [];

    // Total actions
    const totalResult = db.prepare(`
      SELECT COUNT(*) as count FROM activity_log ${userFilter}
    `).get(...params) as { count: number };

    // Today's actions
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayResult = db.prepare(`
      SELECT COUNT(*) as count FROM activity_log 
      ${userFilter ? userFilter + ' AND' : 'WHERE'} created_at >= ?
    `).get(...params, todayStart.getTime()) as { count: number };

    // Top actions (last 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const topActions = db.prepare(`
      SELECT action, COUNT(*) as count
      FROM activity_log
      ${userFilter ? userFilter + ' AND' : 'WHERE'} created_at >= ?
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `).all(...params, thirtyDaysAgo) as Array<{ action: string; count: number }>;

    // Activity by day (last 7 days)
    const recentDays: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayResult = db.prepare(`
        SELECT COUNT(*) as count FROM activity_log
        ${userFilter ? userFilter + ' AND' : 'WHERE'} created_at >= ? AND created_at < ?
      `).get(...params, date.getTime(), nextDay.getTime()) as { count: number };

      recentDays.push({
        date: date.toISOString().split('T')[0],
        count: dayResult.count
      });
    }

    return {
      totalActions: totalResult.count,
      todayActions: todayResult.count,
      topActions,
      recentDays
    };
  }

  /**
   * Purge old activity logs (90+ days)
   */
  static async purgeOldLogs(): Promise<{ deleted: number }> {
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    
    const result = db.prepare('DELETE FROM activity_log WHERE created_at < ?').run(ninetyDaysAgo);
    
    logger.info('Old activity logs purged', { deleted: result.changes });
    
    return { deleted: result.changes };
  }

  /**
   * Helper method to get resource name for logging
   */
  static async getResourceName(resourceType: string, resourceId: string): Promise<string | null> {
    try {
      switch (resourceType) {
        case 'file':
          const file = db.prepare('SELECT name FROM files WHERE id = ?').get(resourceId) as { name: string } | undefined;
          return file?.name || null;
        
        case 'folder':
          const folder = db.prepare('SELECT name FROM folders WHERE id = ?').get(resourceId) as { name: string } | undefined;
          return folder?.name || null;
        
        case 'share':
          const share = db.prepare(`
            SELECT COALESCE(f.name, fo.name) as name
            FROM shares s
            LEFT JOIN files f ON s.file_id = f.id
            LEFT JOIN folders fo ON s.folder_id = fo.id
            WHERE s.id = ?
          `).get(resourceId) as { name: string } | undefined;
          return share?.name || null;
        
        case 'user':
          const user = db.prepare('SELECT username FROM users WHERE id = ?').get(resourceId) as { username: string } | undefined;
          return user?.username || null;
        
        default:
          return null;
      }
    } catch (error) {
      return null;
    }
  }
}