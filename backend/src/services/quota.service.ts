import { db } from '../db/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

interface QuotaInfo {
  used: number;
  quota: number | null;
  free: number | null;
  percentUsed: number | null;
  isUnlimited: boolean;
}

export class QuotaService {
  /**
   * Get total storage used by a user
   */
  static getUserStorageUsed(userId: string): number {
    const result = db.prepare(`
      SELECT COALESCE(SUM(size), 0) as total 
      FROM files 
      WHERE owner_id = ? AND is_deleted = 0
    `).get(userId) as { total: number };

    return result.total;
  }

  /**
   * Check if an upload is allowed within quota limits
   */
  static checkUploadAllowed(userId: string, uploadSizeBytes: number): void {
    const user = db.prepare('SELECT quota_bytes FROM users WHERE id = ?').get(userId) as { quota_bytes: number | null } | undefined;
    
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Null quota means unlimited
    if (!user.quota_bytes) {
      return;
    }

    const used = this.getUserStorageUsed(userId);
    const wouldBeUsed = used + uploadSizeBytes;

    if (wouldBeUsed > user.quota_bytes) {
      const errorMessage = `Storage quota exceeded. Used: ${this.formatBytes(used)}, Quota: ${this.formatBytes(user.quota_bytes)}, Requested: ${this.formatBytes(uploadSizeBytes)}`;
      
      logger.warn('Upload blocked by quota', {
        userId,
        used,
        quota: user.quota_bytes,
        requested: uploadSizeBytes,
        wouldBeUsed
      });

      throw new AppError(
        'QUOTA_EXCEEDED',
        errorMessage,
        507 // 507 Insufficient Storage
      );
    }
  }

  /**
   * Get comprehensive quota information for a user
   */
  static getQuotaInfo(userId: string): QuotaInfo {
    const user = db.prepare('SELECT quota_bytes FROM users WHERE id = ?').get(userId) as { quota_bytes: number | null } | undefined;
    
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    const used = this.getUserStorageUsed(userId);
    const quota = user.quota_bytes;
    const isUnlimited = !quota;

    return {
      used,
      quota,
      free: quota ? Math.max(0, quota - used) : null,
      percentUsed: quota ? Math.min(100, (used / quota) * 100) : null,
      isUnlimited
    };
  }

  /**
   * Format bytes into human-readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get quota usage for multiple users (admin function)
   */
  static getMultiUserQuotaInfo(userIds?: string[]): Array<QuotaInfo & { userId: string; username: string }> {
    let whereClause = '';
    let params: any[] = [];

    if (userIds && userIds.length > 0) {
      whereClause = `WHERE u.id IN (${userIds.map(() => '?').join(',')})`;
      params = userIds;
    }

    const users = db.prepare(`
      SELECT 
        u.id as userId,
        u.username,
        u.quota_bytes,
        COALESCE(SUM(CASE WHEN f.is_deleted = 0 THEN f.size ELSE 0 END), 0) as used
      FROM users u
      LEFT JOIN files f ON f.owner_id = u.id
      ${whereClause}
      GROUP BY u.id, u.username, u.quota_bytes
      ORDER BY u.username
    `).all(...params) as Array<{
      userId: string;
      username: string;
      quota_bytes: number | null;
      used: number;
    }>;

    return users.map(user => {
      const quota = user.quota_bytes;
      const used = user.used;
      const isUnlimited = !quota;

      return {
        userId: user.userId,
        username: user.username,
        used,
        quota,
        free: quota ? Math.max(0, quota - used) : null,
        percentUsed: quota ? Math.min(100, (used / quota) * 100) : null,
        isUnlimited
      };
    });
  }

  /**
   * Check if user is approaching quota limit
   */
  static isApproachingQuota(userId: string, warningThreshold: number = 0.8): boolean {
    const quotaInfo = this.getQuotaInfo(userId);
    
    if (quotaInfo.isUnlimited) {
      return false;
    }

    const percentUsed = quotaInfo.percentUsed || 0;
    return percentUsed >= (warningThreshold * 100);
  }

  /**
   * Get users who are over or approaching quota limits
   */
  static getUsersNearQuota(warningThreshold: number = 0.8): Array<{
    userId: string;
    username: string;
    quotaInfo: QuotaInfo;
    status: 'over' | 'warning' | 'ok';
  }> {
    const allUsers = this.getMultiUserQuotaInfo();
    
    return allUsers
      .filter(user => !user.isUnlimited)
      .map(user => {
        const percentUsed = user.percentUsed || 0;
        let status: 'over' | 'warning' | 'ok' = 'ok';
        
        if (percentUsed >= 100) {
          status = 'over';
        } else if (percentUsed >= (warningThreshold * 100)) {
          status = 'warning';
        }

        return {
          userId: user.userId,
          username: user.username,
          quotaInfo: user,
          status
        };
      })
      .filter(user => user.status !== 'ok')
      .sort((a, b) => (b.quotaInfo.percentUsed || 0) - (a.quotaInfo.percentUsed || 0));
  }

  /**
   * Validate quota value
   */
  static validateQuota(quotaBytes: number | null): void {
    if (quotaBytes !== null) {
      if (typeof quotaBytes !== 'number' || quotaBytes < 0) {
        throw new AppError('INVALID_QUOTA', 'Quota must be null (unlimited) or a positive number', 400);
      }

      // Minimum quota of 1MB to prevent unusable accounts
      const minQuota = 1024 * 1024; // 1MB
      if (quotaBytes > 0 && quotaBytes < minQuota) {
        throw new AppError('QUOTA_TOO_SMALL', `Quota must be at least ${this.formatBytes(minQuota)}`, 400);
      }

      // Maximum quota of 1TB to prevent abuse
      const maxQuota = 1024 * 1024 * 1024 * 1024; // 1TB
      if (quotaBytes > maxQuota) {
        throw new AppError('QUOTA_TOO_LARGE', `Quota cannot exceed ${this.formatBytes(maxQuota)}`, 400);
      }
    }
  }

  /**
   * Calculate storage statistics for admin dashboard
   */
  static getStorageStatistics(): {
    totalUsers: number;
    usersWithQuota: number;
    totalQuotaAllocated: number;
    totalStorageUsed: number;
    averageUsagePercent: number;
    usersOverQuota: number;
    usersNearQuota: number;
  } {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as totalUsers,
        COUNT(CASE WHEN quota_bytes IS NOT NULL THEN 1 END) as usersWithQuota,
        COALESCE(SUM(quota_bytes), 0) as totalQuotaAllocated,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(size), 0) FROM files WHERE owner_id = users.id AND is_deleted = 0)
        ), 0) as totalStorageUsed
      FROM users
    `).get() as {
      totalUsers: number;
      usersWithQuota: number;
      totalQuotaAllocated: number;
      totalStorageUsed: number;
    };

    // Calculate users over/near quota
    const quotaUsers = this.getMultiUserQuotaInfo().filter(user => !user.isUnlimited);
    const usersOverQuota = quotaUsers.filter(user => (user.percentUsed || 0) >= 100).length;
    const usersNearQuota = quotaUsers.filter(user => (user.percentUsed || 0) >= 80 && (user.percentUsed || 0) < 100).length;

    // Calculate average usage percent for users with quotas
    const totalUsagePercent = quotaUsers.reduce((sum, user) => sum + (user.percentUsed || 0), 0);
    const averageUsagePercent = quotaUsers.length > 0 ? totalUsagePercent / quotaUsers.length : 0;

    return {
      ...stats,
      averageUsagePercent,
      usersOverQuota,
      usersNearQuota
    };
  }
}