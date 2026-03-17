import { db } from '../db/client';
import { User, File as FileRecord, ActivityLog } from '../db/types';
import { AuthService } from './auth.service';
import { TrashService } from './trash.service';
import { ShareService } from './share.service';
import { ActivityService } from './activity.service';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface UserWithStats extends Omit<User, 'password_hash'> {
  file_count: number;
  storage_used: number;
  share_count: number;
}

interface StorageInfo {
  disk: {
    total: number;
    used: number;
    free: number;
    mountPoint: string;
    percentUsed: number;
  };
  database: {
    sizeBytes: number;
    fileCount: number;
    folderCount: number;
    trashSize: number;
    versionStorageSize: number;
  };
  byUser: Array<{
    userId: string;
    username: string;
    fileCount: number;
    storageBytes: number;
    trashBytes: number;
    quotaBytes: number | null;
  }>;
  byType: {
    images: number;
    videos: number;
    audio: number;
    documents: number;
    other: number;
  };
  largestFiles: Array<{
    id: string;
    name: string;
    size: number;
    owner: string;
    created_at: number;
  }>;
  orphanedFiles: number;
}

interface SystemInfo {
  cpu: {
    tempC: number;
    usage: number;
    throttled: boolean;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    cached: number;
  };
  disk: {
    readBytesPerSec: number;
    writeBytesPerSec: number;
  };
  network: {
    rxBytesPerSec: number;
    txBytesPerSec: number;
    connectedClients: number;
  };
  uptime: number;
  loadAvg: [number, number, number];
}

interface DashboardStats {
  users: {
    total: number;
    active: number;
    admins: number;
  };
  files: {
    total: number;
    sizeBytes: number;
    uploadedToday: number;
  };
  storage: {
    usedBytes: number;
    freeBytes: number;
    percentUsed: number;
  };
  activity: {
    last24h: number;
    topActions: Array<{ action: string; count: number }>;
  };
  system: {
    cpuTempC: number;
    memUsedPercent: number;
    uptime: number;
  };
  recentActivity: ActivityLog[];
}

interface LogLine {
  timestamp: string;
  level: string;
  message: string;
  meta?: any;
}

interface OrphanedFile {
  path: string;
  size: number;
  modified: number;
}

export class AdminService {
  private static systemStatsCache: { data: SystemInfo; timestamp: number } | null = null;
  private static readonly CACHE_DURATION = 5000; // 5 seconds

  /**
   * Get all users with statistics
   */
  static async getUsers(): Promise<UserWithStats[]> {
    const users = db.prepare(`
      SELECT 
        u.id, u.username, u.role, u.quota_bytes, u.is_active, u.created_at, u.last_login,
        COUNT(DISTINCT f.id) as file_count,
        COALESCE(SUM(f.size), 0) as storage_used,
        COUNT(DISTINCT s.id) as share_count
      FROM users u
      LEFT JOIN files f ON f.owner_id = u.id AND f.is_deleted = 0
      LEFT JOIN shares s ON s.owner_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all() as UserWithStats[];

    return users;
  }

  /**
   * Create a new user
   */
  static async createUser(params: {
    username: string;
    password: string;
    role: 'admin' | 'user';
    quotaBytes?: number;
  }): Promise<Omit<User, 'password_hash'>> {
    const user = await AuthService.createUser(
      params.username,
      params.password,
      params.role
    );

    // Set quota if provided
    if (params.quotaBytes !== undefined) {
      db.prepare('UPDATE users SET quota_bytes = ? WHERE id = ?').run(params.quotaBytes, user.id);
    }

    // Get the full user record from database to return complete User type
    const fullUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as User;
    
    // Remove password_hash from response
    const { password_hash, ...safeUser } = fullUser;
    return safeUser;
  }

  /**
   * Update user
   */
  static async updateUser(
    userId: string,
    updates: {
      role?: 'admin' | 'user';
      quotaBytes?: number | null;
      isActive?: boolean;
      username?: string;
    },
    adminId: string
  ): Promise<void> {
    // Prevent admin from modifying their own role or deactivating themselves
    if (userId === adminId) {
      if (updates.role !== undefined) {
        throw new Error('Cannot change your own role');
      }
      if (updates.isActive === false) {
        throw new Error('Cannot deactivate your own account');
      }
    }

    const setParts: string[] = [];
    const params: any[] = [];

    if (updates.role !== undefined) {
      setParts.push('role = ?');
      params.push(updates.role);
    }

    if (updates.quotaBytes !== undefined) {
      setParts.push('quota_bytes = ?');
      params.push(updates.quotaBytes);
    }

    if (updates.isActive !== undefined) {
      setParts.push('is_active = ?');
      params.push(updates.isActive ? 1 : 0);
    }

    if (updates.username !== undefined) {
      setParts.push('username = ?');
      params.push(updates.username);
    }

    if (setParts.length === 0) {
      return;
    }

    params.push(userId);

    const sql = `UPDATE users SET ${setParts.join(', ')} WHERE id = ?`;
    const result = db.prepare(sql).run(...params);

    if (result.changes === 0) {
      throw new Error('User not found');
    }

    logger.info('User updated by admin', { userId, updates, adminId });
  }

  /**
   * Delete user
   */
  static async deleteUser(userId: string, adminId: string): Promise<void> {
    if (userId === adminId) {
      throw new Error('Cannot delete your own account');
    }

    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    if (!user) {
      throw new Error('User not found');
    }

    db.transaction(() => {
      // Soft delete all user's files (move to trash)
      db.prepare(`
        UPDATE files 
        SET is_deleted = 1, deleted_at = ? 
        WHERE owner_id = ? AND is_deleted = 0
      `).run(Date.now(), userId);

      // Delete all user's sessions
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

      // Delete user record
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    })();

    logger.info('User deleted by admin', { userId, username: user.username, adminId });
  }

  /**
   * Reset user password
   */
  static async resetUserPassword(userId: string, newPassword: string): Promise<void> {
    // For admin password reset, we bypass the current password check
    // by directly updating the password hash
    
    // Validate new password
    if (!newPassword || typeof newPassword !== 'string') {
      throw new Error('New password is required');
    }
    
    if (newPassword.length < 8 || newPassword.length > 128) {
      throw new Error('New password must be 8-128 characters long');
    }

    const bcrypt = require('bcryptjs');
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password and delete all sessions for the user
    db.transaction(() => {
      const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, userId);
      if (result.changes === 0) {
        throw new Error('User not found');
      }
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    })();

    logger.info('User password reset by admin', { userId });
  }

  /**
   * Set user quota
   */
  static async setUserQuota(userId: string, quotaBytes: number | null): Promise<void> {
    const { QuotaService } = require('./quota.service');
    
    // Validate quota value
    QuotaService.validateQuota(quotaBytes);

    const result = db.prepare('UPDATE users SET quota_bytes = ? WHERE id = ?').run(quotaBytes, userId);

    if (result.changes === 0) {
      throw new Error('User not found');
    }

    logger.info('User quota updated by admin', { userId, quotaBytes });
  }

  /**
   * Get comprehensive storage information
   */
  static async getStorageInfo(): Promise<StorageInfo> {
    const storagePath = process.env.STORAGE_PATH || '/mnt/pocketcloud';

    // Get disk usage
    let diskInfo;
    try {
      const dfOutput = execSync(`df -B1 ${storagePath}`, { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        const total = parseInt(parts[1]) || 0;
        const used = parseInt(parts[2]) || 0;
        const free = parseInt(parts[3]) || 0;
        
        diskInfo = {
          total,
          used,
          free,
          mountPoint: storagePath,
          percentUsed: total > 0 ? Math.round((used / total) * 100) : 0
        };
      } else {
        throw new Error('Invalid df output');
      }
    } catch (error) {
      logger.warn('Failed to get disk usage', { error });
      diskInfo = {
        total: 0,
        used: 0,
        free: 0,
        mountPoint: storagePath,
        percentUsed: 0
      };
    }

    // Get database info
    const dbPath = process.env.DATABASE_PATH || './data/pocketcloud.db';
    let dbSize = 0;
    try {
      const stats = fs.statSync(dbPath);
      dbSize = stats.size;
    } catch (error) {
      logger.warn('Failed to get database size', { error });
    }

    const fileCount = db.prepare('SELECT COUNT(*) as count FROM files WHERE is_deleted = 0').get() as { count: number };
    const folderCount = db.prepare('SELECT COUNT(*) as count FROM folders WHERE is_deleted = 0').get() as { count: number };
    const trashSize = db.prepare('SELECT COALESCE(SUM(size), 0) as size FROM files WHERE is_deleted = 1').get() as { size: number };
    const versionSize = db.prepare('SELECT COALESCE(SUM(size), 0) as size FROM file_versions').get() as { size: number };

    // Storage by user
    const byUser = db.prepare(`
      SELECT 
        u.id as userId,
        u.username,
        COUNT(DISTINCT f.id) as fileCount,
        COALESCE(SUM(CASE WHEN f.is_deleted = 0 THEN f.size ELSE 0 END), 0) as storageBytes,
        COALESCE(SUM(CASE WHEN f.is_deleted = 1 THEN f.size ELSE 0 END), 0) as trashBytes,
        u.quota_bytes as quotaBytes
      FROM users u
      LEFT JOIN files f ON f.owner_id = u.id
      GROUP BY u.id
      ORDER BY storageBytes DESC
    `).all() as any[];

    // Storage by type
    const byType = db.prepare(`
      SELECT 
        CASE 
          WHEN mime_type LIKE 'image/%' THEN 'images'
          WHEN mime_type LIKE 'video/%' THEN 'videos'
          WHEN mime_type LIKE 'audio/%' THEN 'audio'
          WHEN mime_type LIKE 'application/pdf' OR mime_type LIKE 'text/%' OR mime_type LIKE 'application/msword%' OR mime_type LIKE 'application/vnd.openxmlformats%' THEN 'documents'
          ELSE 'other'
        END as type,
        COALESCE(SUM(size), 0) as size
      FROM files 
      WHERE is_deleted = 0
      GROUP BY type
    `).all() as Array<{ type: string; size: number }>;

    const typeBreakdown = {
      images: 0,
      videos: 0,
      audio: 0,
      documents: 0,
      other: 0
    };

    byType.forEach(item => {
      typeBreakdown[item.type as keyof typeof typeBreakdown] = item.size;
    });

    // Largest files
    const largestFiles = db.prepare(`
      SELECT f.id, f.name, f.size, u.username as owner, f.created_at
      FROM files f
      JOIN users u ON f.owner_id = u.id
      WHERE f.is_deleted = 0
      ORDER BY f.size DESC
      LIMIT 10
    `).all() as any[];

    return {
      disk: diskInfo,
      database: {
        sizeBytes: dbSize,
        fileCount: fileCount.count,
        folderCount: folderCount.count,
        trashSize: trashSize.size,
        versionStorageSize: versionSize.size
      },
      byUser,
      byType: typeBreakdown,
      largestFiles,
      orphanedFiles: 0 // Will be calculated by scan
    };
  }

  /**
   * Scan for orphaned files
   */
  static async scanOrphanedFiles(): Promise<{ orphans: OrphanedFile[]; totalSize: number }> {
    const storagePath = process.env.STORAGE_PATH || '/mnt/pocketcloud';
    const orphans: OrphanedFile[] = [];
    let totalSize = 0;

    try {
      // Get all file paths from database
      const dbFiles = new Set(
        db.prepare('SELECT storage_path FROM files').all().map((row: any) => row.storage_path)
      );

      // Add version file paths
      const versionFiles = db.prepare('SELECT storage_path FROM file_versions').all() as any[];
      versionFiles.forEach(row => dbFiles.add(row.storage_path));

      // Recursively scan storage directory
      const scanDirectory = (dirPath: string) => {
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
              scanDirectory(fullPath);
            } else if (entry.isFile()) {
              if (!dbFiles.has(fullPath)) {
                const stats = fs.statSync(fullPath);
                orphans.push({
                  path: fullPath,
                  size: stats.size,
                  modified: stats.mtime.getTime()
                });
                totalSize += stats.size;
              }
            }
          }
        } catch (error) {
          logger.warn('Failed to scan directory', { dirPath, error });
        }
      };

      if (fs.existsSync(storagePath)) {
        scanDirectory(storagePath);
      }

    } catch (error) {
      logger.error('Failed to scan for orphaned files', { error });
    }

    return { orphans, totalSize };
  }

  /**
   * Clean up orphaned files
   */
  static async cleanupOrphanedFiles(): Promise<{ deleted: number; bytesFreed: number }> {
    const { orphans } = await this.scanOrphanedFiles();
    
    let deleted = 0;
    let bytesFreed = 0;

    for (const orphan of orphans) {
      try {
        const stats = fs.statSync(orphan.path);
        fs.unlinkSync(orphan.path);
        deleted++;
        bytesFreed += stats.size;
        logger.info('Orphaned file deleted', { path: orphan.path, size: stats.size });
      } catch (error) {
        logger.warn('Failed to delete orphaned file', { path: orphan.path, error });
      }
    }

    return { deleted, bytesFreed };
  }

  /**
   * Get system information
   */
  static async getSystemInfo(): Promise<SystemInfo> {
    // Check cache
    if (this.systemStatsCache && Date.now() - this.systemStatsCache.timestamp < this.CACHE_DURATION) {
      return this.systemStatsCache.data;
    }

    const systemInfo: SystemInfo = {
      cpu: { tempC: 0, usage: 0, throttled: false },
      memory: { total: 0, used: 0, free: 0, cached: 0 },
      disk: { readBytesPerSec: 0, writeBytesPerSec: 0 },
      network: { rxBytesPerSec: 0, txBytesPerSec: 0, connectedClients: 0 },
      uptime: 0,
      loadAvg: [0, 0, 0]
    };

    try {
      // CPU temperature (Raspberry Pi specific)
      try {
        const tempStr = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
        systemInfo.cpu.tempC = parseInt(tempStr.trim()) / 1000;
      } catch (error) {
        // Not a Raspberry Pi or temp sensor not available
        systemInfo.cpu.tempC = 0;
      }

      // CPU throttling (Raspberry Pi specific)
      try {
        const throttleOutput = execSync('vcgencmd get_throttled', { encoding: 'utf8' });
        const throttleValue = parseInt(throttleOutput.split('=')[1], 16);
        systemInfo.cpu.throttled = (throttleValue & 0x1) !== 0;
      } catch (error) {
        systemInfo.cpu.throttled = false;
      }

      // Memory info
      try {
        const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const memLines = memInfo.split('\n');
        
        const getMemValue = (key: string) => {
          const line = memLines.find(l => l.startsWith(key));
          return line ? parseInt(line.split(/\s+/)[1]) * 1024 : 0; // Convert KB to bytes
        };

        systemInfo.memory.total = getMemValue('MemTotal:');
        systemInfo.memory.free = getMemValue('MemFree:');
        systemInfo.memory.cached = getMemValue('Cached:');
        systemInfo.memory.used = systemInfo.memory.total - systemInfo.memory.free - systemInfo.memory.cached;
      } catch (error) {
        logger.warn('Failed to read memory info', { error });
      }

      // Uptime
      try {
        const uptimeStr = fs.readFileSync('/proc/uptime', 'utf8');
        systemInfo.uptime = parseFloat(uptimeStr.split(' ')[0]);
      } catch (error) {
        logger.warn('Failed to read uptime', { error });
      }

      // Load average
      try {
        const loadavgStr = fs.readFileSync('/proc/loadavg', 'utf8');
        const loads = loadavgStr.split(' ').slice(0, 3).map(parseFloat);
        systemInfo.loadAvg = [loads[0] || 0, loads[1] || 0, loads[2] || 0];
      } catch (error) {
        logger.warn('Failed to read load average', { error });
      }

      // Connected clients (count ARP entries for our network)
      try {
        const arpOutput = execSync('arp -a', { encoding: 'utf8' });
        const networkPrefix = process.env.PI_IP?.split('.').slice(0, 3).join('.') || '192.168.4';
        const clientCount = arpOutput.split('\n').filter(line => 
          line.includes(`(${networkPrefix}.`) && !line.includes('incomplete')
        ).length;
        systemInfo.network.connectedClients = clientCount;
      } catch (error) {
        logger.warn('Failed to count connected clients', { error });
      }

    } catch (error) {
      logger.error('Failed to get system info', { error });
    }

    // Cache the result
    this.systemStatsCache = {
      data: systemInfo,
      timestamp: Date.now()
    };

    return systemInfo;
  }

  /**
   * Get system logs
   */
  static async getSystemLogs(limit: number = 100, level?: string): Promise<{ lines: LogLine[]; total: number }> {
    const logDir = process.env.LOG_DIR || '/mnt/pocketcloud/logs';
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `app-${today}.log`);

    const lines: LogLine[] = [];
    let total = 0;

    try {
      if (fs.existsSync(logFile)) {
        const tailCommand = `tail -n ${limit} "${logFile}"`;
        const output = execSync(tailCommand, { encoding: 'utf8' });
        
        const logLines = output.split('\n').filter(line => line.trim());
        total = logLines.length;

        for (const line of logLines) {
          try {
            const parsed = JSON.parse(line);
            if (!level || level === 'all' || parsed.level === level) {
              lines.push({
                timestamp: parsed.timestamp,
                level: parsed.level,
                message: parsed.message,
                meta: parsed.meta
              });
            }
          } catch (error) {
            // Not JSON, treat as plain text
            lines.push({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: line
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to read system logs', { error });
    }

    return { lines, total };
  }

  /**
   * Trigger manual cleanup
   */
  static async triggerCleanup(): Promise<any> {
    const trashResult = await TrashService.purgeExpiredItems();
    const shareResult = await ShareService.cleanExpiredShares();
    const activityResult = await ActivityService.purgeOldLogs();

    return {
      filesDeleted: trashResult.filesDeleted,
      foldersDeleted: trashResult.foldersDeleted,
      bytesFreed: trashResult.bytesFreed,
      uploadsCleaned: trashResult.uploadsCleaned,
      sharesDeleted: shareResult.deleted,
      activityLogsDeleted: activityResult.deleted
    };
  }

  /**
   * Get dashboard statistics
   */
  static async getDashboardStats(): Promise<DashboardStats> {
    // Users stats
    const userStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins
      FROM users
    `).get() as { total: number; active: number; admins: number };

    // Files stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const fileStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(size), 0) as sizeBytes,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as uploadedToday
      FROM files 
      WHERE is_deleted = 0
    `).get(todayMs) as { total: number; sizeBytes: number; uploadedToday: number };

    // Storage stats
    const storageInfo = await this.getStorageInfo();

    // Activity stats (last 24 hours)
    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    const activityStats = await ActivityService.getActivityStats();
    const recent24h = db.prepare('SELECT COUNT(*) as count FROM activity_log WHERE created_at >= ?').get(last24h) as { count: number };

    // System stats
    const systemInfo = await this.getSystemInfo();

    // Recent activity
    const recentActivity = await ActivityService.getActivityLog({ limit: 10, offset: 0 });

    return {
      users: userStats,
      files: fileStats,
      storage: {
        usedBytes: storageInfo.disk.used,
        freeBytes: storageInfo.disk.free,
        percentUsed: storageInfo.disk.percentUsed
      },
      activity: {
        last24h: recent24h.count,
        topActions: activityStats.topActions.slice(0, 5)
      },
      system: {
        cpuTempC: systemInfo.cpu.tempC,
        memUsedPercent: systemInfo.memory.total > 0 ? 
          Math.round((systemInfo.memory.used / systemInfo.memory.total) * 100) : 0,
        uptime: systemInfo.uptime
      },
      recentActivity: recentActivity.entries.slice(0, 10)
    };
  }
}