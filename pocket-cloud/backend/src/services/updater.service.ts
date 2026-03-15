import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import crypto from 'crypto';
import { LoggerService } from './logger.service';
import { realtimeService } from './realtime.service';
import { BackupUtils } from '../utils/backup.utils';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  sha256?: string;
  releaseDate?: string;
  size?: number;
}

export interface UpdateStatus {
  phase: 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'migrating' | 'restarting' | 'complete' | 'error' | 'rollback';
  progress: number; // 0-100
  message: string;
  error?: string;
  startTime?: number;
  estimatedTime?: number;
}

export class UpdaterService {
  private static currentStatus: UpdateStatus = {
    phase: 'idle',
    progress: 0,
    message: 'Ready'
  };

  private static readonly UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'https://updates.pocketcloud.dev';
  private static readonly INSTALL_PATH = process.env.INSTALL_PATH || '/opt/pocketcloud';
  private static readonly BACKUP_PATH = '/opt/pocketcloud-backup';
  private static readonly NEW_PATH = '/opt/pocketcloud-new';
  private static readonly SERVICE_NAME = 'pocketcloud-backend';

  /**
   * Get current version from package.json
   */
  public static getCurrentVersion(): string {
    try {
      const packagePath = join(__dirname, '../../../package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
      return packageJson.version || '1.0.0';
    } catch (error) {
      LoggerService.error('updater', 'Failed to get current version', undefined, { 
        error: (error as Error).message 
      });
      return '1.0.0';
    }
  }

  /**
   * Check for available updates
   */
  public static async checkForUpdates(): Promise<UpdateInfo> {
    this.updateStatus('checking', 0, 'Checking for updates...');

    try {
      const currentVersion = this.getCurrentVersion();
      
      // Try Git-based update first (if in git repo)
      if (this.isGitRepository()) {
        return await this.checkGitUpdates(currentVersion);
      }
      
      // Fall back to release bundle update
      return await this.checkReleaseUpdates(currentVersion);

    } catch (error) {
      LoggerService.error('updater', 'Failed to check for updates', undefined, { 
        error: (error as Error).message 
      });
      
      this.updateStatus('error', 0, 'Failed to check for updates', (error as Error).message);
      
      return {
        available: false,
        currentVersion: this.getCurrentVersion()
      };
    }
  }

  /**
   * Apply available update
   */
  public static async applyUpdate(): Promise<boolean> {
    try {
      this.updateStatus('installing', 0, 'Starting update process...');

      // Create database backup before update
      this.updateStatus('installing', 10, 'Creating database backup...');
      const backupResult = BackupUtils.createUpdateBackup();
      if (!backupResult.success) {
        throw new Error(`Database backup failed: ${backupResult.error}`);
      }

      // Determine update method
      if (this.isGitRepository()) {
        return await this.applyGitUpdate();
      } else {
        return await this.applyReleaseUpdate();
      }

    } catch (error) {
      LoggerService.error('updater', 'Update failed', undefined, { 
        error: (error as Error).message 
      });
      
      this.updateStatus('error', 0, 'Update failed', (error as Error).message);
      return false;
    }
  }

  /**
   * Rollback to previous version
   */
  public static async rollback(): Promise<boolean> {
    try {
      this.updateStatus('rollback', 0, 'Starting rollback...');

      if (this.isGitRepository()) {
        return await this.rollbackGit();
      } else {
        return await this.rollbackRelease();
      }

    } catch (error) {
      LoggerService.error('updater', 'Rollback failed', undefined, { 
        error: (error as Error).message 
      });
      
      this.updateStatus('error', 0, 'Rollback failed', (error as Error).message);
      return false;
    }
  }

  /**
   * Get current update status
   */
  public static getStatus(): UpdateStatus {
    return { ...this.currentStatus };
  }

  /**
   * Check if running in git repository
   */
  private static isGitRepository(): boolean {
    try {
      execSync('git rev-parse --git-dir', { 
        cwd: this.INSTALL_PATH,
        stdio: 'ignore' 
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check for Git-based updates
   */
  private static async checkGitUpdates(currentVersion: string): Promise<UpdateInfo> {
    this.updateStatus('checking', 25, 'Fetching latest changes...');

    try {
      // Fetch latest changes
      execSync('git fetch origin', { 
        cwd: this.INSTALL_PATH,
        stdio: 'pipe' 
      });

      // Get current and remote commit hashes
      const currentCommit = execSync('git rev-parse HEAD', { 
        cwd: this.INSTALL_PATH,
        encoding: 'utf8' 
      }).trim();

      const remoteCommit = execSync('git rev-parse origin/main', { 
        cwd: this.INSTALL_PATH,
        encoding: 'utf8' 
      }).trim();

      this.updateStatus('checking', 75, 'Comparing versions...');

      if (currentCommit === remoteCommit) {
        this.updateStatus('idle', 100, 'No updates available');
        return {
          available: false,
          currentVersion
        };
      }

      // Get commit messages for release notes
      const releaseNotes = execSync(`git log --oneline ${currentCommit}..${remoteCommit}`, {
        cwd: this.INSTALL_PATH,
        encoding: 'utf8'
      }).trim();

      this.updateStatus('idle', 100, 'Update available');

      return {
        available: true,
        currentVersion,
        latestVersion: remoteCommit.substring(0, 8),
        releaseNotes,
        releaseDate: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Git update check failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check for release bundle updates
   */
  private static async checkReleaseUpdates(currentVersion: string): Promise<UpdateInfo> {
    this.updateStatus('checking', 25, 'Checking update server...');

    try {
      // Check if we have internet connectivity
      const hasInternet = await this.checkInternetConnectivity();
      if (!hasInternet) {
        this.updateStatus('idle', 100, 'No internet connection');
        return {
          available: false,
          currentVersion
        };
      }

      // Fetch latest version info
      const response = await fetch(`${this.UPDATE_SERVER_URL}/api/latest`);
      if (!response.ok) {
        throw new Error(`Update server returned ${response.status}`);
      }

      const updateInfo = await response.json();
      
      this.updateStatus('checking', 75, 'Comparing versions...');

      const isNewer = this.compareVersions(updateInfo.version, currentVersion) > 0;
      
      this.updateStatus('idle', 100, isNewer ? 'Update available' : 'No updates available');

      return {
        available: isNewer,
        currentVersion,
        latestVersion: updateInfo.version,
        releaseNotes: updateInfo.releaseNotes,
        downloadUrl: updateInfo.downloadUrl,
        sha256: updateInfo.sha256,
        releaseDate: updateInfo.releaseDate,
        size: updateInfo.size
      };

    } catch (error) {
      throw new Error(`Release update check failed: ${(error as Error).message}`);
    }
  }

  /**
   * Apply Git-based update
   */
  private static async applyGitUpdate(): Promise<boolean> {
    try {
      this.updateStatus('installing', 20, 'Pulling latest changes...');
      
      // Pull latest changes
      execSync('git pull origin main', { 
        cwd: this.INSTALL_PATH,
        stdio: 'pipe' 
      });

      this.updateStatus('installing', 40, 'Installing backend dependencies...');
      
      // Install backend dependencies
      execSync('pnpm install --prod', { 
        cwd: join(this.INSTALL_PATH, 'backend'),
        stdio: 'pipe' 
      });

      this.updateStatus('installing', 60, 'Building frontend...');
      
      // Build frontend
      execSync('pnpm build', { 
        cwd: join(this.INSTALL_PATH, 'frontend'),
        stdio: 'pipe' 
      });

      this.updateStatus('migrating', 80, 'Running database migrations...');
      
      // Run database migrations
      execSync('pnpm run migrate', { 
        cwd: join(this.INSTALL_PATH, 'backend'),
        stdio: 'pipe' 
      });

      this.updateStatus('restarting', 90, 'Restarting service...');
      
      // Restart service
      await this.restartService();

      this.updateStatus('complete', 100, 'Update completed successfully');
      return true;

    } catch (error) {
      throw new Error(`Git update failed: ${(error as Error).message}`);
    }
  }

  /**
   * Apply release bundle update
   */
  private static async applyReleaseUpdate(): Promise<boolean> {
    try {
      const updateInfo = await this.checkReleaseUpdates(this.getCurrentVersion());
      if (!updateInfo.available || !updateInfo.downloadUrl) {
        throw new Error('No update available');
      }

      this.updateStatus('downloading', 10, 'Downloading update...');
      
      // Download update bundle
      const bundlePath = await this.downloadUpdate(updateInfo.downloadUrl, updateInfo.size);

      this.updateStatus('verifying', 50, 'Verifying download...');
      
      // Verify download integrity
      if (updateInfo.sha256) {
        await this.verifyDownload(bundlePath, updateInfo.sha256);
      }

      this.updateStatus('installing', 60, 'Extracting update...');
      
      // Extract to temporary location
      await this.extractUpdate(bundlePath);

      this.updateStatus('migrating', 75, 'Running database migrations...');
      
      // Run migrations from new version
      execSync('pnpm run migrate', { 
        cwd: join(this.NEW_PATH, 'backend'),
        stdio: 'pipe' 
      });

      this.updateStatus('installing', 85, 'Installing update...');
      
      // Atomic swap
      await this.atomicSwap();

      this.updateStatus('restarting', 95, 'Restarting service...');
      
      // Restart service
      await this.restartService();

      this.updateStatus('complete', 100, 'Update completed successfully');
      return true;

    } catch (error) {
      // Clean up on failure
      if (existsSync(this.NEW_PATH)) {
        rmSync(this.NEW_PATH, { recursive: true, force: true });
      }
      throw new Error(`Release update failed: ${(error as Error).message}`);
    }
  }

  /**
   * Rollback Git-based update
   */
  private static async rollbackGit(): Promise<boolean> {
    try {
      this.updateStatus('rollback', 25, 'Reverting to previous commit...');
      
      // Revert to previous commit
      execSync('git checkout HEAD~1', { 
        cwd: this.INSTALL_PATH,
        stdio: 'pipe' 
      });

      this.updateStatus('rollback', 50, 'Rebuilding application...');
      
      // Rebuild
      execSync('pnpm install --prod', { 
        cwd: join(this.INSTALL_PATH, 'backend'),
        stdio: 'pipe' 
      });

      execSync('pnpm build', { 
        cwd: join(this.INSTALL_PATH, 'frontend'),
        stdio: 'pipe' 
      });

      this.updateStatus('rollback', 75, 'Restoring database...');
      
      // Restore database backup
      const restoreResult = BackupUtils.restoreLatestBackup();
      if (!restoreResult.success) {
        throw new Error(`Database restore failed: ${restoreResult.error}`);
      }

      this.updateStatus('rollback', 90, 'Restarting service...');
      
      // Restart service
      await this.restartService();

      this.updateStatus('idle', 100, 'Rollback completed');
      return true;

    } catch (error) {
      throw new Error(`Git rollback failed: ${(error as Error).message}`);
    }
  }

  /**
   * Rollback release-based update
   */
  private static async rollbackRelease(): Promise<boolean> {
    try {
      if (!existsSync(this.BACKUP_PATH)) {
        throw new Error('No backup available for rollback');
      }

      this.updateStatus('rollback', 25, 'Restoring previous version...');
      
      // Stop service
      execSync(`sudo systemctl stop ${this.SERVICE_NAME}`, { stdio: 'pipe' });

      // Atomic restore
      if (existsSync(this.INSTALL_PATH)) {
        rmSync(this.INSTALL_PATH, { recursive: true, force: true });
      }
      renameSync(this.BACKUP_PATH, this.INSTALL_PATH);

      this.updateStatus('rollback', 75, 'Restoring database...');
      
      // Restore database backup
      const restoreResult = BackupUtils.restoreLatestBackup();
      if (!restoreResult.success) {
        throw new Error(`Database restore failed: ${restoreResult.error}`);
      }

      this.updateStatus('rollback', 90, 'Restarting service...');
      
      // Restart service
      await this.restartService();

      this.updateStatus('idle', 100, 'Rollback completed');
      return true;

    } catch (error) {
      throw new Error(`Release rollback failed: ${(error as Error).message}`);
    }
  }

  /**
   * Download update bundle
   */
  private static async downloadUpdate(url: string, expectedSize?: number): Promise<string> {
    const bundlePath = '/tmp/pocketcloud-update.tar.gz';
    
    return new Promise((resolve, reject) => {
      const process = spawn('curl', [
        '-L', // Follow redirects
        '-o', bundlePath,
        '--progress-bar',
        url
      ]);

      let downloadedBytes = 0;
      
      process.stderr.on('data', (data) => {
        // Parse curl progress output
        if (expectedSize) {
          const progress = Math.min((downloadedBytes / expectedSize) * 40, 40); // 40% of total progress
          this.updateStatus('downloading', 10 + progress, `Downloading... ${this.formatBytes(downloadedBytes)}`);
        }
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(bundlePath);
        } else {
          reject(new Error(`Download failed with code ${code}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Download error: ${error.message}`));
      });
    });
  }

  /**
   * Verify download integrity
   */
  private static async verifyDownload(filePath: string, expectedSha256: string): Promise<void> {
    const fileBuffer = readFileSync(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    const actualSha256 = hash.digest('hex');

    if (actualSha256 !== expectedSha256) {
      throw new Error(`Download verification failed. Expected: ${expectedSha256}, Got: ${actualSha256}`);
    }
  }

  /**
   * Extract update bundle
   */
  private static async extractUpdate(bundlePath: string): Promise<void> {
    // Remove existing new path
    if (existsSync(this.NEW_PATH)) {
      rmSync(this.NEW_PATH, { recursive: true, force: true });
    }

    // Create new directory
    mkdirSync(this.NEW_PATH, { recursive: true });

    // Extract bundle
    execSync(`tar -xzf "${bundlePath}" -C "${this.NEW_PATH}" --strip-components=1`, {
      stdio: 'pipe'
    });

    // Verify extraction
    if (!existsSync(join(this.NEW_PATH, 'backend', 'package.json'))) {
      throw new Error('Invalid update bundle structure');
    }
  }

  /**
   * Perform atomic swap of directories
   */
  private static async atomicSwap(): Promise<void> {
    // Stop service first
    execSync(`sudo systemctl stop ${this.SERVICE_NAME}`, { stdio: 'pipe' });

    // Backup current installation
    if (existsSync(this.BACKUP_PATH)) {
      rmSync(this.BACKUP_PATH, { recursive: true, force: true });
    }
    renameSync(this.INSTALL_PATH, this.BACKUP_PATH);

    // Move new version to install path
    renameSync(this.NEW_PATH, this.INSTALL_PATH);
  }

  /**
   * Restart the service and verify health
   */
  private static async restartService(): Promise<void> {
    // Start service
    execSync(`sudo systemctl start ${this.SERVICE_NAME}`, { stdio: 'pipe' });

    // Wait for service to start
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify health check
    const maxRetries = 12; // 60 seconds total
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch('http://localhost:3000/api/health');
        if (response.ok) {
          return; // Service is healthy
        }
      } catch (error) {
        // Service not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Service failed to start properly after update');
  }

  /**
   * Check internet connectivity
   */
  private static async checkInternetConnectivity(): Promise<boolean> {
    try {
      const response = await fetch('https://8.8.8.8', { 
        method: 'HEAD',
        timeout: 5000 
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Compare semantic versions
   */
  private static compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }
    
    return 0;
  }

  /**
   * Format bytes for display
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Update status and broadcast via WebSocket
   */
  private static updateStatus(phase: UpdateStatus['phase'], progress: number, message: string, error?: string): void {
    this.currentStatus = {
      phase,
      progress,
      message,
      error,
      startTime: this.currentStatus.startTime || (phase !== 'idle' ? Date.now() : undefined)
    };

    // Broadcast status update via WebSocket
    realtimeService.broadcastUpdateStatus(this.currentStatus);

    // Log status change
    LoggerService.info('updater', `Update status: ${phase} - ${message}`, undefined, {
      phase,
      progress,
      error
    });
  }
}

export const updaterService = UpdaterService;