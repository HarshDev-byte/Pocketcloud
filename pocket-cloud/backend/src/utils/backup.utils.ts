import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { db } from '../db';

export class BackupUtils {
  private static readonly BACKUP_DIR = process.env.BACKUP_DIR || join(process.cwd(), 'backups');
  private static readonly MAX_BACKUPS = 7; // Keep last 7 backups
  private static readonly DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'storage.db');

  /**
   * Create a daily backup of the SQLite database
   */
  public static createDailyBackup(): { success: boolean; backupPath?: string; error?: string } {
    try {
      // Ensure backup directory exists
      if (!existsSync(this.BACKUP_DIR)) {
        mkdirSync(this.BACKUP_DIR, { recursive: true });
      }

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const backupFilename = `pocket-cloud-${timestamp}.db`;
      const backupPath = join(this.BACKUP_DIR, backupFilename);

      // Skip if backup for today already exists
      if (existsSync(backupPath)) {
        return { success: true, backupPath };
      }

      // Perform SQLite backup using VACUUM INTO (atomic operation)
      const backupStmt = db.prepare(`VACUUM INTO ?`);
      backupStmt.run(backupPath);

      // Verify backup integrity
      const isValid = this.verifyBackupIntegrity(backupPath);
      if (!isValid) {
        // Remove corrupted backup
        if (existsSync(backupPath)) {
          unlinkSync(backupPath);
        }
        return { success: false, error: 'Backup integrity check failed' };
      }

      // Clean up old backups
      this.cleanupOldBackups();

      console.log(`Database backup created: ${backupPath}`);
      return { success: true, backupPath };

    } catch (error) {
      console.error('Database backup failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Verify database integrity
   */
  public static checkDatabaseIntegrity(): { isValid: boolean; error?: string } {
    try {
      // Run SQLite integrity check
      const result = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      
      if (result.integrity_check === 'ok') {
        return { isValid: true };
      } else {
        return { isValid: false, error: result.integrity_check };
      }
    } catch (error) {
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'Integrity check failed' 
      };
    }
  }

  /**
   * Create a backup specifically for updates
   */
  public static createUpdateBackup(): { success: boolean; backupPath?: string; error?: string } {
    try {
      // Ensure backup directory exists
      if (!existsSync(this.BACKUP_DIR)) {
        mkdirSync(this.BACKUP_DIR, { recursive: true });
      }

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `update-backup-${timestamp}.db`;
      const backupPath = join(this.BACKUP_DIR, backupFilename);

      // Perform SQLite backup using VACUUM INTO (atomic operation)
      const backupStmt = db.prepare(`VACUUM INTO ?`);
      backupStmt.run(backupPath);

      // Verify backup integrity
      const isValid = this.verifyBackupIntegrity(backupPath);
      if (!isValid) {
        // Remove corrupted backup
        if (existsSync(backupPath)) {
          unlinkSync(backupPath);
        }
        return { success: false, error: 'Update backup integrity check failed' };
      }

      console.log(`Update backup created: ${backupPath}`);
      return { success: true, backupPath };

    } catch (error) {
      console.error('Update backup failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Create a backup specifically for migrations
   */
  public static createMigrationBackup(migrationName: string): { success: boolean; backupPath?: string; error?: string } {
    try {
      // Ensure backup directory exists
      if (!existsSync(this.BACKUP_DIR)) {
        mkdirSync(this.BACKUP_DIR, { recursive: true });
      }

      // Generate backup filename with migration name and timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `migration-${migrationName}-${timestamp}.db`;
      const backupPath = join(this.BACKUP_DIR, backupFilename);

      // Perform SQLite backup using VACUUM INTO (atomic operation)
      const backupStmt = db.prepare(`VACUUM INTO ?`);
      backupStmt.run(backupPath);

      // Verify backup integrity
      const isValid = this.verifyBackupIntegrity(backupPath);
      if (!isValid) {
        // Remove corrupted backup
        if (existsSync(backupPath)) {
          unlinkSync(backupPath);
        }
        return { success: false, error: 'Migration backup integrity check failed' };
      }

      console.log(`Migration backup created: ${backupPath}`);
      return { success: true, backupPath };

    } catch (error) {
      console.error('Migration backup failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Restore from latest backup (enhanced for updates)
   */
  public static restoreLatestBackup(): { success: boolean; restoredFrom?: string; error?: string } {
    try {
      const latestBackup = this.getLatestBackup();
      if (!latestBackup) {
        return { success: false, error: 'No backup files found' };
      }

      return this.restoreFromBackup(latestBackup);
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Restore failed' 
      };
    }
  }

  /**
   * Restore database from specific backup
   */
  public static restoreFromBackup(backupPath: string): { success: boolean; restoredFrom?: string; error?: string } {
    try {
      if (!existsSync(backupPath)) {
        return { success: false, error: 'Backup file not found' };
      }

      // Verify backup integrity before restore
      const isValid = this.verifyBackupIntegrity(backupPath);
      if (!isValid) {
        return { success: false, error: 'Backup file is corrupted' };
      }

      // Close current database connection
      db.close();

      // Create backup of current database before restore
      const currentBackupPath = `${this.DB_PATH}.pre-restore-${Date.now()}`;
      if (existsSync(this.DB_PATH)) {
        copyFileSync(this.DB_PATH, currentBackupPath);
      }

      // Copy backup to main database location
      copyFileSync(backupPath, this.DB_PATH);

      // Reopen database connection
      const { db: newDb } = require('../db');
      
      // Verify restored database
      const integrityCheck = this.checkDatabaseIntegrity();
      if (!integrityCheck.isValid) {
        // Restore failed, revert to previous database
        if (existsSync(currentBackupPath)) {
          copyFileSync(currentBackupPath, this.DB_PATH);
        }
        return { success: false, error: `Restored database is corrupted: ${integrityCheck.error}` };
      }

      // Clean up pre-restore backup
      if (existsSync(currentBackupPath)) {
        unlinkSync(currentBackupPath);
      }

      console.log(`Database restored from: ${backupPath}`);
      return { success: true, restoredFrom: backupPath };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Restore failed' 
      };
    }
  }

  /**
   * Get list of available backups
   */
  public static getAvailableBackups(): Array<{ path: string; filename: string; size: number; created: Date }> {
    try {
      if (!existsSync(this.BACKUP_DIR)) {
        return [];
      }

      const files = readdirSync(this.BACKUP_DIR)
        .filter(file => file.endsWith('.db'))
        .map(file => {
          const filePath = join(this.BACKUP_DIR, file);
          const stats = statSync(filePath);
          return {
            path: filePath,
            filename: file,
            size: stats.size,
            created: stats.birthtime
          };
        })
        .sort((a, b) => b.created.getTime() - a.created.getTime()); // Newest first

      return files;
    } catch (error) {
      console.error('Error listing backups:', error);
      return [];
    }
  }

  /**
   * Get latest backup file path
   */
  private static getLatestBackup(): string | null {
    const backups = this.getAvailableBackups();
    return backups.length > 0 ? backups[0].path : null;
  }

  /**
   * Verify backup file integrity
   */
  private static verifyBackupIntegrity(backupPath: string): boolean {
    try {
      // Use sqlite3 command line tool to check integrity
      const result = execSync(`sqlite3 "${backupPath}" "PRAGMA integrity_check;"`, { 
        encoding: 'utf8',
        timeout: 30000 // 30 second timeout
      });
      
      return result.trim() === 'ok';
    } catch (error) {
      console.error('Backup integrity check failed:', error);
      return false;
    }
  }

  /**
   * Clean up old backup files (keep only MAX_BACKUPS)
   */
  private static cleanupOldBackups(): void {
    try {
      const backups = this.getAvailableBackups();
      
      if (backups.length > this.MAX_BACKUPS) {
        const toDelete = backups.slice(this.MAX_BACKUPS);
        
        for (const backup of toDelete) {
          unlinkSync(backup.path);
          console.log(`Deleted old backup: ${backup.filename}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old backups:', error);
    }
  }

  /**
   * Get backup statistics
   */
  public static getBackupStats(): {
    totalBackups: number;
    totalSize: number;
    oldestBackup?: Date;
    newestBackup?: Date;
  } {
    const backups = this.getAvailableBackups();
    
    if (backups.length === 0) {
      return { totalBackups: 0, totalSize: 0 };
    }

    const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
    const oldestBackup = backups[backups.length - 1].created;
    const newestBackup = backups[0].created;

    return {
      totalBackups: backups.length,
      totalSize,
      oldestBackup,
      newestBackup
    };
  }

  /**
   * Initialize backup system on startup
   */
  public static initializeBackupSystem(): void {
    try {
      // Check database integrity on startup
      const integrityCheck = this.checkDatabaseIntegrity();
      
      if (!integrityCheck.isValid) {
        console.error('Database corruption detected on startup:', integrityCheck.error);
        
        // Attempt to restore from latest backup
        const restoreResult = this.restoreFromLatestBackup();
        
        if (restoreResult.success) {
          console.log('Database successfully restored from backup');
        } else {
          console.error('Failed to restore database from backup:', restoreResult.error);
          throw new Error('Database is corrupted and cannot be restored');
        }
      }

      // Ensure backup directory exists
      if (!existsSync(this.BACKUP_DIR)) {
        mkdirSync(this.BACKUP_DIR, { recursive: true });
      }

      console.log('Backup system initialized');
    } catch (error) {
      console.error('Failed to initialize backup system:', error);
      throw error;
    }
  }
}