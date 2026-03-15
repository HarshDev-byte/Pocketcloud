/**
 * Network service - The most critical service controlling all three network modes
 * Handles WiFi scanning, hotspot mode, client WiFi mode, ethernet monitoring, and mDNS
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { safeExec } from '../utils/shell.utils.js';
import { getWiFiIP, getEthernetIP, getHotspotIP, getAllInterfaces } from '../utils/ip.utils.js';
import { NetworkConfig, UpdateNetworkConfigData, WiFiNetwork, NetworkStatus } from '../db/types.js';
import { getDatabase } from '../db/client.js';

// Custom error classes
export class NetworkScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkScanError';
  }
}

export class ShellError extends Error {
  constructor(message: string, public command: string, public stderr: string) {
    super(message);
    this.name = 'ShellError';
  }
}

// Extended types for network operations
export interface ConnectResult {
  success: boolean;
  ip?: string;
  ssid?: string;
  error?: string;
}

export interface EthernetStatus {
  connected: boolean;
  ip: string | null;
  speed: string | null;
}

export interface WifiNetwork {
  ssid: string;
  signal: number;
  secured: boolean;
  frequency: string;
}

export class NetworkService {
  private ethernetWatcher: NodeJS.Timeout | null = null;

  /**
   * Get current network configuration from database
   */
  async getNetworkConfig(): Promise<NetworkConfig> {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM network_config ORDER BY id DESC LIMIT 1');
    const config = stmt.get() as NetworkConfig | undefined;
    
    if (!config) {
      // Create default configuration
      const defaultConfig = {
        mode: 'hotspot' as const,
        hotspot_ssid: 'PocketCloud',
        hotspot_password: 'pocketcloud123',
        client_ssid: null,
        client_password: null,
        hotspot_also_on: 1,
        updated_at: Date.now()
      };
      
      const insertStmt = db.prepare(`
        INSERT INTO network_config (mode, hotspot_ssid, hotspot_password, client_ssid, client_password, hotspot_also_on, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = insertStmt.run(
        defaultConfig.mode,
        defaultConfig.hotspot_ssid,
        defaultConfig.hotspot_password,
        defaultConfig.client_ssid,
        defaultConfig.client_password,
        defaultConfig.hotspot_also_on,
        defaultConfig.updated_at
      );
      
      return { id: result.lastInsertRowid as number, ...defaultConfig };
    }
    
    return config;
  }

  /**
   * Update network configuration in database
   */
  async updateNetworkConfig(updates: UpdateNetworkConfigData): Promise<NetworkConfig> {
    const db = getDatabase();
    const current = await this.getNetworkConfig();
    
    const updated = {
      ...current,
      ...updates,
      updated_at: Date.now()
    };
    
    const stmt = db.prepare(`
      UPDATE network_config 
      SET mode = ?, hotspot_ssid = ?, hotspot_password = ?, client_ssid = ?, client_password = ?, hotspot_also_on = ?, updated_at = ?
      WHERE id = ?
    `);
    
    stmt.run(
      updated.mode,
      updated.hotspot_ssid,
      updated.hotspot_password,
      updated.client_ssid,
      updated.client_password,
      updated.hotspot_also_on,
      updated.updated_at,
      updated.id
    );
    
    return updated;
  }

  /**
   * Sanitize input for shell commands - never log passwords
   */
  private sanitizeForShell(input: string): string {
    // Allow alphanumeric + spaces + -.@#!
    const allowedChars = /^[a-zA-Z0-9\s\-\.@#!]+$/;
    if (!allowedChars.test(input)) {
      throw new Error('Input contains disallowed characters');
    }
    return input;
  }

  /**
   * Execute shell command safely with logging (sanitized)
   */
  private async execSafe(cmd: string, hideFromLog: boolean = false): Promise<string> {
    try {
      if (!hideFromLog) {
        console.log(`[NetworkService] Executing: ${cmd}`);
      }
      
      const result = await safeExec(cmd, { timeout: 15000 });
      
      if (!result.success) {
        throw new ShellError(`Command failed: ${cmd}`, cmd, result.stderr);
      }
      
      return result.stdout;
    } catch (error) {
      if (error instanceof ShellError) {
        throw error;
      }
      throw new ShellError(`Command execution error: ${cmd}`, cmd, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Scan for available WiFi networks
   */
  async scanWifiNetworks(): Promise<WifiNetwork[]> {
    try {
      const output = await this.execSafe('sudo iwlist wlan0 scan');
      
      const networks: WifiNetwork[] = [];
      const cells = output.split('Cell ').slice(1); // Remove first empty element
      
      for (const cell of cells) {
        const ssidMatch = cell.match(/ESSID:"([^"]+)"/);
        const signalMatch = cell.match(/Signal level=(-?\d+)/);
        const frequencyMatch = cell.match(/Frequency:([^\s]+)/);
        const encryptionMatch = cell.match(/Encryption key:(on|off)/);
        
        if (ssidMatch && ssidMatch[1]) {
          const ssid = ssidMatch[1];
          
          // Filter out empty SSIDs and our own hotspot
          if (ssid && ssid !== 'PocketCloud') {
            const signal = signalMatch ? parseInt(signalMatch[1]) : -100;
            const frequency = frequencyMatch ? frequencyMatch[1] : '';
            const secured = encryptionMatch ? encryptionMatch[1] === 'on' : true;
            
            networks.push({ ssid, signal, secured, frequency });
          }
        }
      }
      
      // Deduplicate by SSID (keep strongest signal)
      const deduped = new Map<string, WifiNetwork>();
      for (const network of networks) {
        const existing = deduped.get(network.ssid);
        if (!existing || network.signal > existing.signal) {
          deduped.set(network.ssid, network);
        }
      }
      
      // Sort by signal strength descending
      return Array.from(deduped.values()).sort((a, b) => b.signal - a.signal);
      
    } catch (error) {
      throw new NetworkScanError(`WiFi scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enable hotspot mode
   */
  async enableHotspot(ssid: string, password: string): Promise<void> {
    try {
      // Sanitize inputs
      const safeSsid = this.sanitizeForShell(ssid);
      const safePassword = this.sanitizeForShell(password);
      
      // Stop wpa_supplicant on wlan0
      await this.execSafe('sudo systemctl stop wpa_supplicant');
      
      // Write hostapd configuration
      const hostapdConfig = `interface=wlan0
ssid=${safeSsid}
wpa_passphrase=${safePassword}
hw_mode=g
channel=6
wmm_enabled=1
ieee80211n=1
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP`;
      
      writeFileSync('/etc/hostapd/hostapd.conf', hostapdConfig);
      
      // Set static IP
      await this.execSafe('sudo ip addr add 192.168.4.1/24 dev wlan0');
      
      // Start hostapd
      await this.execSafe('sudo systemctl start hostapd');
      
      // Start dnsmasq
      await this.execSafe('sudo systemctl start dnsmasq');
      
      // Update database
      await this.updateNetworkConfig({ 
        mode: 'hotspot',
        hotspot_ssid: ssid,
        hotspot_password: password
      });
      
    } catch (error) {
      // Always fallback to ensure Pi has network access
      try {
        await this.disableHotspot();
      } catch (cleanupError) {
        console.error('Failed to cleanup after hotspot enable error:', cleanupError);
      }
      throw error;
    }
  }

  /**
   * Disable hotspot mode
   */
  async disableHotspot(): Promise<void> {
    await this.execSafe('sudo systemctl stop hostapd');
    await this.execSafe('sudo systemctl stop dnsmasq');
    await this.execSafe('sudo ip addr flush dev wlan0');
  }

  /**
   * Connect to WiFi network
   */
  async connectToWifi(ssid: string, password: string): Promise<ConnectResult> {
    try {
      // Sanitize inputs
      const safeSsid = this.sanitizeForShell(ssid);
      const safePassword = this.sanitizeForShell(password);
      
      // Get current config to check hotspot_also_on
      const config = await this.getNetworkConfig();
      
      // Stop hostapd if running
      try {
        await this.execSafe('sudo systemctl stop hostapd');
      } catch (error) {
        // Ignore if already stopped
      }
      
      // Write wpa_supplicant configuration
      const wpaConfig = `ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=US

network={
    ssid="${safeSsid}"
    psk="${safePassword}"
    key_mgmt=WPA-PSK
}`;
      
      writeFileSync('/etc/wpa_supplicant/wpa_supplicant.conf', wpaConfig);
      
      // Start wpa_supplicant
      await this.execSafe('sudo wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf', true);
      
      // Request DHCP lease
      await this.execSafe('sudo dhclient wlan0');
      
      // Poll for IP address (10 attempts × 2 seconds)
      let ip: string | null = null;
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          const ipOutput = await this.execSafe('ip addr show wlan0 | grep "inet "');
          const ipMatch = ipOutput.match(/inet (\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch) {
            ip = ipMatch[1];
            break;
          }
        } catch (error) {
          // Continue polling
        }
      }
      
      if (ip) {
        // Success - update database
        await this.updateNetworkConfig({
          mode: 'client',
          client_ssid: ssid,
          client_password: password
        });
        
        // Re-enable hotspot if hotspot_also_on is set (AP+STA mode)
        if (config.hotspot_also_on) {
          try {
            // Check if chipset supports concurrent AP+STA
            const iwOutput = await this.execSafe('iw list | grep -A 10 "valid interface combinations"');
            if (iwOutput.includes('AP') && iwOutput.includes('managed')) {
              await this.enableHotspot(config.hotspot_ssid, config.hotspot_password);
            }
          } catch (error) {
            console.warn('Failed to enable concurrent hotspot:', error);
          }
        }
        
        return { success: true, ip, ssid };
      } else {
        // Timeout - rollback to hotspot mode
        await this.disconnectWifi();
        await this.enableHotspot(config.hotspot_ssid, config.hotspot_password);
        return { success: false, error: 'Failed to obtain IP address' };
      }
      
    } catch (error) {
      // Always fallback to hotspot to ensure Pi has network access
      try {
        const config = await this.getNetworkConfig();
        await this.enableHotspot(config.hotspot_ssid, config.hotspot_password);
      } catch (fallbackError) {
        console.error('Critical: Failed to fallback to hotspot mode:', fallbackError);
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Disconnect from WiFi
   */
  async disconnectWifi(): Promise<void> {
    await this.execSafe('sudo killall wpa_supplicant || true');
    await this.execSafe('sudo dhclient -r wlan0 || true');
    
    // Revert to hotspot mode
    const config = await this.getNetworkConfig();
    await this.enableHotspot(config.hotspot_ssid, config.hotspot_password);
  }

  /**
   * Get ethernet connection status
   */
  async getEthernetStatus(): Promise<EthernetStatus> {
    try {
      const ipOutput = await this.execSafe('ip addr show eth0');
      const ipMatch = ipOutput.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      const ip = ipMatch ? ipMatch[1] : null;
      
      let speed: string | null = null;
      try {
        const speedOutput = await this.execSafe('cat /sys/class/net/eth0/speed');
        const speedValue = parseInt(speedOutput.trim());
        speed = speedValue === -1 ? null : `${speedValue}Mbps`;
      } catch (error) {
        // Speed not available
      }
      
      return {
        connected: ip !== null,
        ip,
        speed
      };
    } catch (error) {
      return { connected: false, ip: null, speed: null };
    }
  }

  /**
   * Watch ethernet connection changes
   */
  async watchEthernetConnection(onChange: (status: EthernetStatus) => void): void {
    let lastStatus: EthernetStatus | null = null;
    
    this.ethernetWatcher = setInterval(async () => {
      try {
        const currentStatus = await this.getEthernetStatus();
        
        if (!lastStatus || 
            lastStatus.connected !== currentStatus.connected ||
            lastStatus.ip !== currentStatus.ip) {
          
          onChange(currentStatus);
          
          // Emit events
          if (currentStatus.connected && (!lastStatus || !lastStatus.connected)) {
            process.emit('ethernet:connected' as any, currentStatus);
          } else if (!currentStatus.connected && lastStatus?.connected) {
            process.emit('ethernet:disconnected' as any);
          }
          
          lastStatus = currentStatus;
        }
      } catch (error) {
        console.error('Ethernet monitoring error:', error);
      }
    }, 5000);
  }

  /**
   * Get comprehensive network status
   */
  async getNetworkStatus(): Promise<NetworkStatus & {
    mdns: { hostname: string; active: boolean };
    accessUrls: string[];
  }> {
    try {
      const config = await this.getNetworkConfig();
      const ethernetStatus = await this.getEthernetStatus();
      const wifiIp = await getWiFiIP();
      const hotspotIp = getHotspotIP();
      
      // Check if hotspot is active
      let hotspotActive = false;
      let connectedClients = 0;
      try {
        await this.execSafe('systemctl is-active hostapd');
        hotspotActive = true;
        connectedClients = await this.getConnectedClients();
      } catch (error) {
        // Hotspot not active
      }
      
      // Check WiFi connection
      const wifiConnected = wifiIp !== null;
      
      // Check mDNS status
      let mdnsActive = false;
      try {
        await this.execSafe('systemctl is-active avahi-daemon');
        mdnsActive = true;
      } catch (error) {
        // mDNS not active
      }
      
      // Build access URLs
      const accessUrls: string[] = [];
      if (hotspotIp) accessUrls.push(`http://${hotspotIp}`);
      if (wifiIp) accessUrls.push(`http://${wifiIp}`);
      if (ethernetStatus.ip) accessUrls.push(`http://${ethernetStatus.ip}`);
      if (mdnsActive) accessUrls.push('http://pocketcloud.local');
      
      return {
        mode: config.mode,
        hotspot: {
          active: hotspotActive,
          ssid: config.hotspot_ssid,
          password: config.hotspot_password,
          ip: hotspotIp || '192.168.4.1',
          connected_devices: connectedClients
        },
        client: {
          connected: wifiConnected,
          ssid: config.client_ssid,
          ip: wifiIp
        },
        ethernet: {
          connected: ethernetStatus.connected,
          ip: ethernetStatus.ip
        },
        mdns: {
          hostname: 'pocketcloud.local',
          active: mdnsActive
        },
        accessUrls
      };
    } catch (error) {
      throw new Error(`Get network status failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get number of connected clients to hotspot
   */
  async getConnectedClients(): Promise<number> {
    try {
      const arpOutput = await this.execSafe('cat /proc/net/arp');
      const lines = arpOutput.split('\n').slice(1); // Skip header
      
      let count = 0;
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 1 && parts[0].startsWith('192.168.4.')) {
          count++;
        }
      }
      
      return count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Start mDNS service
   */
  async startMdns(): Promise<void> {
    // Write Avahi service file
    const serviceConfig = `<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">PocketCloud on %h</name>
  <service>
    <type>_pocketcloud._tcp</type>
    <port>80</port>
    <txt-record>version=1.0</txt-record>
    <txt-record>model=PocketCloud</txt-record>
  </service>
  <service>
    <type>_http._tcp</type>
    <port>80</port>
  </service>
</service-group>`;
    
    writeFileSync('/etc/avahi/services/pocketcloud.service', serviceConfig);
    
    // Restart Avahi daemon
    await this.execSafe('sudo systemctl restart avahi-daemon');
  }
}

export const networkService = new NetworkService();