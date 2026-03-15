/**
 * Node.js backup script - backup a local folder to Pi nightly
 */

import { PocketCloudClient } from '../src/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { CronJob } from 'cron';

interface BackupConfig {
  localPath: string;
  remotePath: string;
  schedule: string; // Cron expression
  excludePatterns: string[];
}

class BackupService {
  private client: PocketCloudClient;
  private config: BackupConfig;

  constructor(client: PocketCloudClient, config: BackupConfig) {
    this.client = client;
    this.config = config;
  }

  /**
   * Start scheduled backups
   */
  start(): void {
    console.log(`Starting backup service for ${this.config.localPath}`);
    console.log(`Schedule: ${this.config.schedule}`);
    console.log(`Remote path: ${this.config.remotePath}`);

    const job = new CronJob(this.config.schedule, async () => {
      try {
        await this.runBackup();
      } catch (error) {
        console.error('Backup failed:', error);
      }
    });

    job.start();
    console.log('Backup service started');
  }

  /**
   * Run a single backup
   */
  async runBackup(): Promise<void> {
    const startTime = Date.now();
    console.log(`\n🔄 Starting backup at ${new Date().toISOString()}`);

    try {
      // Create timestamped backup folder
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const backupPath = `${this.config.remotePath}/backup-${timestamp}`;

      // Upload directory with progress tracking
      let totalFiles = 0;
      let completedFiles = 0;

      const results = await this.client.upload.directory(this.config.localPath, {
        remotePath: backupPath,
        recursive: true,
        filter: (filePath) => this.shouldIncludeFile(filePath),
        onDirectoryProgress: ({ current, total, fileName }) => {
          totalFiles = total;
          completedFiles = current;
          const percent = Math.round((current / total) * 100);
          console.log(`📁 [${percent}%] ${fileName} (${current}/${total})`);
        },
        onProgress: ({ percent, speed }) => {
          const speedMB = (speed / 1024 / 1024).toFixed(1);
          process.stdout.write(`\r📤 Uploading: ${percent}% @ ${speedMB} MB/s`);
        }
      });

      const duration = Math.round((Date.now() - startTime) / 1000);
      const totalSize = results.files.reduce((sum, file) => sum + file.size, 0);
      const sizeMB = (totalSize / 1024 / 1024).toFixed(1);

      console.log(`\n✅ Backup completed in ${duration}s`);
      console.log(`📊 ${results.files.length} files uploaded (${sizeMB} MB)`);

      if (results.errors.length > 0) {
        console.log(`⚠️  ${results.errors.length} errors:`);
        results.errors.forEach(error => {
          console.log(`   ${error.path}: ${error.error.message}`);
        });
      }

      // Clean up old backups (keep last 7 days)
      await this.cleanupOldBackups();

    } catch (error) {
      console.error('❌ Backup failed:', error);
      throw error;
    }
  }

  /**
   * Check if file should be included in backup
   */
  private shouldIncludeFile(filePath: string): boolean {
    return !this.config.excludePatterns.some(pattern => {
      return filePath.includes(pattern) || 
             filePath.match(new RegExp(pattern.replace(/\*/g, '.*')));
    });
  }

  /**
   * Clean up old backup folders
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      // Get backup folder contents
      const backupFolder = await this.client.folders.createPath(this.config.remotePath);
      const contents = await this.client.folders.getContents(backupFolder.id);
      
      // Find backup folders older than 7 days
      const cutoffDate = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const oldBackups = contents.folders.filter(folder => {
        return folder.name.startsWith('backup-') && folder.createdAt < cutoffDate;
      });

      // Delete old backups
      for (const folder of oldBackups) {
        console.log(`🗑️  Cleaning up old backup: ${folder.name}`);
        await this.client.folders.permanentDelete(folder.id);
      }

      if (oldBackups.length > 0) {
        console.log(`🧹 Cleaned up ${oldBackups.length} old backups`);
      }

    } catch (error) {
      console.error('Failed to cleanup old backups:', error);
    }
  }
}

// Example usage
async function main() {
  // Auto-discover Pi or use specific URL
  const client = await PocketCloudClient.discover({
    apiKey: process.env.POCKETCLOUD_API_KEY
  });

  const backupService = new BackupService(client, {
    localPath: '/Users/alice/Documents',
    remotePath: '/Backups/Documents',
    schedule: '0 2 * * *', // Every day at 2 AM
    excludePatterns: [
      '.DS_Store',
      '*.tmp',
      'node_modules',
      '.git',
      '*.log'
    ]
  });

  // Start scheduled backups
  backupService.start();

  // Or run backup immediately
  // await backupService.runBackup();
}

if (require.main === module) {
  main().catch(console.error);
}

export { BackupService };