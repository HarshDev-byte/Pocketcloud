import cron from 'node-cron';
import { TrashService } from '../services/trash.service';
import { ShareService } from '../services/share.service';
import { ActivityService } from '../services/activity.service';
import { BackupService } from '../services/backup.service';
import { AnalyticsService } from '../services/analytics.service';
import { db } from '../db/client';
import { logger } from '../utils/logger';

export function startCleanupJob(): void {
  // Schedule daily storage snapshots at 1 AM
  cron.schedule('0 1 * * *', async () => {
    logger.info('Taking daily storage snapshots...');
    
    try {
      // Take snapshot for each active user
      const users = db.prepare('SELECT id FROM users WHERE is_active = 1').all() as { id: string }[];
      for (const user of users) {
        AnalyticsService.takeSnapshot(user.id);
      }
      
      // Take global snapshot
      AnalyticsService.takeSnapshot();
      
      logger.info('Daily snapshots completed', { userCount: users.length });
    } catch (error: any) {
      logger.error('Snapshot job failed', { 
        error: error.message, 
        stack: error.stack 
      });
    }
  });

  // Schedule daily backup at 2 AM (1 hour before cleanup)
  cron.schedule('0 2 * * *', async () => {
    logger.info('Starting scheduled database backup...');
    
    try {
      const backup = await BackupService.createBackup('scheduled');
      logger.info('Scheduled backup completed', {
        fileName: backup.fileName,
        sizeBytes: backup.sizeBytes
      });
    } catch (error: any) {
      logger.error('Scheduled backup failed', { 
        error: error.message, 
        stack: error.stack 
      });
    }
  });

  // Run cleanup at 3 AM every day
  cron.schedule('0 3 * * *', async () => {
    logger.info('Starting daily cleanup job...');
    
    try {
      const trashResult = await TrashService.purgeExpiredItems();
      const shareResult = await ShareService.cleanExpiredShares();
      const activityResult = await ActivityService.purgeOldLogs();
      
      // Clean old sync events
      const { SyncService } = require('../services/sync.service');
      const syncResult = SyncService.cleanOldEvents();
      
      if (trashResult.filesDeleted > 0 || trashResult.foldersDeleted > 0 || trashResult.uploadsCleaned > 0 || shareResult.deleted > 0 || activityResult.deleted > 0 || syncResult.deleted > 0) {
        logger.info('Cleanup complete', {
          filesDeleted: trashResult.filesDeleted,
          foldersDeleted: trashResult.foldersDeleted,
          bytesFreed: trashResult.bytesFreed,
          uploadsCleaned: trashResult.uploadsCleaned,
          sharesDeleted: shareResult.deleted,
          activityLogsDeleted: activityResult.deleted,
          syncEventsDeleted: syncResult.deleted
        });
      } else {
        logger.info('Cleanup complete - no items to purge');
      }
    } catch (error: any) {
      logger.error('Cleanup job failed', { error: error.message, stack: error.stack });
    }
  });

  // Also run once on startup (catch items missed during downtime)
  setTimeout(async () => {
    logger.info('Running startup cleanup...');
    
    try {
      const trashResult = await TrashService.purgeExpiredItems();
      const shareResult = await ShareService.cleanExpiredShares();
      const activityResult = await ActivityService.purgeOldLogs();
      
      // Clean old sync events
      const { SyncService } = require('../services/sync.service');
      const syncResult = SyncService.cleanOldEvents();
      
      if (trashResult.filesDeleted > 0 || trashResult.foldersDeleted > 0 || trashResult.uploadsCleaned > 0 || shareResult.deleted > 0 || activityResult.deleted > 0 || syncResult.deleted > 0) {
        logger.info('Startup cleanup complete', {
          filesDeleted: trashResult.filesDeleted,
          foldersDeleted: trashResult.foldersDeleted,
          bytesFreed: trashResult.bytesFreed,
          uploadsCleaned: trashResult.uploadsCleaned,
          sharesDeleted: shareResult.deleted,
          activityLogsDeleted: activityResult.deleted,
          syncEventsDeleted: syncResult.deleted
        });
      }
    } catch (error: any) {
      logger.error('Startup cleanup failed', { error: error.message });
    }
  }, 10000); // 10 seconds after startup

  logger.info('Backup and cleanup jobs scheduled');
  logger.info('- Daily snapshots: 1 AM');
  logger.info('- Daily backup: 2 AM');
  logger.info('- Daily cleanup: 3 AM');
}