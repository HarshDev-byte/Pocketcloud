import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { join } from 'path';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import Store from 'electron-store';
import { TrayManager } from './tray';
import { DiscoveryService } from './discovery';
import { WindowsMountService } from './mount-windows';
import { WindowsSyncService } from './sync-windows';
import { WindowsNotificationService } from './notifications';

/**
 * PocketCloud Drive Windows System Tray Application
 * 
 * Main process coordination for Windows-specific features:
 * - System tray integration with context menu and jump lists
 * - WebDAV network drive mapping via Windows built-in client
 * - Folder synchronization with Windows shell integration
 * - Windows Toast notifications with action buttons
 * - Auto-updater and Windows-specific system integration
 */

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Initialize electron-store
const store = new Store({
  defaults: {
    windowBounds: { width: 400, height: 500 },
    autoStart: true,
    syncEnabled: true,
    syncFolder: '',
    notifications: {
      uploadComplete: true,
      syncComplete: true,
      lowStorage: true,
      connectionLost: true
    },
    connection: {
      host: 'pocketcloud.local',
      ip: '192.168.4.1',
      port: 3000,
      username: '',
      password: ''
    },
    bandwidthLimit: 10 // MB/s
  }
});

class PocketCloudApp {
  private mainWindow: BrowserWindow | null = null;
  private trayManager: TrayManager | null = null;
  private discoveryService: DiscoveryService | null = null;
  private mountService: WindowsMountService | null = null;
  private syncService: WindowsSyncService | null = null;
  private notificationService: WindowsNotificationService | null = null;

  constructor() {
    this.setupApp();
  }

  private setupApp(): void {
    // Set app user model ID for Windows notifications
    app.setAppUserModelId('com.pocketcloud.windows');

    // Handle app events
    app.whenReady().then(() => this.onReady());
    app.on('window-all-closed', () => this.onWindowAllClosed());
    app.on('activate', () => this.onActivate());
    app.on('before-quit', () => this.onBeforeQuit());

    // Handle protocol for deep linking
    app.setAsDefaultProtocolClient('pocketcloud');

    // Security: Prevent new window creation
    app.on('web-contents-created', (_, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });
    });

    // Auto-updater events
    autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.on('update-available', () => {
      log.info('Update available');
    });

    autoUpdater.on('update-downloaded', () => {
      log.info('Update downloaded');
      // Show notification about update
      if (this.notificationService) {
        this.notificationService.showUpdateAvailable();
      }
    });
  }

  private async onReady(): Promise<void> {
    try {
      log.info('PocketCloud Windows app starting...');

      // Initialize services
      this.discoveryService = new DiscoveryService(store as any);
      this.mountService = new WindowsMountService(store as any);
      this.syncService = new WindowsSyncService(store as any);
      this.notificationService = new WindowsNotificationService();

      // Initialize tray (must be after app ready)
      this.trayManager = new TrayManager(store as any, {
        onShowSettings: () => this.showSettingsWindow(),
        onOpenBrowser: () => this.openInBrowser(),
        onOpenFolder: () => this.openSyncFolder(),
        onUploadFiles: () => this.showUploadDialog(),
        onUploadFolder: () => this.showUploadFolderDialog(),
        onToggleSync: () => this.toggleSync(),
        onCheckUpdates: () => this.checkForUpdates(),
        onQuit: () => this.quit()
      });

      // Windows-specific system checks
      await this.performWindowsSystemChecks();

      // Setup Windows power management
      this.setupPowerManagement();

      // Start discovery service
      await this.discoveryService.start();

      // Setup service event handlers
      this.setupServiceEvents();

      // Auto-start sync if enabled
      if (store.get('syncEnabled')) {
        await this.startSync();
      }

      // Check for WebDAV mount on startup
      await this.checkWebDAVMount();

      log.info('PocketCloud Windows app started successfully');

    } catch (error) {
      log.error('Failed to start PocketCloud app:', error);
      app.quit();
    }
  }

  private setupServiceEvents(): void {
    if (!this.discoveryService || !this.mountService || !this.syncService || !this.notificationService) {
      return;
    }

    // Discovery events
    this.discoveryService.on('connected', (deviceInfo) => {
      log.info('Connected to PocketCloud:', deviceInfo);
      this.trayManager?.updateConnectionStatus(true, deviceInfo);
      this.notificationService?.showConnectionRestored();
    });

    this.discoveryService.on('disconnected', () => {
      log.info('Disconnected from PocketCloud');
      this.trayManager?.updateConnectionStatus(false);
      this.notificationService?.showConnectionLost();
    });

    this.discoveryService.on('reconnected', (deviceInfo) => {
      log.info('Reconnected to PocketCloud:', deviceInfo);
      this.trayManager?.updateConnectionStatus(true, deviceInfo);
      this.notificationService?.showConnectionRestored();
    });

    // Mount events
    this.mountService.on('mounted', (driveLetter) => {
      log.info(`WebDAV mounted as ${driveLetter}:`);
      this.trayManager?.updateMountStatus(true, driveLetter);
      this.notificationService?.showDriveMounted(driveLetter);
    });

    this.mountService.on('unmounted', () => {
      log.info('WebDAV unmounted');
      this.trayManager?.updateMountStatus(false);
    });

    this.mountService.on('mount-error', (error) => {
      log.error('WebDAV mount error:', error);
      this.notificationService?.showMountError(error);
    });

    // Sync events
    this.syncService.on('sync-started', () => {
      log.info('Sync started');
      this.trayManager?.updateSyncStatus(true);
    });

    this.syncService.on('sync-stopped', () => {
      log.info('Sync stopped');
      this.trayManager?.updateSyncStatus(false);
    });

    this.syncService.on('file-uploaded', (fileName, size) => {
      log.info(`File uploaded: ${fileName} (${size} bytes)`);
      this.notificationService?.showFileUploaded(fileName, size);
    });

    this.syncService.on('sync-complete', (stats) => {
      log.info('Sync complete:', stats);
      this.notificationService?.showSyncComplete(stats);
    });

    this.syncService.on('sync-error', (error) => {
      log.error('Sync error:', error);
      this.notificationService?.showSyncError(error);
    });
  }

  private onWindowAllClosed(): void {
    // On Windows, keep app running in system tray
    // Don't quit unless explicitly requested
  }

  private onActivate(): void {
    // On Windows, show settings window when activated
    if (this.mainWindow === null) {
      this.showSettingsWindow();
    }
  }

  private onBeforeQuit(): void {
    log.info('PocketCloud app shutting down...');
    
    // Cleanup services
    this.syncService?.stop();
    this.discoveryService?.stop();
    this.trayManager?.destroy();
  }

  private showSettingsWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.focus();
      return;
    }

    const bounds = store.get('windowBounds') as { width: number; height: number };

    this.mainWindow = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      minWidth: 400,
      minHeight: 500,
      show: false,
      autoHideMenuBar: true,
      icon: join(__dirname, '../assets/icon.ico'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, 'preload.js'),
        webSecurity: true
      }
    });

    // Load the settings UI
    this.mainWindow.loadFile(join(__dirname, 'index.html'));

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Save window bounds on resize
    this.mainWindow.on('resize', () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds();
        store.set('windowBounds', { width: bounds.width, height: bounds.height });
      }
    });

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  private async openInBrowser(): Promise<void> {
    const connection = store.get('connection') as any;
    const url = `http://${connection.host}:${connection.port}`;
    await shell.openExternal(url);
  }

  private async openSyncFolder(): Promise<void> {
    const syncFolder = store.get('syncFolder') as string;
    if (syncFolder) {
      await shell.openPath(syncFolder);
    } else {
      // Open default sync folder
      const defaultFolder = join(require('os').homedir(), 'PocketCloud');
      await shell.openPath(defaultFolder);
    }
  }

  private async showUploadDialog(): Promise<void> {
    const result = await dialog.showOpenDialog({
      title: 'Upload Files to PocketCloud',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] },
        { name: 'Videos', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      await this.syncService?.uploadFiles(result.filePaths);
    }
  }

  private async showUploadFolderDialog(): Promise<void> {
    const result = await dialog.showOpenDialog({
      title: 'Upload Folder to PocketCloud',
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      await this.syncService?.uploadFolder(result.filePaths[0]);
    }
  }

  private async toggleSync(): Promise<void> {
    const syncEnabled = store.get('syncEnabled') as boolean;
    
    if (syncEnabled) {
      await this.stopSync();
    } else {
      await this.startSync();
    }
  }

  private async startSync(): Promise<void> {
    if (!this.syncService) return;

    try {
      await this.syncService.start();
      store.set('syncEnabled', true);
      this.trayManager?.updateSyncStatus(true);
    } catch (error) {
      log.error('Failed to start sync:', error);
      this.notificationService?.showSyncError(error as Error);
    }
  }

  private async stopSync(): Promise<void> {
    if (!this.syncService) return;

    try {
      await this.syncService.stop();
      store.set('syncEnabled', false);
      this.trayManager?.updateSyncStatus(false);
    } catch (error) {
      log.error('Failed to stop sync:', error);
    }
  }

  private async checkWebDAVMount(): Promise<void> {
    if (!this.mountService) return;

    try {
      const isConnected = await this.discoveryService?.getConnectionStatus();
      if (isConnected) {
        await this.mountService.checkAndMount();
      }
    } catch (error) {
      log.error('Failed to check WebDAV mount:', error);
    }
  }

  private checkForUpdates(): void {
    autoUpdater.checkForUpdatesAndNotify();
  }

  private quit(): void {
    app.quit();
  }

  /**
   * Perform Windows-specific system checks
   */
  private async performWindowsSystemChecks(): Promise<void> {
    try {
      // Check Windows Firewall
      await this.checkWindowsFirewall();
      
      // Check WebClient service
      await this.checkWebClientService();
      
      // Detect network adapters
      await this.detectNetworkAdapters();
      
    } catch (error) {
      log.error('Windows system checks failed:', error);
    }
  }

  /**
   * Check if Windows Firewall is blocking required ports
   */
  private async checkWindowsFirewall(): Promise<void> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Check if port 3000 is blocked
      const { stdout } = await execAsync('netsh advfirewall firewall show rule name=all | findstr "3000"');
      
      if (!stdout.includes('3000')) {
        log.warn('Port 3000 may be blocked by Windows Firewall');
        
        if (this.notificationService) {
          this.notificationService.showCustomNotification({
            title: 'Firewall Check',
            message: 'Port 3000 may be blocked. Check Windows Firewall settings if connection fails.',
            sound: false,
            timeout: 8000
          });
        }
      }
    } catch (error) {
      log.debug('Could not check Windows Firewall status:', error);
    }
  }

  /**
   * Check WebClient service status
   */
  private async checkWebClientService(): Promise<void> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync('sc query webclient');
      
      if (stdout.includes('STOPPED')) {
        log.warn('WebClient service is stopped - WebDAV mounting may fail');
        
        // Try to start the service
        try {
          await execAsync('net start webclient');
          log.info('WebClient service started successfully');
        } catch (startError) {
          log.warn('Could not start WebClient service:', startError);
        }
      }
    } catch (error) {
      log.debug('Could not check WebClient service:', error);
    }
  }

  /**
   * Detect available network adapters
   */
  private async detectNetworkAdapters(): Promise<void> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync('wmic path win32_networkadapter where "NetEnabled=true" get Name,NetConnectionID');
      const adapters = stdout.split('\n').filter(line => line.trim() && !line.includes('Name'));
      
      if (adapters.length > 2) { // More than just loopback
        log.info(`Detected ${adapters.length} network adapters`);
        store.set('networkAdapters', adapters);
      }
    } catch (error) {
      log.debug('Could not detect network adapters:', error);
    }
  }

  /**
   * Setup Windows power management (sleep/wake handling)
   */
  private setupPowerManagement(): void {
    try {
      const { powerMonitor } = require('electron');
      
      // Handle system suspend
      powerMonitor.on('suspend', () => {
        log.info('System is going to sleep');
        
        // Pause sync service
        if (this.syncService && this.syncService.getSyncStatus()) {
          this.syncService.pause();
        }
      });

      // Handle system resume
      powerMonitor.on('resume', () => {
        log.info('System resumed from sleep');
        
        // Reconnect to PocketCloud after wake
        setTimeout(async () => {
          if (this.discoveryService) {
            await this.discoveryService.forceReconnect();
          }
          
          // Resume sync service
          if (this.syncService && store.get('syncEnabled')) {
            await this.syncService.resume();
          }
          
          // Check WebDAV mount
          await this.checkWebDAVMount();
        }, 3000); // Wait 3 seconds for network to stabilize
      });

      // Handle lock screen
      powerMonitor.on('lock-screen', () => {
        log.info('Screen locked');
      });

      // Handle unlock screen
      powerMonitor.on('unlock-screen', () => {
        log.info('Screen unlocked');
      });

      log.info('Power management configured');
      
    } catch (error) {
      log.error('Failed to setup power management:', error);
    }
  }
}

// IPC handlers for renderer process
ipcMain.handle('get-store-value', (_, key: string) => {
  return store.get(key);
});

ipcMain.handle('set-store-value', (_, key: string, value: any) => {
  store.set(key, value);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-item-in-folder', (_, path: string) => {
  shell.showItemInFolder(path);
});

ipcMain.handle('open-external', (_, url: string) => {
  shell.openExternal(url);
});

// Create app instance
new PocketCloudApp();