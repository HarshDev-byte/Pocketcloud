import { db } from '../db';
import { WebhookService } from './webhook.service';
import { LoggerService } from './logger.service';

// Import child_process using eval to avoid TypeScript module resolution issues
const childProcess = eval('require')('child_process');

export interface StorageInfo {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercentage: number;
}

/**
 * Storage monitoring service for tracking disk usage and triggering warnings
 */
export class StorageMonitorService {
  private static readonly WARNING_THRESHOLD = 80; // 80% usage triggers warning
  private static readonly CRITICAL_THRESHOLD = 95; // 95% usage triggers critical warning
  private static readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
  
  private static lastWarningTime = 0;
  private static readonly WARNING_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown between warnings

  /**
   * Get current storage information
   */
  public static getStorageInfo(): StorageInfo {
    try {
      const storagePath = eval('process.env.STORAGE_PATH') || '/mnt/pocketcloud/files';
      
      // Get disk usage using df command
      const dfOutput = childProcess.execSync(`df -B1 "${storagePath}"`, { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');
      const dataLine = lines[lines.length - 1];
      const columns = dataLine.split(/\s+/);
      
      const totalBytes = parseInt(columns[1], 10);
      const usedBytes = parseInt(columns[2], 10);
      const availableBytes = parseInt(columns[3], 10);
      const usagePercentage = Math.round((usedBytes / totalBytes) * 100);

      return {
        totalBytes,
        usedBytes,
        availableBytes,
        usagePercentage
      };

    } catch (error) {
      console.error('Error getting storage info:', error);
      return {
        totalBytes: 0,
        usedBytes: 0,
        availableBytes: 0,
        usagePercentage: 0
      };
    }
  }

  /**
   * Check storage usage and trigger warnings if needed
   */
  public static checkStorageUsage(): void {
    try {
      const storageInfo = this.getStorageInfo();
      const now = Date.now();

      // Skip if we're in cooldown period
      if (now - this.lastWarningTime < this.WARNING_COOLDOWN_MS) {
        return;
      }

      // Check if we need to trigger a warning
      if (storageInfo.usagePercentage >= this.WARNING_THRESHOLD) {
        const severity = storageInfo.usagePercentage >= this.CRITICAL_THRESHOLD ? 'critical' : 'warning';
        
        // Get all admin users for storage warnings
        const database = db();
        const adminUsersStmt = database.prepare(`
          SELECT id FROM users 
          WHERE role = 'admin' AND is_active = 1
        `);
        const adminUsers = adminUsersStmt.all() as { id: string }[];

        // Trigger webhook for each admin user
        for (const admin of adminUsers) {
          WebhookService.fanOut(WebhookService.EVENT_TYPES.STORAGE_WARNING, {
            storage: {
              totalBytes: storageInfo.totalBytes,
              usedBytes: storageInfo.usedBytes,
              availableBytes: storageInfo.availableBytes,
              usagePercentage: storageInfo.usagePercentage,
              severity,
              threshold: this.WARNING_THRESHOLD
            },
            system: {
              timestamp: now,
              hostname: eval('process.env.HOSTNAME') || 'pocketcloud'
            }
          }, admin.id).catch(error => {
            console.error('Webhook fanout failed for storage.warning:', error);
          });
        }

        // Log the warning
        LoggerService.warn('storage', `Storage usage ${severity}: ${storageInfo.usagePercentage}%`, 'system', {
          storageInfo,
          severity
        });

        // Update last warning time
        this.lastWarningTime = now;
      }

    } catch (error) {
      console.error('Error checking storage usage:', error);
    }
  }

  /**
   * Start periodic storage monitoring
   */
  public static startMonitoring(): void {
    // Initial check
    this.checkStorageUsage();

    // Set up periodic checks
    setInterval(() => {
      this.checkStorageUsage();
    }, this.CHECK_INTERVAL_MS);

    console.log(`Storage monitoring started (checking every ${this.CHECK_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Get storage statistics from database
   */
  public static getStorageStats(): { usedBytes: number; fileCount: number; lastUpdated: number } {
    try {
      const database = db();
      const stmt = database.prepare(`
        SELECT used_bytes, file_count, updated_at 
        FROM storage_stats 
        WHERE id = 1
      `);
      
      const result = stmt.get() as { used_bytes: number; file_count: number; updated_at: number } | undefined;
      
      if (result) {
        return {
          usedBytes: result.used_bytes,
          fileCount: result.file_count,
          lastUpdated: result.updated_at
        };
      }
      
      return { usedBytes: 0, fileCount: 0, lastUpdated: 0 };

    } catch (error) {
      console.error('Error getting storage stats:', error);
      return { usedBytes: 0, fileCount: 0, lastUpdated: 0 };
    }
  }

  /**
   * Update storage statistics in database
   */
  public static updateStorageStats(usedBytes: number, fileCount: number): void {
    try {
      const now = Date.now();
      
      // Try to update existing record
      const database = db();
      const updateStmt = database.prepare(`
        UPDATE storage_stats 
        SET used_bytes = ?, file_count = ?, updated_at = ?
        WHERE id = 1
      `);
      
      const result = updateStmt.run(usedBytes, fileCount, now);
      
      // If no record exists, create one
      if (result.changes === 0) {
        const insertStmt = database.prepare(`
          INSERT INTO storage_stats (id, used_bytes, file_count, updated_at)
          VALUES (1, ?, ?, ?)
        `);
        insertStmt.run(usedBytes, fileCount, now);
      }

    } catch (error) {
      console.error('Error updating storage stats:', error);
    }
  }

  /**
   * Calculate actual storage usage by scanning files
   */
  public static recalculateStorageStats(): { usedBytes: number; fileCount: number } {
    try {
      const database = db();
      const stmt = database.prepare(`
        SELECT COUNT(*) as file_count, COALESCE(SUM(size), 0) as used_bytes
        FROM files 
        WHERE is_deleted = 0
      `);
      
      const result = stmt.get() as { file_count: number; used_bytes: number };
      
      // Update the storage stats table
      this.updateStorageStats(result.used_bytes, result.file_count);
      
      return {
        usedBytes: result.used_bytes,
        fileCount: result.file_count
      };

    } catch (error) {
      console.error('Error recalculating storage stats:', error);
      return { usedBytes: 0, fileCount: 0 };
    }
  }

  /**
   * Format bytes to human readable string
   */
  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get storage usage summary
   */
  public static getStorageSummary(): {
    disk: StorageInfo;
    database: { usedBytes: number; fileCount: number; lastUpdated: number };
    formatted: {
      diskUsed: string;
      diskTotal: string;
      diskAvailable: string;
      dbUsed: string;
    };
  } {
    const disk = this.getStorageInfo();
    const database = this.getStorageStats();

    return {
      disk,
      database,
      formatted: {
        diskUsed: this.formatBytes(disk.usedBytes),
        diskTotal: this.formatBytes(disk.totalBytes),
        diskAvailable: this.formatBytes(disk.availableBytes),
        dbUsed: this.formatBytes(database.usedBytes)
      }
    };
  }
}