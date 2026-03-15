import { EventEmitter } from 'events';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import Store from 'electron-store';
import log from 'electron-log';

const execAsync = promisify(exec);

/**
 * Windows WebDAV Mount Service
 * 
 * Maps PocketCloud as a network drive using Windows built-in WebDAV client.
 * Implements two methods with fallback:
 * 
 * Method A: Direct WebDAV via net use command
 * Method B: Registry tweak + WebClient service restart (for HTTP support)
 * 
 * Handles Windows-specific WebDAV limitations and provides seamless
 * network drive integration.
 */

export interface MountOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  driveLetter?: string;
  persistent?: boolean;
}

export class WindowsMountService extends EventEmitter {
  private store: Store;
  private currentMount: string | null = null;
  private mountCheckInterval: NodeJS.Timeout | null = null;

  constructor(store: Store) {
    super();
    this.store = store;
  }

  /**
   * Check if WebDAV is currently mounted and attempt to mount if not
   */
  public async checkAndMount(): Promise<void> {
    try {
      const connection = this.store.get('connection') as any;
      if (!connection.username || !connection.password) {
        log.warn('No credentials configured for WebDAV mount');
        return;
      }

      // Check if already mounted
      const mountedDrive = await this.findExistingMount();
      if (mountedDrive) {
        this.currentMount = mountedDrive;
        this.emit('mounted', mountedDrive);
        log.info(`WebDAV already mounted as ${mountedDrive}:`);
        return;
      }

      // Attempt to mount
      await this.mountWebDAV({
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        persistent: true
      });

    } catch (error) {
      log.error('Failed to check/mount WebDAV:', error);
      this.emit('mount-error', error);
    }
  }

  /**
   * Mount WebDAV using Windows built-in client
   */
  public async mountWebDAV(options: MountOptions): Promise<string> {
    try {
      log.info('Attempting WebDAV mount...');

      // Method A: Try direct mount first
      try {
        const driveLetter = await this.mountDirect(options);
        this.currentMount = driveLetter;
        this.emit('mounted', driveLetter);
        this.startMountMonitoring();
        return driveLetter;
      } catch (directError) {
        log.warn('Direct mount failed, trying registry fix method:', directError);
      }

      // Method B: Registry fix + mount
      await this.enableHTTPWebDAV();
      const driveLetter = await this.mountDirect(options);
      this.currentMount = driveLetter;
      this.emit('mounted', driveLetter);
      this.startMountMonitoring();
      return driveLetter;

    } catch (error) {
      log.error('WebDAV mount failed:', error);
      this.emit('mount-error', error);
      throw error;
    }
  }

  /**
   * Method A: Direct WebDAV mount via net use
   */
  private async mountDirect(options: MountOptions): Promise<string> {
    const driveLetter = options.driveLetter || await this.findAvailableDriveLetter();
    const webdavUrl = `http://${options.host}:${options.port}/webdav`;
    const persistent = options.persistent ? '/persistent:yes' : '';

    const command = `net use ${driveLetter}: "${webdavUrl}" /user:"${options.username}" "${options.password}" ${persistent}`;
    
    log.info(`Executing mount command: net use ${driveLetter}: [URL] /user:[USER] [PASSWORD] ${persistent}`);

    try {
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && stderr.includes('error')) {
        throw new Error(`Mount failed: ${stderr}`);
      }

      // Verify mount
      const isVerified = await this.verifyMount(driveLetter);
      if (!isVerified) {
        throw new Error('Mount verification failed');
      }

      log.info(`WebDAV mounted successfully as ${driveLetter}:`);
      return driveLetter;

    } catch (error) {
      log.error(`Direct mount failed: ${error}`);
      throw error;
    }
  }

  /**
   * Method B: Enable HTTP WebDAV via registry (requires admin)
   */
  private async enableHTTPWebDAV(): Promise<void> {
    try {
      log.info('Enabling HTTP WebDAV support via registry...');

      // Check if WebClient service is running
      await this.ensureWebClientService();

      // Registry command to allow HTTP basic auth
      const regCommand = `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters" /v BasicAuthLevel /t REG_DWORD /d 2 /f`;
      
      const { stdout, stderr } = await execAsync(regCommand);
      
      if (stderr && stderr.includes('error')) {
        throw new Error(`Registry update failed: ${stderr}`);
      }

      // Restart WebClient service to apply changes
      await execAsync('net stop webclient');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      await execAsync('net start webclient');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for service to start

      log.info('HTTP WebDAV support enabled successfully');

    } catch (error) {
      log.error('Failed to enable HTTP WebDAV:', error);
      throw new Error(`Registry fix failed: ${error}. Try running as administrator.`);
    }
  }

  /**
   * Ensure WebClient service is running
   */
  private async ensureWebClientService(): Promise<void> {
    try {
      // Check service status
      const { stdout } = await execAsync('sc query webclient');
      
      if (stdout.includes('STOPPED')) {
        log.info('Starting WebClient service...');
        await execAsync('net start webclient');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      log.info('WebClient service is running');

    } catch (error) {
      log.error('Failed to start WebClient service:', error);
      throw new Error('WebClient service is required for WebDAV mounting');
    }
  }

  /**
   * Find an available drive letter
   */
  private async findAvailableDriveLetter(): Promise<string> {
    try {
      const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
      const usedLetters: string[] = stdout.match(/[A-Z]:/g) || [];
      
      // Prefer P: for PocketCloud, then other letters
      const preferredLetters = ['P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
      
      for (const letter of preferredLetters) {
        if (!usedLetters.includes(`${letter}:`)) {
          return letter;
        }
      }

      throw new Error('No available drive letters');

    } catch (error) {
      log.error('Failed to find available drive letter:', error);
      return 'P'; // Default fallback
    }
  }

  /**
   * Verify that the mount was successful
   */
  private async verifyMount(driveLetter: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`dir ${driveLetter}: /b`);
      return true; // If dir command succeeds, mount is working
    } catch (error) {
      return false;
    }
  }

  /**
   * Find existing WebDAV mount
   */
  private async findExistingMount(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('net use');
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        if (line.includes('/webdav') && line.includes('OK')) {
          const match = line.match(/([A-Z]):/);
          if (match) {
            return match[1];
          }
        }
      }

      return null;

    } catch (error) {
      log.error('Failed to check existing mounts:', error);
      return null;
    }
  }

  /**
   * Unmount WebDAV drive
   */
  public async unmountWebDAV(): Promise<void> {
    if (!this.currentMount) {
      log.warn('No WebDAV mount to unmount');
      return;
    }

    try {
      log.info(`Unmounting WebDAV drive ${this.currentMount}:`);
      
      const command = `net use ${this.currentMount}: /delete /y`;
      await execAsync(command);
      
      this.stopMountMonitoring();
      this.currentMount = null;
      this.emit('unmounted');
      
      log.info('WebDAV unmounted successfully');

    } catch (error) {
      log.error('Failed to unmount WebDAV:', error);
      throw error;
    }
  }

  /**
   * Start monitoring mount status
   */
  private startMountMonitoring(): void {
    if (this.mountCheckInterval) {
      clearInterval(this.mountCheckInterval);
    }

    this.mountCheckInterval = setInterval(async () => {
      if (this.currentMount) {
        const isStillMounted = await this.verifyMount(this.currentMount);
        if (!isStillMounted) {
          log.warn(`WebDAV mount ${this.currentMount}: was disconnected`);
          this.currentMount = null;
          this.emit('unmounted');
          this.stopMountMonitoring();
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop monitoring mount status
   */
  private stopMountMonitoring(): void {
    if (this.mountCheckInterval) {
      clearInterval(this.mountCheckInterval);
      this.mountCheckInterval = null;
    }
  }

  /**
   * Get current mount status
   */
  public getCurrentMount(): string | null {
    return this.currentMount;
  }

  /**
   * Check if WebDAV is currently mounted
   */
  public isMounted(): boolean {
    return this.currentMount !== null;
  }

  /**
   * Cleanup on service shutdown
   */
  public async cleanup(): Promise<void> {
    this.stopMountMonitoring();
    
    // Optionally unmount on cleanup (user preference)
    const unmountOnExit = this.store.get('unmountOnExit') as boolean;
    if (unmountOnExit && this.currentMount) {
      try {
        await this.unmountWebDAV();
      } catch (error) {
        log.error('Failed to unmount on cleanup:', error);
      }
    }
  }
}