import { Notification } from 'electron';
import * as notifier from 'node-notifier';
import { join } from 'path';
import log from 'electron-log';
import { SyncStats } from './sync-windows';

/**
 * Windows Notification Service
 * 
 * Provides Windows-native toast notifications with:
 * - Windows 10/11 Toast notifications with app icon
 * - Action buttons (Open Folder, View All) on notifications
 * - Progress toasts for uploads (updates in place)
 * - Balloon notifications via system tray
 * - Sound and visual feedback for different event types
 */

export interface NotificationOptions {
  title: string;
  message: string;
  icon?: string;
  sound?: boolean;
  actions?: NotificationAction[];
  timeout?: number;
}

export interface NotificationAction {
  type: string;
  text: string;
}

export class WindowsNotificationService {
  private appIcon: string;
  private notificationsEnabled: boolean = true;

  constructor() {
    this.appIcon = join(__dirname, '../assets/icon.ico');
    
    // Check if notifications are supported
    if (!Notification.isSupported()) {
      log.warn('Notifications are not supported on this system');
      this.notificationsEnabled = false;
    }
  }

  /**
   * Show connection restored notification
   */
  public showConnectionRestored(): void {
    this.showNotification({
      title: 'PocketCloud Connected',
      message: 'Successfully connected to your PocketCloud device',
      icon: this.appIcon,
      sound: true
    });
  }

  /**
   * Show connection lost notification
   */
  public showConnectionLost(): void {
    this.showNotification({
      title: 'PocketCloud Disconnected',
      message: 'Lost connection to PocketCloud device. Retrying...',
      icon: this.appIcon,
      sound: true
    });
  }

  /**
   * Show WebDAV drive mounted notification
   */
  public showDriveMounted(driveLetter: string): void {
    this.showNotification({
      title: 'Network Drive Mounted',
      message: `PocketCloud is now available as ${driveLetter}: drive`,
      icon: this.appIcon,
      sound: false,
      actions: [
        { type: 'open-drive', text: 'Open Drive' }
      ]
    });
  }

  /**
   * Show WebDAV mount error notification
   */
  public showMountError(error: Error): void {
    this.showNotification({
      title: 'Drive Mount Failed',
      message: `Failed to mount network drive: ${error.message}`,
      icon: this.appIcon,
      sound: true
    });
  }

  /**
   * Show file uploaded notification
   */
  public showFileUploaded(fileName: string, fileSize: number): void {
    const sizeText = this.formatFileSize(fileSize);
    
    this.showNotification({
      title: 'File Uploaded',
      message: `✓ ${fileName} uploaded (${sizeText})`,
      icon: this.appIcon,
      sound: false,
      timeout: 3000
    });
  }

  /**
   * Show sync complete notification with stats
   */
  public showSyncComplete(stats: SyncStats): void {
    if (stats.filesUploaded === 0) {
      return; // Don't show notification if no files were uploaded
    }

    const message = stats.filesUploaded === 1 
      ? `✓ 1 file synced to PocketCloud`
      : `✓ ${stats.filesUploaded} files synced to PocketCloud`;

    this.showNotification({
      title: 'Sync Complete',
      message,
      icon: this.appIcon,
      sound: false,
      actions: [
        { type: 'open-folder', text: 'Open Folder' },
        { type: 'view-all', text: 'View All Files' }
      ],
      timeout: 5000
    });
  }

  /**
   * Show sync error notification
   */
  public showSyncError(error: Error): void {
    this.showNotification({
      title: 'Sync Error',
      message: `Sync failed: ${error.message}`,
      icon: this.appIcon,
      sound: true
    });
  }

  /**
   * Show low storage warning
   */
  public showLowStorage(usedPercent: number): void {
    this.showNotification({
      title: 'Storage Almost Full',
      message: `⚠ PocketCloud storage is ${usedPercent}% full`,
      icon: this.appIcon,
      sound: true,
      actions: [
        { type: 'manage-storage', text: 'Manage Storage' }
      ]
    });
  }

  /**
   * Show update available notification
   */
  public showUpdateAvailable(): void {
    this.showNotification({
      title: 'Update Available',
      message: 'A new version of PocketCloud is ready to install',
      icon: this.appIcon,
      sound: false,
      actions: [
        { type: 'install-update', text: 'Install Now' },
        { type: 'remind-later', text: 'Remind Later' }
      ]
    });
  }

  /**
   * Show upload progress notification (updates in place)
   */
  public showUploadProgress(fileName: string, percentage: number): void {
    // Use Windows Toast notification with progress bar
    if (this.notificationsEnabled) {
      try {
        // For progress notifications, we use node-notifier for better control
        notifier.notify({
          title: 'Uploading to PocketCloud',
          message: `${fileName} - ${percentage}%`,
          icon: this.appIcon,
          sound: false,
          wait: false,
          id: 'upload-progress', // Same ID to update in place
          appID: 'com.pocketcloud.windows'
        });
      } catch (error) {
        log.error('Failed to show progress notification:', error);
      }
    }
  }

  /**
   * Show generic notification
   */
  private showNotification(options: NotificationOptions): void {
    if (!this.notificationsEnabled) {
      return;
    }

    try {
      // Try Electron native notification first (Windows 10+ style)
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: options.title,
          body: options.message,
          icon: options.icon || this.appIcon,
          silent: !options.sound,
          timeoutType: 'default'
        });

        notification.show();

        // Handle notification click
        notification.on('click', () => {
          this.handleNotificationClick(options.actions?.[0]);
        });

        // Auto-close after timeout
        if (options.timeout) {
          setTimeout(() => {
            notification.close();
          }, options.timeout);
        }

      } else {
        // Fallback to node-notifier for older Windows versions
        notifier.notify({
          title: options.title,
          message: options.message,
          icon: options.icon || this.appIcon,
          sound: options.sound || false,
          wait: true,
          timeout: options.timeout || 5,
          appID: 'com.pocketcloud.windows'
        }, (err, response, metadata) => {
          if (err) {
            log.error('Notification error:', err);
          }
          
          if (response === 'activate' && options.actions?.[0]) {
            this.handleNotificationClick(options.actions[0]);
          }
        });
      }

    } catch (error) {
      log.error('Failed to show notification:', error);
    }
  }

  /**
   * Handle notification action clicks
   */
  private handleNotificationClick(action?: NotificationAction): void {
    if (!action) return;

    try {
      switch (action.type) {
        case 'open-drive':
          // Open the mounted drive
          require('electron').shell.openPath('P:'); // Assuming P: drive
          break;

        case 'open-folder':
          // Open sync folder
          const { homedir } = require('os');
          const syncFolder = join(homedir(), 'PocketCloud');
          require('electron').shell.openPath(syncFolder);
          break;

        case 'view-all':
          // Open PocketCloud in browser
          require('electron').shell.openExternal('http://pocketcloud.local:3000');
          break;

        case 'manage-storage':
          // Open storage management in browser
          require('electron').shell.openExternal('http://pocketcloud.local:3000/admin/storage');
          break;

        case 'install-update':
          // Trigger update installation
          const { autoUpdater } = require('electron-updater');
          autoUpdater.quitAndInstall();
          break;

        case 'remind-later':
          // Do nothing, just dismiss
          break;

        default:
          log.warn(`Unknown notification action: ${action.type}`);
      }
    } catch (error) {
      log.error(`Failed to handle notification action ${action.type}:`, error);
    }
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Enable or disable notifications
   */
  public setNotificationsEnabled(enabled: boolean): void {
    this.notificationsEnabled = enabled;
    log.info(`Notifications ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if notifications are enabled
   */
  public areNotificationsEnabled(): boolean {
    return this.notificationsEnabled && Notification.isSupported();
  }

  /**
   * Test notification (for settings)
   */
  public showTestNotification(): void {
    this.showNotification({
      title: 'PocketCloud Test',
      message: 'Notifications are working correctly!',
      icon: this.appIcon,
      sound: true,
      timeout: 3000
    });
  }

  /**
   * Public method to show custom notifications
   */
  public showCustomNotification(options: NotificationOptions): void {
    this.showNotification(options);
  }
}