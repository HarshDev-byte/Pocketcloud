import { db } from '../db/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { getDiskStatus } from '../utils/disk.utils';

interface DailySnapshot {
  date: string;
  fileCount: number;
  totalBytes: number;
  imageBytes: number;
  videoBytes: number;
  audioBytes: number;
  docBytes: number;
  otherBytes: number;
  trashBytes: number;
  versionBytes: number;
}

interface StorageGrowth {
  snapshots: DailySnapshot[];
  growthPercent: number;
  daysUntilFull: number | null;
  totalGrowthBytes: number;
  averageDailyGrowthBytes: number;
}

interface LargestFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: number;
  percentOfTotal: number;
}

interface DuplicateGroup {
  checksum: string;
  count: number;
  wastedBytes: number;
  fileIds: string[];
  fileNames: string[];
}

interface Recommendation {
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string;
  savingsBytes: number;
}

interface UploadActivity {
  heatmap: { [date: string]: { [hour: string]: { files: number; bytes: number } } };
  peakHour: number;
  peakDay: string;
  totalUploads: number;
  totalBytes: number;
}

interface StorageBreakdown {
  fileCount: number;
  totalBytes: number;
  imageBytes: number;
  videoBytes: number;
  audioBytes: number;
  docBytes: number;
  otherBytes: number;
  trashBytes: number;
  versionBytes: number;
}

export class AnalyticsService {
  // Take a storage snapshot
  static takeSnapshot(userId?: string): void {
    try {
      const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

      // Get file statistics
      const query = `
        SELECT
          COUNT(*) as file_count,
          COALESCE(SUM(size), 0) as total_bytes,
          COALESCE(SUM(CASE WHEN mime_type LIKE 'image/%' THEN size ELSE 0 END), 0) as image_bytes,
          COALESCE(SUM(CASE WHEN mime_type LIKE 'video/%' THEN size ELSE 0 END), 0) as video_bytes,
          COALESCE(SUM(CASE WHEN mime_type LIKE 'audio/%' THEN size ELSE 0 END), 0) as audio_bytes,
          COALESCE(SUM(CASE WHEN 
            mime_type LIKE 'application/pdf' OR 
            mime_type LIKE 'text/%' OR
            mime_type LIKE '%word%' OR
            mime_type LIKE '%sheet%'
          THEN size ELSE 0 END), 0) as doc_bytes
        FROM files
        WHERE is_deleted = 0
        ${userId ? 'AND owner_id = ?' : ''}
      `;

      const stats = db.prepare(query).get(userId ? userId : undefined) as any;

      // Get trash size
      const trashQuery = `
        SELECT COALESCE(SUM(size), 0) as bytes 
        FROM files
        WHERE is_deleted = 1 ${userId ? 'AND owner_id = ?' : ''}
      `;
      const trashStats = db.prepare(trashQuery).get(userId ? userId : undefined) as any;

      // Get version storage
      const versionQuery = `
        SELECT COALESCE(SUM(v.size), 0) as bytes
        FROM file_versions v
        JOIN files f ON v.file_id = f.id
        ${userId ? 'WHERE f.owner_id = ?' : ''}
      `;
      const versionStats = db.prepare(versionQuery).get(userId ? userId : undefined) as any;

      // Calculate other bytes
      const otherBytes = Math.max(0, 
        stats.total_bytes - 
        stats.image_bytes - 
        stats.video_bytes - 
        stats.audio_bytes - 
        stats.doc_bytes
      );

      // Insert or replace snapshot
      const snapshotId = uuidv4();
      db.prepare(`
        INSERT OR REPLACE INTO storage_snapshots (
          id, user_id, date, file_count, total_bytes,
          image_bytes, video_bytes, audio_bytes, doc_bytes, other_bytes,
          trash_bytes, version_bytes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        snapshotId,
        userId || null,
        today,
        stats.file_count || 0,
        stats.total_bytes || 0,
        stats.image_bytes || 0,
        stats.video_bytes || 0,
        stats.audio_bytes || 0,
        stats.doc_bytes || 0,
        otherBytes,
        trashStats.bytes || 0,
        versionStats.bytes || 0
      );

      logger.info('Storage snapshot taken', { 
        userId: userId || 'global', 
        date: today,
        totalBytes: stats.total_bytes 
      });
    } catch (error: any) {
      logger.error('Failed to take storage snapshot', { 
        userId, 
        error: error.message 
      });
    }
  }

  // Get storage growth over time
  static getStorageGrowth(userId?: string, days: number = 30): StorageGrowth {
    const snapshots = db.prepare(`
      SELECT * FROM storage_snapshots
      WHERE user_id IS ?
      AND date >= date('now', '-' || ? || ' days')
      ORDER BY date ASC
    `).all(userId || null, days) as any[];

    // Convert to DailySnapshot format
    const formattedSnapshots: DailySnapshot[] = snapshots.map(s => ({
      date: s.date,
      fileCount: s.file_count,
      totalBytes: s.total_bytes,
      imageBytes: s.image_bytes,
      videoBytes: s.video_bytes,
      audioBytes: s.audio_bytes,
      docBytes: s.doc_bytes,
      otherBytes: s.other_bytes,
      trashBytes: s.trash_bytes,
      versionBytes: s.version_bytes
    }));

    // Fill missing days with previous day's value
    const filledSnapshots = this.fillMissingDays(formattedSnapshots, days);

    // Calculate growth metrics
    const firstDay = filledSnapshots[0]?.totalBytes ?? 0;
    const lastDay = filledSnapshots[filledSnapshots.length - 1]?.totalBytes ?? 0;
    const totalGrowthBytes = lastDay - firstDay;
    const growthPercent = firstDay > 0 ? ((lastDay - firstDay) / firstDay) * 100 : 0;
    const averageDailyGrowthBytes = filledSnapshots.length > 1 
      ? totalGrowthBytes / (filledSnapshots.length - 1)
      : 0;

    // Project days until full (linear extrapolation)
    let daysUntilFull: number | null = null;
    if (averageDailyGrowthBytes > 0) {
      const diskStatus = getDiskStatus();
      const remainingBytes = diskStatus.freeBytes;
      daysUntilFull = Math.floor(remainingBytes / averageDailyGrowthBytes);
    }

    return {
      snapshots: filledSnapshots,
      growthPercent,
      daysUntilFull,
      totalGrowthBytes,
      averageDailyGrowthBytes
    };
  }

  // Get current storage breakdown
  static getStorageBreakdown(userId?: string): StorageBreakdown {
    const query = `
      SELECT
        COUNT(*) as file_count,
        COALESCE(SUM(size), 0) as total_bytes,
        COALESCE(SUM(CASE WHEN mime_type LIKE 'image/%' THEN size ELSE 0 END), 0) as image_bytes,
        COALESCE(SUM(CASE WHEN mime_type LIKE 'video/%' THEN size ELSE 0 END), 0) as video_bytes,
        COALESCE(SUM(CASE WHEN mime_type LIKE 'audio/%' THEN size ELSE 0 END), 0) as audio_bytes,
        COALESCE(SUM(CASE WHEN 
          mime_type LIKE 'application/pdf' OR 
          mime_type LIKE 'text/%' OR
          mime_type LIKE '%word%' OR
          mime_type LIKE '%sheet%'
        THEN size ELSE 0 END), 0) as doc_bytes
      FROM files
      WHERE is_deleted = 0
      ${userId ? 'AND owner_id = ?' : ''}
    `;

    const stats = db.prepare(query).get(userId ? userId : undefined) as any;

    const trashQuery = `
      SELECT COALESCE(SUM(size), 0) as bytes 
      FROM files
      WHERE is_deleted = 1 ${userId ? 'AND owner_id = ?' : ''}
    `;
    const trashStats = db.prepare(trashQuery).get(userId ? userId : undefined) as any;

    const versionQuery = `
      SELECT COALESCE(SUM(v.size), 0) as bytes
      FROM file_versions v
      JOIN files f ON v.file_id = f.id
      ${userId ? 'WHERE f.owner_id = ?' : ''}
    `;
    const versionStats = db.prepare(versionQuery).get(userId ? userId : undefined) as any;

    const otherBytes = Math.max(0, 
      stats.total_bytes - 
      stats.image_bytes - 
      stats.video_bytes - 
      stats.audio_bytes - 
      stats.doc_bytes
    );

    return {
      fileCount: stats.file_count || 0,
      totalBytes: stats.total_bytes || 0,
      imageBytes: stats.image_bytes || 0,
      videoBytes: stats.video_bytes || 0,
      audioBytes: stats.audio_bytes || 0,
      docBytes: stats.doc_bytes || 0,
      otherBytes,
      trashBytes: trashStats.bytes || 0,
      versionBytes: versionStats.bytes || 0
    };
  }

  // Get largest files
  static getLargestFiles(userId: string, limit: number = 20): LargestFile[] {
    const files = db.prepare(`
      SELECT 
        id, 
        name, 
        size, 
        mime_type,
        created_at,
        ROUND(size * 100.0 / (
          SELECT COALESCE(SUM(size), 1) FROM files WHERE owner_id = ? AND is_deleted = 0
        ), 2) as percent_of_total
      FROM files
      WHERE owner_id = ? AND is_deleted = 0
      ORDER BY size DESC
      LIMIT ?
    `).all(userId, userId, limit) as any[];

    return files.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mime_type,
      createdAt: f.created_at,
      percentOfTotal: f.percent_of_total || 0
    }));
  }

  // Get duplicate file groups
  static getDuplicateGroups(userId: string): DuplicateGroup[] {
    const groups = db.prepare(`
      SELECT 
        checksum,
        COUNT(*) as count,
        SUM(size) as total_size,
        GROUP_CONCAT(id) as file_ids,
        GROUP_CONCAT(name) as file_names
      FROM files
      WHERE owner_id = ? AND is_deleted = 0 AND checksum IS NOT NULL
      GROUP BY checksum
      HAVING COUNT(*) > 1
      ORDER BY total_size DESC
      LIMIT 50
    `).all(userId) as any[];

    return groups.map(g => {
      // Wasted bytes = total size - size of one copy
      const wastedBytes = g.total_size - (g.total_size / g.count);
      
      return {
        checksum: g.checksum,
        count: g.count,
        wastedBytes: Math.floor(wastedBytes),
        fileIds: g.file_ids.split(','),
        fileNames: g.file_names.split(',')
      };
    });
  }

  // Get smart recommendations
  static getSmartRecommendations(userId: string): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Check 1 — Large trash
    const trashSize = db.prepare(`
      SELECT COALESCE(SUM(size), 0) as bytes 
      FROM files 
      WHERE owner_id = ? AND is_deleted = 1
    `).get(userId) as any;

    if (trashSize.bytes > 1073741824) {  // > 1GB
      recommendations.push({
        type: 'empty_trash',
        priority: 'high',
        title: 'Empty your trash',
        description: `${this.formatBytes(trashSize.bytes)} waiting in trash`,
        action: 'DELETE /api/trash/empty',
        savingsBytes: trashSize.bytes
      });
    }

    // Check 2 — Old versions
    const versionSize = db.prepare(`
      SELECT COALESCE(SUM(v.size), 0) as bytes
      FROM file_versions v
      JOIN files f ON v.file_id = f.id
      WHERE f.owner_id = ?
    `).get(userId) as any;

    if (versionSize.bytes > 536870912) {  // > 500MB
      recommendations.push({
        type: 'trim_versions',
        priority: 'medium',
        title: 'Old file versions using space',
        description: `${this.formatBytes(versionSize.bytes)} in version history`,
        action: 'Review old versions in settings',
        savingsBytes: Math.floor(versionSize.bytes * 0.7)  // estimate 70% recoverable
      });
    }

    // Check 3 — Duplicate files
    const dupes = this.getDuplicateGroups(userId);
    const dupeSavings = dupes.reduce((sum, g) => sum + g.wastedBytes, 0);

    if (dupeSavings > 104857600) {  // > 100MB
      recommendations.push({
        type: 'remove_duplicates',
        priority: 'medium',
        title: `${dupes.length} duplicate file groups found`,
        description: `Could save ${this.formatBytes(dupeSavings)}`,
        action: 'GET /api/analytics/duplicates',
        savingsBytes: dupeSavings
      });
    }

    // Check 4 — Large videos that could be compressed
    const largeVideos = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total 
      FROM files 
      WHERE owner_id = ? 
      AND mime_type LIKE 'video/%' 
      AND size > 1073741824 
      AND is_deleted = 0
    `).get(userId) as any;

    if (largeVideos.count > 0) {
      recommendations.push({
        type: 'compress_videos',
        priority: 'low',
        title: `${largeVideos.count} large videos (> 1GB each)`,
        description: `${this.formatBytes(largeVideos.total)} total`,
        action: 'Consider re-encoding at lower quality',
        savingsBytes: Math.floor(largeVideos.total * 0.5)  // estimate 50% reduction
      });
    }

    // Check 5 — Quota warning
    const { QuotaService } = require('./quota.service');
    try {
      const quota = QuotaService.getQuotaInfo(userId);
      if (quota.percentUsed && quota.percentUsed > 80) {
        recommendations.push({
          type: 'quota_warning',
          priority: 'critical',
          title: `${Math.round(quota.percentUsed)}% of quota used`,
          description: `Only ${this.formatBytes(quota.free!)} remaining`,
          action: 'Contact admin to increase quota',
          savingsBytes: 0
        });
      }
    } catch (error) {
      // Quota service might not be available
    }

    // Sort by priority
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  // Record upload statistics
  static recordUploadStat(userId: string, sizeBytes: number): void {
    setImmediate(() => {
      try {
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const hour = now.getHours();

        db.prepare(`
          INSERT INTO upload_stats (date, hour, user_id, file_count, total_bytes)
          VALUES (?, ?, ?, 1, ?)
          ON CONFLICT (date, hour, user_id) DO UPDATE SET
            file_count = file_count + 1,
            total_bytes = total_bytes + excluded.total_bytes
        `).run(date, hour, userId, sizeBytes);
      } catch (error: any) {
        logger.warn('Failed to record upload stat', { 
          userId, 
          error: error.message 
        });
      }
    });
  }

  // Get upload activity heatmap
  static getUploadActivity(userId: string, days: number = 30): UploadActivity {
    const stats = db.prepare(`
      SELECT date, hour, SUM(file_count) as files, SUM(total_bytes) as bytes
      FROM upload_stats
      WHERE user_id = ?
      AND date >= date('now', '-' || ? || ' days')
      GROUP BY date, hour
      ORDER BY date, hour
    `).all(userId, days) as any[];

    // Build heatmap
    const heatmap: { [date: string]: { [hour: string]: { files: number; bytes: number } } } = {};
    let totalUploads = 0;
    let totalBytes = 0;
    const hourCounts: { [hour: number]: number } = {};
    const dayCounts: { [day: string]: number } = {};

    for (const stat of stats) {
      if (!heatmap[stat.date]) {
        heatmap[stat.date] = {};
      }
      heatmap[stat.date][stat.hour] = {
        files: stat.files,
        bytes: stat.bytes
      };

      totalUploads += stat.files;
      totalBytes += stat.bytes;
      hourCounts[stat.hour] = (hourCounts[stat.hour] || 0) + stat.files;
      
      // Get day of week
      const dayOfWeek = new Date(stat.date).toLocaleDateString('en-US', { weekday: 'long' });
      dayCounts[dayOfWeek] = (dayCounts[dayOfWeek] || 0) + stat.files;
    }

    // Find peak hour and day
    let peakHour = 0;
    let maxHourCount = 0;
    for (const [hour, count] of Object.entries(hourCounts)) {
      if (count > maxHourCount) {
        maxHourCount = count;
        peakHour = parseInt(hour);
      }
    }

    let peakDay = 'Monday';
    let maxDayCount = 0;
    for (const [day, count] of Object.entries(dayCounts)) {
      if (count > maxDayCount) {
        maxDayCount = count;
        peakDay = day;
      }
    }

    return {
      heatmap,
      peakHour,
      peakDay,
      totalUploads,
      totalBytes
    };
  }

  // Helper: Fill missing days in snapshots
  private static fillMissingDays(snapshots: DailySnapshot[], days: number): DailySnapshot[] {
    if (snapshots.length === 0) {
      return [];
    }

    const filled: DailySnapshot[] = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);

    let lastSnapshot = snapshots[0];
    let snapshotIndex = 0;

    for (let i = 0; i <= days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];

      // Check if we have a snapshot for this date
      if (snapshotIndex < snapshots.length && snapshots[snapshotIndex].date === dateStr) {
        filled.push(snapshots[snapshotIndex]);
        lastSnapshot = snapshots[snapshotIndex];
        snapshotIndex++;
      } else {
        // Use previous day's values
        filled.push({
          ...lastSnapshot,
          date: dateStr
        });
      }
    }

    return filled;
  }

  // Helper: Format bytes to human-readable string
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  // Get admin analytics (all users)
  static getAdminAnalytics(): any {
    // Global storage breakdown
    const globalBreakdown = this.getStorageBreakdown();

    // Per-user breakdown
    const users = db.prepare('SELECT id, username FROM users WHERE is_active = 1').all() as any[];
    const perUserBreakdown = users.map(user => {
      const breakdown = this.getStorageBreakdown(user.id);
      return {
        userId: user.id,
        username: user.username,
        ...breakdown
      };
    }).sort((a, b) => b.totalBytes - a.totalBytes);

    // Global growth
    const globalGrowth = this.getStorageGrowth(undefined, 30);

    // System stats
    const diskStatus = getDiskStatus();

    return {
      global: {
        breakdown: globalBreakdown,
        growth: globalGrowth,
        disk: {
          totalBytes: diskStatus.totalBytes,
          usedBytes: diskStatus.usedBytes,
          freeBytes: diskStatus.freeBytes,
          percentUsed: diskStatus.percentUsed
        }
      },
      perUser: perUserBreakdown
    };
  }
}
