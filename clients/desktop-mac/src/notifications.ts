import { EventEmitter } from 'events';
import Store from 'electron-store';
import * as notifier from 'node-notifier';
import * as path from 'path';
import { app } from 'electron';

interface DeviceInfo {
  name: string;
  ip: string;
}

interface UploadStats {
  size?: number;
  error?: Error;
}

interface SyncStats {
  filesUploaded: number;
  bytesTransferred: number;
  errors: number;
}

/**
 * NotificationService - Native macOS notifications for PocketCloud events
 * 
 * Provides native macOS notification center integration with:
 * - Upload completion notifications
 * - Sync status notifications  
 * - Connection status notifications
 * - Storage warnings
 * - Error notifications
 */
export class NotificationService extends EventEmitter {
  private store: Store;
  private appIcon: string;

  constructor(store: Store) {
    super();
    this.store = store;
    
    // Set app icon for notifications
    this.appIcon = app.isPackaged 
      ? path.join(process.resourcesPath, 'assets', 'app-icon.png')
      : path.join(__dirname, '../assets/app-icon.png');
  }

  public showConnectionNotification(
    type: 'connected' | 'disconnected' | 'reconnected',
    deviceInfo?: DeviceInfo
  ): void {
    const enabled = this.store.get('notifications.connectionLost', true) as boolean;
    if (!enabled) return;

    let title: string;
    let message: string;
    let sound: string | boolean = false;

    switch (type) {
      case 'connected':
        title = 'PocketCloud Connected';
        message = `Connected to ${deviceInfo?.name || 'PocketCloud'} (${deviceInfo?.ip})`;
        sound = 'Ping';
        break;
      case 'reconnected':
        title = 'PocketCloud Reconnected';
        message = `Reconnected to ${deviceInfo?.name || 'PocketCloud'} (${deviceInfo?.ip})`;
        sound = 'Ping';
        break;
      case 'disconnected':
        title = 'PocketCloud Disconnected';
        message = 'Lost connection to PocketCloud Drive';
        sound = 'Basso';
        break;
    }

    this.showNotification({
      title,
      message,
      sound,
      icon: this.appIcon
    });
  }

  public showUploadNotification(
    type: 'complete' | 'error',
    fileName: string,
    stats: UploadStats
  ): void {
    const enabled = this.store.get('notifications.uploadComplete', true) as boolean;
    if (!enabled) return;

    let title: string;
    let message: string;
    let sound: string | boolean = false;

    switch (type) {
      case 'complete':
        title = 'Upload Complete';
        const sizeStr = stats.size ? ` (${this.formatBytes(stats.size)})` : '';
        message = `✓ ${fileName} uploaded${sizeStr}`;
        sound = 'Glass';
        break;
      case 'error':
        title = 'Upload Failed';
        message = `✗ Failed to upload ${fileName}`;
        if (stats.error) {
          message += `\n${stats.error.message}`;
        }
        sound = 'Sosumi';
        break;
    }

    this.showNotification({
      title,
      message,
      sound,
      icon: this.appIcon,
      actions: type === 'complete' ? ['Show in Finder'] : undefined
    });
  }

  public showSyncNotification(type: 'complete' | 'error', stats: SyncStats | Error): void {
    const enabled = this.store.get('notifications.syncComplete', true) as boolean;
    if (!enabled) return;

    let title: string;
    let message: string;
    let sound: string | boolean = false;

    if (type === 'complete' && !(stats instanceof Error)) {
      title = 'Sync Complete';
      
      if (stats.filesUploaded === 0) {
        message = '✓ All files are up to date';
      } else if (stats.filesUploaded === 1) {
        message = '✓ 1 file synced to PocketCloud';
      } else {
        message = `✓ ${stats.filesUploaded} files synced to PocketCloud`;
      }
      
      if (stats.bytesTransferred > 0) {
        message += ` (${this.formatBytes(stats.bytesTransferred)})`;
      }
      
      if (stats.errors > 0) {
        message += ` - ${stats.errors} error${stats.errors > 1 ? 's' : ''}`;
      }
      
      sound = 'Purr';
    } else {
      title = 'Sync Failed';
      message = stats instanceof Error ? stats.message : 'Unknown sync error';
      sound = 'Sosumi';
    }

    this.showNotification({
      title,
      message,
      sound,
      icon: this.appIcon
    });
  }

  public showStorageNotification(type: 'low' | 'full', usagePercent: number): void {
    const enabled = this.store.get('notifications.lowStorage', true) as boolean;
    if (!enabled) return;

    let title: string;
    let message: string;
    let sound: string | boolean = false;

    switch (type) {
      case 'low':
        title = 'Storage Almost Full';
        message = `⚠ PocketCloud storage is ${usagePercent}% full`;
        sound = 'Funk';
        break;
      case 'full':
        title = 'Storage Full';
        message = `🚨 PocketCloud storage is full (${usagePercent}%)`;
        sound = 'Sosumi';
        break;
    }

    this.showNotification({
      title,
      message,
      sound,
      icon: this.appIcon,
      actions: ['Open Storage Settings']
    });
  }

  public showMountNotification(type: 'mounted' | 'unmounted' | 'error', info?: any): void {
    let title: string;
    let message: string;
    let sound: string | boolean = false;

    switch (type) {
      case 'mounted':
        title = 'Drive Mounted';
        message = '📁 PocketCloud Drive is now available in Finder';
        sound = 'Pop';
        break;
      case 'unmounted':
        title = 'Drive Unmounted';
        message = '📁 PocketCloud Drive has been ejected';
        sound = false;
        break;
      case 'error':
        title = 'Mount Error';
        message = `Failed to mount PocketCloud Drive`;
        if (info && info.message) {
          message += `\n${info.message}`;
        }
        sound = 'Sosumi';
        break;
    }

    this.showNotification({
      title,
      message,
      sound,
      icon: this.appIcon
    });
  }

  public showUpdateNotification(type: 'available' | 'downloaded' | 'error'): void {
    let title: string;
    let message: string;
    let sound: string | boolean = false;

    switch (type) {
      case 'available':
        title = 'Update Available';
        message = 'A new version of PocketCloud is available';
        sound = 'Blow';
        break;
      case 'downloaded':
        title = 'Update Ready';
        message = 'Update downloaded. Restart to apply changes.';
        sound = 'Glass';
        break;
      case 'error':
        title = 'Update Failed';
        message = 'Failed to download update';
        sound = 'Sosumi';
        break;
    }

    this.showNotification({
      title,
      message,
      sound,
      icon: this.appIcon,
      actions: type === 'downloaded' ? ['Restart Now', 'Later'] : undefined
    });
  }

  private showNotification(options: {
    title: string;
    message: string;
    sound?: string | boolean;
    icon?: string;
    actions?: string[];
  }): void {
    // Use node-notifier for native macOS notifications
    notifier.notify({
      title: options.title,
      message: options.message,
      icon: options.icon,
      wait: false // Don't wait for user action
    } as any, (err: any, response: any, metadata: any) => {
      if (err) {
        console.error('Notification error:', err);
        return;
      }

      // Handle notification actions
      if (response === 'activate') {
        // User clicked the notification
        this.handleNotificationClick(options.title);
      } else if (response === 'timeout') {
        // Notification timed out
      } else if (options.actions && options.actions.includes(response)) {
        // User clicked an action button
        this.handleNotificationAction(response, options.title);
      }
    });
  }

  private handleNotificationClick(title: string): void {
    // Handle notification clicks
    switch (title) {
      case 'Upload Complete':
        // Could open the uploaded file location
        break;
      case 'PocketCloud Connected':
        // Could open the main app window
        break;
      case 'Storage Almost Full':
      case 'Storage Full':
        // Could open storage settings
        break;
    }
  }

  private handleNotificationAction(action: string, title: string): void {
    const { shell } = require('electron');
    
    switch (action) {
      case 'Show in Finder':
        // Open sync folder in Finder
        const syncFolder = this.store.get('sync.folder') as string;
        shell.openPath(syncFolder);
        break;
        
      case 'Open Storage Settings':
        // Open PocketCloud web interface to storage page
        // This would need the current device info
        break;
        
      case 'Restart Now':
        // Restart the app to apply updates
        app.relaunch();
        app.exit();
        break;
        
      case 'Later':
        // Do nothing, user will restart manually
        break;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Test notification (for settings)
  public testNotification(): void {
    this.showNotification({
      title: 'PocketCloud Test',
      message: 'Notifications are working correctly!',
      sound: 'Glass',
      icon: this.appIcon
    });
  }

  // Enable/disable notification types
  public setNotificationEnabled(type: string, enabled: boolean): void {
    this.store.set(`notifications.${type}`, enabled);
  }

  public getNotificationSettings(): any {
    return {
      uploadComplete: this.store.get('notifications.uploadComplete', true),
      syncComplete: this.store.get('notifications.syncComplete', true),
      lowStorage: this.store.get('notifications.lowStorage', true),
      connectionLost: this.store.get('notifications.connectionLost', true)
    };
  }
}