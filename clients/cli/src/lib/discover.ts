/**
 * PocketCloud device discovery
 * Uses mDNS and IP scanning to find PocketCloud devices
 */

import mdns from 'multicast-dns';
import { networkInterfaces } from 'os';
import { api } from './api';
import { config } from './config';

export interface DiscoveredDevice {
  host: string;
  ip: string;
  port: number;
  name?: string;
  version?: string;
}

export class DeviceDiscovery {
  private mdnsClient: any = null;
  private timeout: number = 5000;

  /**
   * Discover PocketCloud devices using mDNS
   */
  public async discoverMDNS(timeout: number = this.timeout): Promise<DiscoveredDevice[]> {
    return new Promise((resolve) => {
      const devices: DiscoveredDevice[] = [];
      const foundIPs = new Set<string>();

      this.mdnsClient = mdns();

      // Listen for responses
      this.mdnsClient.on('response', (response: any) => {
        try {
          const answers = response.answers || [];
          
          for (const answer of answers) {
            if (answer.type === 'A' && answer.name === 'pocketcloud.local') {
              const ip = answer.data;
              
              if (!foundIPs.has(ip)) {
                foundIPs.add(ip);
                devices.push({
                  host: 'pocketcloud.local',
                  ip,
                  port: 3000 // Default port
                });
              }
            }
          }
        } catch (error) {
          // Ignore malformed responses
        }
      });

      // Query for pocketcloud.local
      this.mdnsClient.query({
        questions: [{
          name: 'pocketcloud.local',
          type: 'A'
        }]
      });

      // Timeout
      setTimeout(() => {
        this.mdnsClient?.destroy();
        this.mdnsClient = null;
        resolve(devices);
      }, timeout);
    });
  }

  /**
   * Scan local network for PocketCloud devices
   */
  public async scanNetwork(timeout: number = this.timeout): Promise<DiscoveredDevice[]> {
    const devices: DiscoveredDevice[] = [];
    const networks = this.getLocalNetworks();
    
    const scanPromises: Promise<void>[] = [];

    for (const network of networks) {
      for (let i = 1; i <= 254; i++) {
        const ip = `${network.base}.${i}`;
        
        scanPromises.push(
          this.checkDevice(ip, 3000, 2000).then(device => {
            if (device) {
              devices.push(device);
            }
          }).catch(() => {
            // Ignore connection errors
          })
        );
      }
    }

    // Wait for all scans to complete or timeout
    await Promise.race([
      Promise.allSettled(scanPromises),
      new Promise(resolve => setTimeout(resolve, timeout))
    ]);

    return devices;
  }

  /**
   * Check if a specific IP:port is a PocketCloud device
   */
  public async checkDevice(ip: string, port: number = 3000, timeout: number = 2000): Promise<DiscoveredDevice | null> {
    try {
      // Temporarily update config for this check
      const originalUrl = config.getConnectionUrl();
      config.set('ip', ip);
      config.set('port', port);
      api.updateConfig();

      const response = await api.getStatus();
      
      if (response.success && response.data) {
        const device: DiscoveredDevice = {
          host: ip,
          ip,
          port,
          name: 'PocketCloud',
          version: response.data.version
        };

        return device;
      }

      return null;

    } catch (error) {
      return null;
    } finally {
      // Restore original config
      api.updateConfig();
    }
  }

  /**
   * Discover devices using all available methods
   */
  public async discover(stealthMode: boolean = false): Promise<DiscoveredDevice[]> {
    const allDevices: DiscoveredDevice[] = [];
    const foundIPs = new Set<string>();

    // Method 1: Check configured device first
    const configuredIP = config.get('ip');
    const configuredHost = config.get('host');
    const configuredPort = config.get('port') || 3000;

    if (configuredIP) {
      const device = await this.checkDevice(configuredIP, configuredPort);
      if (device) {
        allDevices.push(device);
        foundIPs.add(device.ip);
      }
    }

    if (configuredHost && configuredHost !== configuredIP) {
      const device = await this.checkDevice(configuredHost, configuredPort);
      if (device) {
        allDevices.push(device);
        foundIPs.add(device.ip);
      }
    }

    // Method 2: mDNS discovery (unless stealth mode)
    if (!stealthMode) {
      try {
        const mdnsDevices = await this.discoverMDNS();
        for (const device of mdnsDevices) {
          if (!foundIPs.has(device.ip)) {
            // Verify it's actually a PocketCloud device
            const verified = await this.checkDevice(device.ip, device.port);
            if (verified) {
              allDevices.push(verified);
              foundIPs.add(device.ip);
            }
          }
        }
      } catch (error) {
        // mDNS might not be available, continue with other methods
      }
    }

    // Method 3: Common IP addresses
    const commonIPs = ['192.168.4.1', '192.168.1.100', '10.0.0.100'];
    for (const ip of commonIPs) {
      if (!foundIPs.has(ip)) {
        const device = await this.checkDevice(ip);
        if (device) {
          allDevices.push(device);
          foundIPs.add(device.ip);
        }
      }
    }

    // Method 4: Network scan (only if no devices found and not stealth mode)
    if (allDevices.length === 0 && !stealthMode) {
      try {
        const scanDevices = await this.scanNetwork(10000); // 10 second timeout
        for (const device of scanDevices) {
          if (!foundIPs.has(device.ip)) {
            allDevices.push(device);
            foundIPs.add(device.ip);
          }
        }
      } catch (error) {
        // Network scan failed, but we might have found devices via other methods
      }
    }

    return allDevices;
  }

  /**
   * Get local network ranges for scanning
   */
  private getLocalNetworks(): Array<{ base: string; interface: string }> {
    const networks: Array<{ base: string; interface: string }> = [];
    const interfaces = networkInterfaces();

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;

      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          const parts = addr.address.split('.');
          if (parts.length === 4) {
            const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
            networks.push({ base, interface: name });
          }
        }
      }
    }

    return networks;
  }

  /**
   * Stop any ongoing discovery
   */
  public stop(): void {
    if (this.mdnsClient) {
      this.mdnsClient.destroy();
      this.mdnsClient = null;
    }
  }
}

export const discovery = new DeviceDiscovery();