import { Tray, Menu, app, nativeImage, shell } from 'electron';
import { join } from 'path';
import Store from 'electron-store';
import log from 'electron-log';

/**
 * Windows System Tray Manager
 * 
 * Manages the PocketCloud system tray icon with:
 * - Right-click context menu with all app functions
 * - Left-click quick upload window
 * - Dynamic icon states (connected/disconnected/syncing)
 * - Jump list integration for taskbar right-click
 * - Balloon notifications support
 */

export interface TrayCallbacks {
  onShowSettings: () => void;
  onOpenBrowser: () => void;
  onOpenFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  onToggleSync: () => void;
  onCheckUpdates: () => void;
  onQuit: () => void;
}

export interface DeviceInfo {
  host: string;
  ip: string;
  port: number;
  storageUsed: number;
  storageTotal: number;
}

export class TrayManager {
  private tray: Tray | null = null;
  private store: Store;
  private callbacks: TrayCallbacks;
  private isConnected = false;
  private isSyncing = false;
  private mountedDrive: string | null = null;
  private deviceInfo: DeviceInfo | null = null;

  constructor(store: Store, callbacks: TrayCallbacks) {
    this.store = store;
    this.callbacks = callbacks;
    this.createTray();
    this.setupJumpList();
  }
  private createTray(): void {
    try {
      // Create tray icon
      const iconPath = this.getIconPath();
      const icon = nativeImage.createFromPath(iconPath);
      
      this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
      
      // Set tooltip
      this.updateTooltip();
      
      // Handle left click - show quick upload
      this.tray.on('click', () => {
        this.callbacks.onUploadFiles();
      });
      
      // Handle right click - show context menu
      this.tray.on('right-click', () => {
        this.showContextMenu();
      });
      
      // Handle double click - open settings
      this.tray.on('double-click', () => {
        this.callbacks.onShowSettings();
      });
      
      log.info('System tray created successfully');
      
    } catch (error) {
      log.error('Failed to create system tray:', error);
    }
  }

  private getIconPath(): string {
    const iconName = this.isConnected 
      ? (this.isSyncing ? 'tray-icon-sync.ico' : 'tray-icon-connected.ico')
      : 'tray-icon-disconnected.ico';
    
    return join(__dirname, '../assets', iconName);
  }

  private updateTooltip(): void {
    if (!this.tray) return;

    let tooltip = 'PocketCloud Drive';
    
    if (this.isConnected && this.deviceInfo) {
      const usedGB = Math.round(this.deviceInfo.storageUsed / 1024 / 1024 / 1024);
      const totalGB = Math.round(this.deviceInfo.storageTotal / 1024 / 1024 / 1024);
      const freeGB = totalGB - usedGB;
      
      tooltip += `\n${this.deviceInfo.host} · ${freeGB}GB free`;
      
      if (this.mountedDrive) {
        tooltip += `\nMounted as ${this.mountedDrive}:`;
      }
      
      if (this.isSyncing) {
        tooltip += '\nSyncing...';
      }
    } else {
      tooltip += '\nDisconnected';
    }
    
    this.tray.setToolTip(tooltip);
  }

  private showContextMenu(): void {
    if (!this.tray) return;

    const syncEnabled = this.store.get('syncEnabled') as boolean;
    const lastSyncTime = this.store.get('lastSyncTime') as number;
    
    let lastSyncText = 'Never synced';
    if (lastSyncTime) {
      const timeDiff = Date.now() - lastSyncTime;
      const minutes = Math.floor(timeDiff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) {
        lastSyncText = `Last synced: ${days}d ago`;
      } else if (hours > 0) {
        lastSyncText = `Last synced: ${hours}h ago`;
      } else if (minutes > 0) {
        lastSyncText = `Last synced: ${minutes}m ago`;
      } else {
        lastSyncText = 'Last synced: Just now';
      }
    }

    // Build storage indicator
    let storageText = '';
    if (this.deviceInfo) {
      const usedPercent = Math.round((this.deviceInfo.storageUsed / this.deviceInfo.storageTotal) * 100);
      const blocks = Math.round(usedPercent / 10);
      const filled = '█'.repeat(blocks);
      const empty = '░'.repeat(10 - blocks);
      storageText = `Storage: ${filled}${empty} ${usedPercent}% used`;
    }

    const template = [
      {
        label: this.isConnected 
          ? `● PocketCloud Drive (${this.deviceInfo?.host || 'Connected'})` 
          : '○ PocketCloud Drive (Disconnected)',
        enabled: false
      },
      {
        label: this.deviceInfo 
          ? `${this.deviceInfo.host} · ${Math.round((this.deviceInfo.storageTotal - this.deviceInfo.storageUsed) / 1024 / 1024 / 1024)}GB free`
          : 'No device info',
        enabled: false
      },
      { type: 'separator' },
      {
        label: '📂 Open in Browser',
        click: () => this.callbacks.onOpenBrowser(),
        enabled: this.isConnected
      },
      {
        label: this.mountedDrive 
          ? `🗂 Open Drive (${this.mountedDrive}:)`
          : '🗂 Open in File Explorer',
        click: () => this.callbacks.onOpenFolder(),
        enabled: this.isConnected
      },
      { type: 'separator' },
      {
        label: '⬆ Upload Files...',
        click: () => this.callbacks.onUploadFiles(),
        enabled: this.isConnected
      },
      {
        label: '⬆ Upload Folder...',
        click: () => this.callbacks.onUploadFolder(),
        enabled: this.isConnected
      },
      { type: 'separator' },
      {
        label: syncEnabled 
          ? (this.isSyncing ? '⟳ Syncing...' : '⟳ Sync: Enabled')
          : '⟳ Sync: Disabled',
        click: () => this.callbacks.onToggleSync(),
        type: 'checkbox',
        checked: syncEnabled
      },
      {
        label: lastSyncText,
        enabled: false
      },
      { type: 'separator' }
    ];

    // Add storage indicator if connected
    if (storageText) {
      template.push({
        label: storageText,
        enabled: false
      });
      template.push({ type: 'separator' });
    }

    // Add final menu items
    template.push(
      {
        label: 'Preferences...',
        enabled: true,
        click: () => this.callbacks.onShowSettings()
      },
      {
        label: 'Check for Updates',
        enabled: true,
        click: () => this.callbacks.onCheckUpdates()
      },
      { type: 'separator' },
      {
        label: 'Quit PocketCloud',
        enabled: true,
        click: () => this.callbacks.onQuit()
      }
    );

    const contextMenu = Menu.buildFromTemplate(template as any);
    this.tray.popUpContextMenu(contextMenu);
  }

  private setupJumpList(): void {
    try {
      // Windows Jump List (right-click taskbar)
      app.setJumpList([
        {
          type: 'custom',
          name: 'Quick Actions',
          items: [
            {
              type: 'task',
              title: 'Open PocketCloud',
              description: 'Open PocketCloud in browser',
              program: process.execPath,
              args: '--open-browser',
              iconPath: process.execPath,
              iconIndex: 0
            },
            {
              type: 'task',
              title: 'Upload Files',
              description: 'Upload files to PocketCloud',
              program: process.execPath,
              args: '--upload-files',
              iconPath: process.execPath,
              iconIndex: 0
            }
          ]
        },
        {
          type: 'recent',
          name: 'Recent Files'
        }
      ]);
      
      log.info('Jump list configured');
      
    } catch (error) {
      log.error('Failed to setup jump list:', error);
    }
  }

  public updateConnectionStatus(connected: boolean, deviceInfo?: DeviceInfo): void {
    this.isConnected = connected;
    this.deviceInfo = deviceInfo || null;
    
    if (this.tray) {
      // Update icon
      const iconPath = this.getIconPath();
      const icon = nativeImage.createFromPath(iconPath);
      this.tray.setImage(icon.resize({ width: 16, height: 16 }));
      
      // Update tooltip
      this.updateTooltip();
    }
    
    log.info(`Connection status updated: ${connected ? 'connected' : 'disconnected'}`);
  }

  public updateSyncStatus(syncing: boolean): void {
    this.isSyncing = syncing;
    
    if (this.tray) {
      // Update icon
      const iconPath = this.getIconPath();
      const icon = nativeImage.createFromPath(iconPath);
      this.tray.setImage(icon.resize({ width: 16, height: 16 }));
      
      // Update tooltip
      this.updateTooltip();
    }
    
    log.info(`Sync status updated: ${syncing ? 'syncing' : 'idle'}`);
  }

  public updateMountStatus(mounted: boolean, driveLetter?: string): void {
    this.mountedDrive = mounted ? driveLetter || null : null;
    
    if (this.tray) {
      this.updateTooltip();
    }
    
    log.info(`Mount status updated: ${mounted ? `mounted as ${driveLetter}:` : 'unmounted'}`);
  }

  public showBalloonNotification(title: string, content: string, icon?: 'info' | 'warning' | 'error'): void {
    if (!this.tray) return;

    this.tray.displayBalloon({
      title,
      content,
      icon: icon || 'info'
    });
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
      log.info('System tray destroyed');
    }
  }
}