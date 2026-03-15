import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import * as path from 'path';
import { TrayManager } from './tray';
import { DiscoveryService } from './discovery';
import { SyncService } from './sync';
import { MountService } from './mount';
import { NotificationService } from './notifications';

/**
 * PocketCloud Drive - macOS Menu Bar Application
 * 
 * Main process that coordinates all services:
 * - Tray icon and menu management
 * - Device discovery and connection
 * - WebDAV mounting in Finder
 * - Folder synchronization
 * - Native macOS notifications
 */

class PocketCloudApp {
  private store: Store;
  private trayManager: TrayManager;
  private discoveryService: DiscoveryService;
  private syncService: SyncService;
  private mountService: MountService;
  private notificationService: NotificationService;
  private settingsWindow: BrowserWindow | null = null;

  constructor() {
    // Initialize electron store for persistent settings
    this.store = new Store({
      defaults: {
        connection: {
          lastKnownIP: '192.168.4.1',
          username: '',
          password: '',
          autoConnect: true
        },
        sync: {
          enabled: true,
          folder: path.join(app.getPath('home'), 'PocketCloud'),
          bandwidthLimit: 10, // MB/s
          ignorePatterns: ['.DS_Store', '.Spotlight-V100', '._*', 'Thumbs.db']
        },
        notifications: {
          uploadComplete: true,
          syncComplete: true,
          lowStorage: true,
          connectionLost: true
        },
        startup: {
          launchAtLogin: false
        }
      }
    }) as any;

    // Initialize services
    this.discoveryService = new DiscoveryService(this.store);
    this.syncService = new SyncService(this.store);
    this.mountService = new MountService(this.store);
    this.notificationService = new NotificationService(this.store);
    this.trayManager = new TrayManager(this.store, {
      discoveryService: this.discoveryService,
      syncService: this.syncService,
      mountService: this.mountService,
      notificationService: this.notificationService
    });

    this.setupEventHandlers();
    this.setupIpcHandlers();
  }

  private setupEventHandlers(): void {
    // Discovery service events
    this.discoveryService.on('connected', (deviceInfo) => {
      console.log('PocketCloud connected:', deviceInfo);
      this.trayManager.updateConnectionStatus('connected', deviceInfo);
      this.notificationService.showConnectionNotification('connected', deviceInfo);
      
      // Auto-mount if enabled
      if (this.store.get('mount.autoMount', true)) {
        this.mountService.mount(deviceInfo.endpoints.webdav || `${deviceInfo.endpoints.web}/webdav`);
      }
      
      // Start sync if enabled
      if (this.store.get('sync.enabled', true)) {
        this.syncService.start(deviceInfo);
      }
    });

    this.discoveryService.on('disconnected', () => {
      console.log('PocketCloud disconnected');
      this.trayManager.updateConnectionStatus('disconnected');
      this.notificationService.showConnectionNotification('disconnected');
      
      // Stop sync
      this.syncService.stop();
      
      // Unmount (optional - user might want to keep it mounted)
      if (this.store.get('mount.autoUnmount', false)) {
        this.mountService.unmount();
      }
    });

    this.discoveryService.on('reconnected', (deviceInfo) => {
      console.log('PocketCloud reconnected:', deviceInfo);
      this.trayManager.updateConnectionStatus('connected', deviceInfo);
      this.notificationService.showConnectionNotification('reconnected', deviceInfo);
    });

    // Sync service events
    this.syncService.on('uploadStarted', (file) => {
      this.trayManager.updateUploadStatus('uploading', file);
    });

    this.syncService.on('uploadComplete', (file, stats) => {
      this.trayManager.updateUploadStatus('idle');
      this.notificationService.showUploadNotification('complete', file, stats);
    });

    this.syncService.on('uploadError', (file, error) => {
      this.trayManager.updateUploadStatus('error');
      this.notificationService.showUploadNotification('error', file, { error });
    });

    this.syncService.on('syncComplete', (stats) => {
      this.notificationService.showSyncNotification('complete', stats);
      this.trayManager.updateSyncStatus(stats);
    });

    // Mount service events
    this.mountService.on('mounted', (mountPoint) => {
      console.log('WebDAV mounted at:', mountPoint);
      this.trayManager.updateMountStatus('mounted', mountPoint);
    });

    this.mountService.on('unmounted', () => {
      console.log('WebDAV unmounted');
      this.trayManager.updateMountStatus('unmounted');
    });

    this.mountService.on('mountError', (error) => {
      console.error('Mount error:', error);
      this.trayManager.updateMountStatus('error');
      this.notificationService.showMountNotification('error', error);
    });
  }

  private setupIpcHandlers(): void {
    // Settings window communication
    ipcMain.handle('get-settings', () => {
      return this.store.store;
    });

    ipcMain.handle('set-setting', (event, key: string, value: any) => {
      this.store.set(key, value);
      
      // Apply settings changes
      if (key === 'startup.launchAtLogin') {
        app.setLoginItemSettings({
          openAtLogin: value,
          openAsHidden: true
        });
      }
      
      if (key.startsWith('sync.')) {
        this.syncService.updateSettings();
      }
      
      return true;
    });

    ipcMain.handle('get-device-info', () => {
      return this.discoveryService.getCurrentDevice();
    });

    ipcMain.handle('test-connection', async (event, ip: string) => {
      return await this.discoveryService.testConnection(ip);
    });

    ipcMain.handle('choose-sync-folder', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose Sync Folder',
        defaultPath: this.store.get('sync.folder') as string
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      
      return null;
    });

    ipcMain.handle('open-sync-folder', () => {
      const syncFolder = this.store.get('sync.folder') as string;
      shell.openPath(syncFolder);
    });

    ipcMain.handle('force-sync', () => {
      this.syncService.forceSync();
    });

    ipcMain.handle('check-for-updates', () => {
      autoUpdater.checkForUpdatesAndNotify();
    });
  }

  public async initialize(): Promise<void> {
    // Set up auto-updater
    autoUpdater.checkForUpdatesAndNotify();

    // Apply startup settings
    const launchAtLogin = this.store.get('startup.launchAtLogin', false) as boolean;
    app.setLoginItemSettings({
      openAtLogin: launchAtLogin,
      openAsHidden: true
    });

    // Initialize services
    await this.discoveryService.start();
    await this.syncService.initialize();
    await this.mountService.initialize();
    
    console.log('PocketCloud macOS app initialized');
  }

  public createSettingsWindow(): void {
    if (this.settingsWindow) {
      this.settingsWindow.focus();
      return;
    }

    this.settingsWindow = new BrowserWindow({
      width: 400,
      height: 500,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'PocketCloud Preferences',
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // Load settings UI
    if (app.isPackaged) {
      this.settingsWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    } else {
      this.settingsWindow.loadURL('http://localhost:3000');
    }

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
    });

    // Hide from dock
    if (process.platform === 'darwin') {
      app.dock.hide();
    }
  }

  public quit(): void {
    // Clean up services
    this.syncService.stop();
    this.mountService.cleanup();
    this.discoveryService.stop();
    
    app.quit();
  }
}

// App lifecycle management
let pocketCloudApp: PocketCloudApp;

app.whenReady().then(async () => {
  // Hide dock icon (menu bar app only)
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  pocketCloudApp = new PocketCloudApp();
  await pocketCloudApp.initialize();
});

app.on('window-all-closed', () => {
  // Keep app running in menu bar even when all windows are closed
  // Don't quit on macOS
});

app.on('activate', () => {
  // Show settings window when app is activated (e.g., from dock)
  pocketCloudApp?.createSettingsWindow();
});

app.on('before-quit', () => {
  pocketCloudApp?.quit();
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});

// Export for IPC access
export { pocketCloudApp };