import { TrashService } from '../services/trash.service';
import { UploadService } from '../services/upload.service';
import { ShareService } from '../services/share.service';
import { BackupUtils } from '../utils/backup.utils';
import { db } from '../db';
import { execSync } from 'child_process';

export interface CleanupResult {
  filesDeleted: number;
  foldersDeleted: number;
  bytesFreed: number;
  uploadsCleared: number;
  sharesExpired: number;
  backupCreated: boolean;
  backupPath?: string;
}

/**
 * Cleanup job for maintenance tasks
 * Called by systemd timer or manual trigger
 */
export class CleanupJob {
  
  /**
   * Run all cleanup tasks
   */
  public static async runCleanup(): Promise<CleanupResult> {
    console.log('Starting cleanup job...');
    
    try {
      // 1. Create daily backup
      const backupResult = BackupUtils.createDailyBackup();
      console.log(backupResult.success 
        ? `Database backup created: ${backupResult.backupPath}` 
        : `Backup failed: ${backupResult.error}`);
      
      // 2. Purge expired trash items (older than 30 days)
      const purgeResult = TrashService.purgeExpiredItems();
      console.log(`Purged ${purgeResult.filesDeleted} files and ${purgeResult.foldersDeleted} folders, freed ${Math.round(purgeResult.bytesFreed / 1024 / 1024)}MB`);
      
      // 3. Clean expired shares
      const sharesExpired = ShareService.cleanExpiredShares();
      console.log(`Cleaned ${sharesExpired} expired shares`);
      
      // 4. Clean stalled uploads (older than 24 hours)
      const uploadsCleared = UploadService.cleanStalledUploads();
      console.log(`Cleared ${uploadsCleared} stalled uploads`);
      
      // 5. Update storage statistics
      this.updateStorageStats();
      console.log('Updated storage statistics');
      
      const result: CleanupResult = {
        filesDeleted: purgeResult.filesDeleted,
        foldersDeleted: purgeResult.foldersDeleted,
        bytesFreed: purgeResult.bytesFreed,
        uploadsCleared,
        sharesExpired,
        backupCreated: backupResult.success,
        backupPath: backupResult.backupPath
      };
      
      console.log('Cleanup job completed successfully');
      return result;
      
    } catch (error) {
      console.error('Cleanup job failed:', error);
      throw error;
    }
  }
  
  /**
   * Update storage statistics by recalculating from database
   */
  private static updateStorageStats(): void {
    try {
      // Calculate actual storage usage from non-deleted files
      const statsStmt = db.prepare(`
        SELECT 
          COUNT(*) as file_count,
          COALESCE(SUM(size), 0) as used_bytes
        FROM files 
        WHERE is_deleted = 0
      `);
      const stats = statsStmt.get() as { file_count: number; used_bytes: number };
      
      // Get total storage capacity (from mount point or config)
      const totalBytes = this.getTotalStorageBytes();
      
      // Update storage_stats table
      const updateStmt = db.prepare(`
        UPDATE storage_stats 
        SET total_bytes = ?, 
            used_bytes = ?, 
            file_count = ?,
            updated_at = ?
        WHERE id = 1
      `);
      
      updateStmt.run(totalBytes, stats.used_bytes, stats.file_count, Date.now());
      
    } catch (error) {
      console.error('Failed to update storage stats:', error);
    }
  }
  
  /**
   * Get total storage capacity in bytes
   */
  private static getTotalStorageBytes(): number {
    try {
      const storagePath = process.env.STORAGE_PATH || '/mnt/pocketcloud';
      
      // Use df command to get filesystem size
      const output = execSync(`df -B1 "${storagePath}" | tail -1 | awk '{print $2}'`, { encoding: 'utf8' });
      const totalBytes = parseInt(output.trim());
      
      if (isNaN(totalBytes) || totalBytes <= 0) {
        console.warn('Could not determine storage size, using default 1TB');
        return 1024 * 1024 * 1024 * 1024; // 1TB default
      }
      
      return totalBytes;
      
    } catch (error) {
      console.error('Failed to get storage size:', error);
      return 1024 * 1024 * 1024 * 1024; // 1TB default
    }
  }
}