import { db, DB_PATH } from '../db/client';
import { logger } from '../utils/logger';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, unlinkSync, copyFileSync, renameSync, createReadStream } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';

// Declare Node.js globals
declare const process: any;
declare const global: any;

const BACKUP_DIR = process.env.BACKUP_DIR || '/mnt/pocketcloud/backups';
const KEEP_BACKUP_COUNT = 7; // Keep last 7 daily backups

interface BackupMeta {
  fileName: string;
  checksum: string;
  sizeBytes: number;
  reason: string;
  createdAt: number;
  dbVersion: number;
}

interface BackupVerification {
  valid: boolean;
  error?: string;
  checksum?: string;
  sizeBytes?: number;
}

// Global maintenance mode flag
let maintenanceMode = false;

export class BackupService {
  /**
   * Create a backup of the current database
   */
  static async createBackup(reason: string = 'scheduled'): Promise<BackupMeta> {
    // Ensure backup directory exists
    mkdirSync(BACKUP_DIR, { recursive: true });

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `pocketcloud-${timestamp}-${reason}.db`;
    const backupPath = join(BACKUP_DIR, fileName);

    logger.info('Starting database backup', { fileName, reason });

    try {
      // Use SQLite online backup API (safe while DB is in use)
      await new Promise<void>((resolve, reject) => {
        // better-sqlite3 backup method
        const backup = db.backup(backupPath);
        backup
          .then(() => {
            logger.info('SQLite backup completed', { backupPath });
            resolve();
          })
          .catch((error) => {
            logger.error('SQLite backup failed', { backupPath, error: error.message });
            reject(error);
          });
      });

      // Compute checksum of backup file
      const hash = createHash('sha256');
      const fileBuffer = readFileSync(backupPath);
      hash.update(fileBuffer);
      const checksum = hash.digest('hex');

      // Get file stats
      const stats = statSync(backupPath);

      // Create metadata
      const meta: BackupMeta = {
        fileName,
        checksum,
        sizeBytes: stats.size,
        reason,
        createdAt: Date.now(),
        dbVersion: this.getCurrentMigrationVersion()
      };

      // Write metadata file
      const metaPath = backupPath + '.meta.json';
      writeFileSync(metaPath, JSON.stringify(meta, null, 2));

      // Rotate old backups
      this.rotateBackups(BACKUP_DIR, KEEP_BACKUP_COUNT);

      logger.info('Backup created successfully', {
        fileName,
        sizeBytes: meta.sizeBytes,
        checksum: checksum.substring(0, 16) + '...',
        reason
      });

      return meta;

    } catch (error: any) {
      // Clean up failed backup file
      if (existsSync(backupPath)) {
        unlinkSync(backupPath);
      }
      
      logger.error('Backup creation failed', {
        fileName,
        reason,
        error: error.message
      });
      
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * Rotate old backups, keeping only the specified count
   */
  private static rotateBackups(backupDir: string, keepCount: number): void {
    try {
      // Get all backup files sorted by modification time (newest first)
      const backups = readdirSync(backupDir)
        .filter((f: string) => f.endsWith('.db'))
        .map((f: string) => ({
          name: f,
          mtime: statSync(join(backupDir, f)).mtime
        }))
        .sort((a: any, b: any) => b.mtime.getTime() - a.mtime.getTime());

      // Delete old backups beyond keep count
      const toDelete = backups.slice(keepCount);
      
      for (const backup of toDelete) {
        const backupPath = join(backupDir, backup.name);
        const metaPath = backupPath + '.meta.json';
        
        // Delete backup file
        if (existsSync(backupPath)) {
          unlinkSync(backupPath);
        }
        
        // Delete metadata file
        if (existsSync(metaPath)) {
          unlinkSync(metaPath);
        }
        
        logger.info('Rotated old backup', { name: backup.name });
      }

      if (toDelete.length > 0) {
        logger.info('Backup rotation completed', {
          deleted: toDelete.length,
          remaining: backups.length - toDelete.length
        });
      }

    } catch (error: any) {
      logger.error('Backup rotation failed', { error: error.message });
    }
  }
  /**
   * List all available backups with metadata
   */
  static listBackups(): BackupMeta[] {
    try {
      if (!existsSync(BACKUP_DIR)) {
        return [];
      }

      const backups: BackupMeta[] = [];
      const files = readdirSync(BACKUP_DIR);

      for (const file of files) {
        if (!file.endsWith('.db')) continue;

        const backupPath = join(BACKUP_DIR, file);
        const metaPath = backupPath + '.meta.json';

        try {
          if (existsSync(metaPath)) {
            // Read metadata from .meta.json file
            const metaContent = readFileSync(metaPath, 'utf8');
            const meta = JSON.parse(metaContent) as BackupMeta;
            backups.push(meta);
          } else {
            // Generate basic metadata from file stats if .meta.json is missing
            const stats = statSync(backupPath);
            const basicMeta: BackupMeta = {
              fileName: file,
              checksum: 'unknown',
              sizeBytes: stats.size,
              reason: 'unknown',
              createdAt: stats.mtime.getTime(),
              dbVersion: 0
            };
            backups.push(basicMeta);
          }
        } catch (error: any) {
          logger.warn('Failed to read backup metadata', {
            file,
            error: error.message
          });
        }
      }

      // Sort by creation time (newest first)
      return backups.sort((a, b) => b.createdAt - a.createdAt);

    } catch (error: any) {
      logger.error('Failed to list backups', { error: error.message });
      return [];
    }
  }

  /**
   * Verify backup file integrity
   */
  static async verifyBackup(fileName: string): Promise<BackupVerification> {
    const backupPath = join(BACKUP_DIR, fileName);
    const metaPath = backupPath + '.meta.json';

    try {
      // Check if backup file exists
      if (!existsSync(backupPath)) {
        return { valid: false, error: 'Backup file not found' };
      }

      // Get file stats
      const stats = statSync(backupPath);
      
      // Compute current checksum
      const hash = createHash('sha256');
      const fileBuffer = readFileSync(backupPath);
      hash.update(fileBuffer);
      const currentChecksum = hash.digest('hex');

      // Check against stored checksum if metadata exists
      if (existsSync(metaPath)) {
        try {
          const metaContent = readFileSync(metaPath, 'utf8');
          const meta = JSON.parse(metaContent) as BackupMeta;
          
          if (meta.checksum !== currentChecksum) {
            return {
              valid: false,
              error: 'Checksum mismatch - backup file may be corrupted',
              checksum: currentChecksum,
              sizeBytes: stats.size
            };
          }
        } catch (error: any) {
          logger.warn('Failed to read backup metadata for verification', {
            fileName,
            error: error.message
          });
        }
      }

      // Try to open the database file to verify it's a valid SQLite database
      try {
        const testDb = new Database(backupPath, { readonly: true });
        
        // Try a simple query to verify database structure
        testDb.prepare('SELECT COUNT(*) as count FROM sqlite_master WHERE type="table"').get();
        testDb.close();
        
        return {
          valid: true,
          checksum: currentChecksum,
          sizeBytes: stats.size
        };

      } catch (dbError: any) {
        return {
          valid: false,
          error: `Invalid SQLite database: ${dbError.message}`,
          checksum: currentChecksum,
          sizeBytes: stats.size
        };
      }

    } catch (error: any) {
      return {
        valid: false,
        error: `Verification failed: ${error.message}`
      };
    }
  }

  /**
   * Restore database from backup (DANGEROUS OPERATION)
   */
  static async restoreFromBackup(fileName: string, adminUserId: string): Promise<void> {
    const backupPath = join(BACKUP_DIR, fileName);
    
    logger.warn('Database restore initiated', {
      fileName,
      adminUserId,
      timestamp: new Date().toISOString()
    });

    try {
      // 1. Verify backup file exists and is valid
      if (!existsSync(backupPath)) {
        throw new Error('Backup file not found');
      }

      const verification = await this.verifyBackup(fileName);
      if (!verification.valid) {
        throw new Error(`Backup verification failed: ${verification.error}`);
      }

      // 2. Create emergency backup of current database
      const emergencyBackup = await this.createBackup('pre-restore-emergency');
      logger.info('Emergency backup created before restore', {
        emergencyBackup: emergencyBackup.fileName
      });

      // 3. Set maintenance mode and notify clients
      maintenanceMode = true;
      
      try {
        // Dynamic import for realtime service
        const realtimeModule = await import('./realtime.service');
        realtimeModule.RealtimeService.sendToAll('system:maintenance' as any, {
          maintenance: true,
          message: 'System is being restored from backup. Please wait...',
          estimatedDuration: '30 seconds'
        });
      } catch (error) {
        // Realtime service might not be available, continue anyway
        logger.warn('Could not notify clients of maintenance mode', { error });
      }

      // 4. Wait for in-progress requests to finish
      logger.info('Waiting for in-progress requests to complete...');
      await new Promise<void>(resolve => {
        const timer = global.setTimeout(resolve, 5000);
        // Clear the timer reference to avoid memory leaks
        timer.unref();
      });

      // 5. Close current database connection
      logger.info('Closing database connection for restore...');
      db.close();

      // 6. Atomic file replacement
      const tempPath = DB_PATH + '.restoring';
      
      // Copy backup to temporary location
      copyFileSync(backupPath, tempPath);
      
      // Atomic rename (this is the critical moment)
      renameSync(tempPath, DB_PATH);
      
      logger.info('Database file replaced successfully');

      // 7. Re-initialize database connection
      const clientModule = await import('../db/client');
      await clientModule.initializeDatabase();

      // 8. Run migrations in case backup is from older version
      const migrateModule = await import('../db/migrate');
      await migrateModule.runMigrations();

      // 9. Clear maintenance mode
      maintenanceMode = false;

      // 10. Notify clients that restore is complete
      try {
        const realtimeModule = await import('./realtime.service');
        realtimeModule.RealtimeService.sendToAll('system:maintenance' as any, {
          maintenance: false,
          message: 'System restore completed successfully. Please refresh your browser.',
          restored: true
        });
      } catch (error) {
        logger.warn('Could not notify clients of restore completion', { error });
      }

      logger.info('Database restore completed successfully', {
        fileName,
        adminUserId,
        emergencyBackup: emergencyBackup.fileName
      });

    } catch (error: any) {
      // Clear maintenance mode on error
      maintenanceMode = false;
      
      logger.error('Database restore failed', {
        fileName,
        adminUserId,
        error: error.message
      });
      
      throw new Error(`Restore failed: ${error.message}`);
    }
  }

  /**
   * Get current database migration version
   */
  private static getCurrentMigrationVersion(): number {
    try {
      // Check if migrations table exists
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='migrations'
      `).get();

      if (!tableExists) {
        return 0;
      }

      // Get latest migration version
      const result = db.prepare(`
        SELECT version FROM migrations 
        ORDER BY version DESC 
        LIMIT 1
      `).get() as { version: number } | undefined;

      return result?.version || 0;

    } catch (error: any) {
      logger.warn('Could not determine migration version', { error: error.message });
      return 0;
    }
  }

  /**
   * Check if system is in maintenance mode
   */
  static isMaintenanceMode(): boolean {
    return maintenanceMode;
  }

  /**
   * Get backup file path for download
   */
  static getBackupPath(fileName: string): string {
    return join(BACKUP_DIR, fileName);
  }

  /**
   * Verify database integrity on startup
   */
  static async verifyDatabaseIntegrity(): Promise<void> {
    try {
      logger.info('Running database integrity check...');
      
      const result = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      
      if (result.integrity_check !== 'ok') {
        logger.error('Database integrity check FAILED', { result });
        
        // Attempt restore from latest backup
        const backups = this.listBackups();
        if (backups.length > 0) {
          const latestBackup = backups[0];
          logger.warn('Attempting automatic restore from latest backup...', {
            backup: latestBackup.fileName
          });
          
          // Create emergency backup of corrupted database
          const corruptedPath = DB_PATH + '.corrupted.' + Date.now();
          copyFileSync(DB_PATH, corruptedPath);
          logger.info('Corrupted database saved', { path: corruptedPath });
          
          // Restore from backup
          const backupPath = join(BACKUP_DIR, latestBackup.fileName);
          copyFileSync(backupPath, DB_PATH);
          
          logger.info('Database restored from backup', {
            backup: latestBackup.fileName,
            corruptedBackup: corruptedPath
          });
          
          // Re-run integrity check
          const recheckResult = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
          if (recheckResult.integrity_check === 'ok') {
            logger.info('Database integrity restored successfully');
          } else {
            logger.error('Database still corrupted after restore');
            process.exit(1);
          }
          
        } else {
          logger.error('No backups available for automatic restore. Database may be corrupted.');
          process.exit(1);
        }
      } else {
        logger.info('Database integrity check passed');
      }

    } catch (error: any) {
      logger.error('Could not run database integrity check', {
        error: error.message
      });
      
      // Don't exit on integrity check failure - the database might still be usable
      logger.warn('Continuing startup despite integrity check failure');
    }
  }

  /**
   * Initialize backup service and run startup integrity check
   */
  static async initialize(): Promise<void> {
    try {
      logger.info('Initializing backup service...');
      
      // Ensure backup directory exists
      mkdirSync(BACKUP_DIR, { recursive: true });
      
      // Run database integrity check
      await this.verifyDatabaseIntegrity();
      
      logger.info('Backup service initialized successfully');
    } catch (error: any) {
      logger.error('Backup service initialization failed', { error: error.message });
      throw error;
    }
  }
}