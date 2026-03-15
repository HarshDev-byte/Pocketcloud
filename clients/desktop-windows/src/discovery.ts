import { EventEmitter } from 'events';
import axios from 'axios';
import Store from 'electron-store';
import log from 'electron-log';

/**
 * PocketCloud Discovery Service for Windows
 * 
 * Discovers and maintains connection to PocketCloud device using:
 * - Bonjour/mDNS resolution (pocketcloud.local)
 * - Fallback to configured IP address
 * - Periodic health checks and reconnection
 * - Connection state management
 * - Device information caching
 */

export interface DeviceInfo {
  host: string;
  ip: string;
  port: number;
  version: string;
  deviceName: string;
  storageUsed: number;
  storageTotal: number;
  uptime: number;
}

export class DiscoveryService extends EventEmitter {
  private store: Store;
  private isConnected = false;
  private currentDevice: DeviceInfo | null = null;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(store: Store) {
    super();
    this.store = store;
  }

  /**
   * Start discovery service
   */
  public async start(): Promise<void> {
    try {
      log.info('Starting PocketCloud discovery service...');
      
      // Try to connect immediately
      await this.discoverDevice();
      
      // Start periodic discovery (every 30 seconds)
      this.discoveryInterval = setInterval(() => {
        if (!this.isConnected) {
          this.discoverDevice();
        }
      }, 30000);
      
      // Start health checks (every 10 seconds when connected)
      this.healthCheckInterval = setInterval(() => {
        if (this.isConnected) {
          this.performHealthCheck();
        }
      }, 10000);
      
      log.info('Discovery service started');
      
    } catch (error) {
      log.error('Failed to start discovery service:', error);
      throw error;
    }
  }

  /**
   * Stop discovery service
   */
  public stop(): void {
    log.info('Stopping discovery service...');
    
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.isConnected = false;
    this.currentDevice = null;
    this.reconnectAttempts = 0;
    
    log.info('Discovery service stopped');
  }

  /**
   * Discover PocketCloud device
   */
  private async discoverDevice(): Promise<void> {
    const connection = this.store.get('connection') as any;
    
    // Try methods in order of preference
    const discoveryMethods = [
      () => this.tryConnect(connection.host, connection.port),
      () => this.tryConnect(connection.ip, connection.port),
      () => this.tryConnect('pocketcloud.local', 3000),
      () => this.tryConnect('192.168.4.1', 3000)
    ];

    for (const method of discoveryMethods) {
      try {
        const deviceInfo = await method();
        if (deviceInfo) {
          await this.handleDeviceFound(deviceInfo);
          return;
        }
      } catch (error) {
        // Continue to next method
        continue;
      }
    }

    // No device found
    if (this.isConnected) {
      this.handleDeviceLost();
    }
  }

  /**
   * Try to connect to a specific host and port
   */
  private async tryConnect(host: string, port: number): Promise<DeviceInfo | null> {
    try {
      const url = `http://${host}:${port}/api/health`;
      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: (status) => status === 200
      });

      if (response.data && response.data.status === 'ok') {
        // Get additional device info
        const deviceInfo: DeviceInfo = {
          host,
          ip: host, // Will be resolved to actual IP
          port,
          version: response.data.version || '1.0.0',
          deviceName: 'PocketCloud',
          storageUsed: 0,
          storageTotal: 0,
          uptime: response.data.uptime || 0
        };

        // Try to get storage info
        try {
          const storageResponse = await axios.get(`http://${host}:${port}/api/admin/storage`, {
            timeout: 3000
          });
          
          if (storageResponse.data) {
            deviceInfo.storageUsed = storageResponse.data.used || 0;
            deviceInfo.storageTotal = storageResponse.data.total || 0;
          }
        } catch (error) {
          // Storage info not critical
          log.warn('Could not get storage info:', error.message);
        }

        return deviceInfo;
      }

      return null;

    } catch (error) {
      log.debug(`Connection attempt failed for ${host}:${port}:`, error.message);
      return null;
    }
  }

  /**
   * Handle device found
   */
  private async handleDeviceFound(deviceInfo: DeviceInfo): Promise<void> {
    const wasConnected = this.isConnected;
    
    this.isConnected = true;
    this.currentDevice = deviceInfo;
    this.reconnectAttempts = 0;
    
    // Update stored connection info
    this.store.set('connection.host', deviceInfo.host);
    this.store.set('connection.ip', deviceInfo.ip);
    this.store.set('connection.port', deviceInfo.port);
    this.store.set('lastConnected', Date.now());
    
    if (!wasConnected) {
      log.info(`Connected to PocketCloud: ${deviceInfo.host}:${deviceInfo.port}`);
      this.emit('connected', deviceInfo);
    } else {
      // Update existing connection
      this.emit('device-updated', deviceInfo);
    }
  }

  /**
   * Handle device lost
   */
  private handleDeviceLost(): void {
    if (!this.isConnected) {
      return;
    }

    log.warn('Lost connection to PocketCloud device');
    
    this.isConnected = false;
    const previousDevice = this.currentDevice;
    this.currentDevice = null;
    
    this.emit('disconnected', previousDevice);
    
    // Start reconnection attempts
    this.startReconnection();
  }

  /**
   * Start reconnection attempts with exponential backoff
   */
  private startReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30 seconds
    
    log.info(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(async () => {
      try {
        await this.discoverDevice();
        
        if (this.isConnected) {
          log.info('Reconnected to PocketCloud');
          this.emit('reconnected', this.currentDevice);
        } else {
          this.startReconnection(); // Try again
        }
      } catch (error) {
        log.error('Reconnection attempt failed:', error);
        this.startReconnection(); // Try again
      }
    }, delay);
  }

  /**
   * Perform health check on connected device
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.currentDevice) {
      return;
    }

    try {
      const deviceInfo = await this.tryConnect(this.currentDevice.host, this.currentDevice.port);
      
      if (deviceInfo) {
        // Update device info
        this.currentDevice = deviceInfo;
        this.emit('device-updated', deviceInfo);
      } else {
        // Health check failed
        this.handleDeviceLost();
      }

    } catch (error) {
      log.error('Health check failed:', error);
      this.handleDeviceLost();
    }
  }

  /**
   * Get current connection status
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get current device info
   */
  public getCurrentDevice(): DeviceInfo | null {
    return this.currentDevice;
  }

  /**
   * Force reconnection
   */
  public async forceReconnect(): Promise<void> {
    log.info('Forcing reconnection...');
    
    this.isConnected = false;
    this.currentDevice = null;
    this.reconnectAttempts = 0;
    
    await this.discoverDevice();
  }

  /**
   * Update connection settings
   */
  public updateConnectionSettings(host: string, port: number): void {
    this.store.set('connection.host', host);
    this.store.set('connection.port', port);
    
    log.info(`Connection settings updated: ${host}:${port}`);
    
    // Force reconnection with new settings
    this.forceReconnect();
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats(): {
    isConnected: boolean;
    reconnectAttempts: number;
    lastConnected: number;
    currentDevice: DeviceInfo | null;
  } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      lastConnected: this.store.get('lastConnected') as number || 0,
      currentDevice: this.currentDevice
    };
  }
}