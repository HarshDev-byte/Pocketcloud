import { EventEmitter } from 'events';
import Store from 'electron-store';
import axios, { AxiosResponse } from 'axios';

interface DeviceInfo {
  service: string;
  version: string;
  name: string;
  hostname: string;
  ip: string;
  ssid: string;
  features: string[];
  auth: string;
  setupRequired: boolean;
  storage: {
    total: number;
    used: number;
    free: number;
  };
  endpoints: {
    web: string;
    api: string;
    websocket: string;
    webdav?: string;
  };
}

/**
 * DiscoveryService - Auto-discovers PocketCloud devices on the network
 * 
 * Implements the three-method discovery chain:
 * 1. mDNS/Bonjour (pocketcloud.local)
 * 2. Fixed IP (192.168.4.1)
 * 3. Network scan (192.168.4.2-20)
 * 
 * Emits events: 'connected', 'disconnected', 'reconnected'
 */
export class DiscoveryService extends EventEmitter {
  private store: Store;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private currentDevice: DeviceInfo | null = null;
  private isConnected = false;
  private discoveryTimeout = 5000; // 5 seconds
  private pollInterval = 10000; // 10 seconds

  constructor(store: Store) {
    super();
    this.store = store;
  }

  public async start(): Promise<void> {
    console.log('Starting PocketCloud discovery service...');
    
    // Try immediate discovery
    await this.discoverDevice();
    
    // Start periodic discovery
    this.discoveryInterval = setInterval(() => {
      this.discoverDevice();
    }, this.pollInterval);
  }

  public stop(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    
    if (this.isConnected) {
      this.isConnected = false;
      this.currentDevice = null;
      this.emit('disconnected');
    }
  }

  public getCurrentDevice(): DeviceInfo | null {
    return this.currentDevice;
  }

  public async testConnection(ip: string): Promise<boolean> {
    try {
      const url = ip.startsWith('http') ? ip : `http://${ip}:3000`;
      const response = await this.pingDevice(url);
      return response !== null;
    } catch (error) {
      return false;
    }
  }

  private async discoverDevice(): Promise<void> {
    try {
      // Method 1: Try mDNS/Bonjour (pocketcloud.local)
      let deviceInfo = await this.tryMdnsDiscovery();
      
      // Method 2: Try last known IP
      if (!deviceInfo) {
        const lastKnownIP = this.store.get('connection.lastKnownIP') as string;
        if (lastKnownIP) {
          deviceInfo = await this.tryFixedIP(lastKnownIP);
        }
      }
      
      // Method 3: Try common fixed IPs
      if (!deviceInfo) {
        const commonIPs = ['192.168.4.1', '10.0.0.1', '192.168.1.1'];
        for (const ip of commonIPs) {
          deviceInfo = await this.tryFixedIP(ip);
          if (deviceInfo) break;
        }
      }
      
      // Method 4: Network scan (limited range for performance)
      if (!deviceInfo) {
        deviceInfo = await this.tryNetworkScan();
      }
      
      // Update connection status
      if (deviceInfo) {
        this.handleDeviceFound(deviceInfo);
      } else {
        this.handleDeviceLost();
      }
      
    } catch (error) {
      console.error('Discovery error:', error);
      this.handleDeviceLost();
    }
  }

  private async tryMdnsDiscovery(): Promise<DeviceInfo | null> {
    const mdnsUrls = [
      'http://pocketcloud.local:3000',
      'http://pocketcloud.local'
    ];
    
    for (const url of mdnsUrls) {
      try {
        const deviceInfo = await this.pingDevice(url);
        if (deviceInfo) {
          console.log('Found PocketCloud via mDNS:', url);
          return deviceInfo;
        }
      } catch (error) {
        // Continue to next URL
      }
    }
    
    return null;
  }

  private async tryFixedIP(ip: string): Promise<DeviceInfo | null> {
    const urls = [
      `http://${ip}:3000`,
      `http://${ip}`
    ];
    
    for (const url of urls) {
      try {
        const deviceInfo = await this.pingDevice(url);
        if (deviceInfo) {
          console.log('Found PocketCloud at fixed IP:', url);
          return deviceInfo;
        }
      } catch (error) {
        // Continue to next URL
      }
    }
    
    return null;
  }

  private async tryNetworkScan(): Promise<DeviceInfo | null> {
    // Scan common PocketCloud network ranges
    const networks = ['192.168.4', '192.168.1', '10.0.0'];
    
    for (const network of networks) {
      // Scan priority IPs first (common PocketCloud addresses)
      const priorityIPs = [`${network}.1`, `${network}.100`, `${network}.200`];
      
      for (const ip of priorityIPs) {
        try {
          const deviceInfo = await this.tryFixedIP(ip);
          if (deviceInfo) {
            console.log('Found PocketCloud via network scan:', ip);
            return deviceInfo;
          }
        } catch (error) {
          // Continue scanning
        }
      }
      
      // Quick scan of range 2-20 (most common DHCP range)
      const scanPromises: Promise<DeviceInfo | null>[] = [];
      
      for (let i = 2; i <= 20; i++) {
        const ip = `${network}.${i}`;
        scanPromises.push(this.tryFixedIP(ip));
      }
      
      try {
        const results = await Promise.allSettled(scanPromises);
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            console.log('Found PocketCloud via network scan');
            return result.value;
          }
        }
      } catch (error) {
        // Continue to next network
      }
    }
    
    return null;
  }

  private async pingDevice(url: string): Promise<DeviceInfo | null> {
    try {
      const response: AxiosResponse = await axios.get(`${url}/api/ping`, {
        timeout: this.discoveryTimeout,
        headers: {
          'User-Agent': 'PocketCloud-macOS/1.0.0'
        }
      });
      
      const data = response.data;
      
      // Verify this is a PocketCloud device
      if (data.service === 'pocketcloud') {
        // Enhance device info with WebDAV endpoint
        const deviceInfo: DeviceInfo = {
          ...data,
          endpoints: {
            ...data.endpoints,
            webdav: `${data.endpoints.web}/webdav`
          }
        };
        
        return deviceInfo;
      }
      
    } catch (error) {
      // Device not found or not responding
    }
    
    return null;
  }

  private handleDeviceFound(deviceInfo: DeviceInfo): void {
    const wasConnected = this.isConnected;
    const previousDevice = this.currentDevice;
    
    this.currentDevice = deviceInfo;
    
    // Store last known IP for faster discovery next time
    this.store.set('connection.lastKnownIP', deviceInfo.ip);
    
    if (!wasConnected) {
      // First connection
      this.isConnected = true;
      this.emit('connected', deviceInfo);
    } else if (!previousDevice || previousDevice.ip !== deviceInfo.ip) {
      // Reconnected to different IP
      this.emit('reconnected', deviceInfo);
    }
    // If same device, no event needed (just polling)
  }

  private handleDeviceLost(): void {
    if (this.isConnected) {
      this.isConnected = false;
      this.currentDevice = null;
      this.emit('disconnected');
    }
  }

  // Public method to force discovery (for manual refresh)
  public async forceDiscovery(): Promise<DeviceInfo | null> {
    await this.discoverDevice();
    return this.currentDevice;
  }

  // Get discovery statistics
  public getDiscoveryStats(): any {
    return {
      isConnected: this.isConnected,
      currentDevice: this.currentDevice,
      lastKnownIP: this.store.get('connection.lastKnownIP'),
      pollInterval: this.pollInterval,
      discoveryTimeout: this.discoveryTimeout
    };
  }
}