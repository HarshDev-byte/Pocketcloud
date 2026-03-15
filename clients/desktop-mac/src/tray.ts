import { Tray, Menu, MenuItem, shell, dialog, app } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import { DiscoveryService } from './discovery';
import { SyncService } from './sync';
import { MountService } from './mount';
import { NotificationService } from './notifications';

interface Services {
  discoveryService: DiscoveryService;
  syncService: SyncService;
  mountService: MountService;
  notificationService: NotificationService;
}

interface DeviceInfo {
  name: string;
  ip: string;
  storage: {
    total: number;
    used: number;
    free: number;
  };
  endpoints: {
    web: string;
    api: string;
    webdav?: string;
  };
}

/**
 * TrayManager - Manages the macOS menu bar tray icon and menu
 * 
 * Provides a native macOS menu bar experience with:
 * - Dynamic status indicators (connected/disconnected/uploading)
 * - Device information display
 * - Quick actions (upload, sync, mount)
 * - Settings access
 */
export class TrayManager {
  private tray: Tray;
  private store: Store;
  private services: Services;
  private connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  private uploadStatus: 'idle' | 'uploading' | 'error' = 'idle';
  private mountStatus: 'mounted' | 'unmounted' | 'error' = 'unmounted';
  private currentDevice: DeviceInfo | null = null;
  private lastSyncTime: Date | null = null;
  private syncStats: any = null;

  constructor(store: Store, services: Services) {
    this.store = store;
    this.services = services;
    
    // Create tray with initial icon
    const iconPath = this.getIconPath('disconnected');
    this.tray = new Tray(iconPath);
    
    this.tray.setToolTip('PocketCloud Drive');
    this.updateMenu();
    
    // Handle tray click (show menu)
    this.tray.on('click', () => {
      this.tray.popUpContextMenu();
    });
  }

  private getIconPath(status: 'connected' | 'disconnected' | 'uploading'): string {
    // In development, use relative path from dist/src to assets
    // In production, use app resources path
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const assetsPath = isDev
      ? path.join(__dirname, '../../assets')
      : path.join(process.resourcesPath, 'assets');
    
    switch (status) {
      case 'connected':
        return path.join(assetsPath, 'tray-icon-active.png');
      case 'uploading':
        return path.join(assetsPath, 'tray-icon-upload.png');
      default:
        return path.join(assetsPath, 'tray-icon.png');
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private formatStorageBar(used: number, total: number): string {
    const percentage = (used / total) * 100;
    const barLength = 10;
    const filledBars = Math.round((percentage / 100) * barLength);
    const emptyBars = barLength - filledBars;
    
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars) + ` ${Math.round(percentage)}% used`;
  }

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  private updateMenu(): void {
    const menu = new Menu();

    // Header with device status
    if (this.currentDevice) {
      const statusDot = this.connectionStatus === 'connected' ? '🟢' : '🔴';
      menu.append(new MenuItem({
        label: `${statusDot} ${this.currentDevice.name}`,
        enabled: false
      }));
      
      menu.append(new MenuItem({
        label: `${this.currentDevice.ip} · ${this.formatBytes(this.currentDevice.storage.free)} free`,
        enabled: false
      }));
    } else {
      const statusDot = this.connectionStatus === 'connecting' ? '🟡' : '🔴';
      menu.append(new MenuItem({
        label: `${statusDot} PocketCloud Drive`,
        enabled: false
      }));
      
      menu.append(new MenuItem({
        label: this.connectionStatus === 'connecting' ? 'Searching for device...' : 'Not connected',
        enabled: false
      }));
    }

    menu.append(new MenuItem({ type: 'separator' }));

    // Quick actions
    menu.append(new MenuItem({
      label: '📂 Open in Browser',
      enabled: this.connectionStatus === 'connected',
      click: () => {
        if (this.currentDevice) {
          shell.openExternal(this.currentDevice.endpoints.web);
        }
      }
    }));

    menu.append(new MenuItem({
      label: '🗂 Open in Finder',
      enabled: this.mountStatus === 'mounted',
      click: () => {
        this.services.mountService.openInFinder();
      }
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    // Upload actions
    menu.append(new MenuItem({
      label: '⬆ Upload Files...',
      enabled: this.connectionStatus === 'connected',
      click: async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openFile', 'multiSelections'],
          title: 'Select Files to Upload'
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          this.services.syncService.uploadFiles(result.filePaths);
        }
      }
    }));

    menu.append(new MenuItem({
      label: '⬆ Upload Folder...',
      enabled: this.connectionStatus === 'connected',
      click: async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select Folder to Upload'
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
          this.services.syncService.uploadFolder(result.filePaths[0]);
        }
      }
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    // Sync status and controls
    const syncEnabled = this.store.get('sync.enabled', true) as boolean;
    const syncFolder = this.store.get('sync.folder') as string;
    
    menu.append(new MenuItem({
      label: `⟳ Sync: ${path.basename(syncFolder)}`,
      type: 'checkbox',
      checked: syncEnabled,
      click: () => {
        const newState = !syncEnabled;
        this.store.set('sync.enabled', newState);
        
        if (newState && this.connectionStatus === 'connected') {
          this.services.syncService.start(this.currentDevice!);
        } else {
          this.services.syncService.stop();
        }
        
        this.updateMenu();
      }
    }));

    if (this.lastSyncTime) {
      menu.append(new MenuItem({
        label: `Last synced: ${this.getRelativeTime(this.lastSyncTime)}`,
        enabled: false
      }));
    }

    menu.append(new MenuItem({ type: 'separator' }));

    // Storage indicator
    if (this.currentDevice) {
      const storageBar = this.formatStorageBar(
        this.currentDevice.storage.used,
        this.currentDevice.storage.total
      );
      
      menu.append(new MenuItem({
        label: `📊 Storage: ${storageBar}`,
        enabled: false
      }));

      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Settings and app controls
    menu.append(new MenuItem({
      label: 'Preferences...',
      accelerator: 'Cmd+,',
      click: () => {
        // Import dynamically to avoid circular dependency
        import('./main').then(({ pocketCloudApp }) => {
          pocketCloudApp?.createSettingsWindow();
        });
      }
    }));

    menu.append(new MenuItem({
      label: 'Check for Updates',
      click: () => {
        // Trigger update check
        import('electron-updater').then(({ autoUpdater }) => {
          autoUpdater.checkForUpdatesAndNotify();
        });
      }
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    menu.append(new MenuItem({
      label: 'Quit PocketCloud',
      accelerator: 'Cmd+Q',
      click: () => {
        app.quit();
      }
    }));

    this.tray.setContextMenu(menu);
  }

  public updateConnectionStatus(status: 'connected' | 'disconnected' | 'connecting', deviceInfo?: DeviceInfo): void {
    this.connectionStatus = status;
    this.currentDevice = deviceInfo || null;
    
    // Update tray icon
    const iconStatus = this.uploadStatus === 'uploading' ? 'uploading' : 
                      status === 'connected' ? 'connected' : 'disconnected';
    
    const iconPath = this.getIconPath(iconStatus);
    this.tray.setImage(iconPath);
    
    // Update tooltip
    if (deviceInfo) {
      this.tray.setToolTip(`PocketCloud Drive - ${deviceInfo.name} (${deviceInfo.ip})`);
    } else {
      this.tray.setToolTip('PocketCloud Drive - Not connected');
    }
    
    this.updateMenu();
  }

  public updateUploadStatus(status: 'idle' | 'uploading' | 'error', file?: string): void {
    this.uploadStatus = status;
    
    // Update icon to show upload activity
    if (status === 'uploading') {
      const iconPath = this.getIconPath('uploading');
      this.tray.setImage(iconPath);
      
      if (file) {
        this.tray.setToolTip(`PocketCloud Drive - Uploading ${path.basename(file)}`);
      }
    } else {
      // Restore normal icon
      const iconStatus = this.connectionStatus === 'connected' ? 'connected' : 'disconnected';
      const iconPath = this.getIconPath(iconStatus);
      this.tray.setImage(iconPath);
      
      // Restore normal tooltip
      if (this.currentDevice) {
        this.tray.setToolTip(`PocketCloud Drive - ${this.currentDevice.name} (${this.currentDevice.ip})`);
      } else {
        this.tray.setToolTip('PocketCloud Drive - Not connected');
      }
    }
    
    this.updateMenu();
  }

  public updateMountStatus(status: 'mounted' | 'unmounted' | 'error', mountPoint?: string): void {
    this.mountStatus = status;
    this.updateMenu();
  }

  public updateSyncStatus(stats: any): void {
    this.lastSyncTime = new Date();
    this.syncStats = stats;
    this.updateMenu();
  }
}