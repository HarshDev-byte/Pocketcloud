import { execSync } from 'child_process';
import fs from 'fs';
import { db } from '../db/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// Types
export interface NetworkStatus {
  mode: 'hotspot' | 'client' | 'ethernet';
  hotspot: {
    active: boolean;
    ssid: string;
    ip: string;
    clientCount: number;
  };
  wifi: {
    connected: boolean;
    ssid: string | null;
    ip: string | null;
  };
  ethernet: {
    connected: boolean;
    ip: string | null;
  };
  accessUrls: string[];
}

export interface WifiNetwork {
  ssid: string;
  signal: number;
  secured: boolean;
  frequency: string | null;
}

export interface ConnectResult {
  success: boolean;
  ssid: string;
  ip: string;
}

export interface HotspotConfig {
  ssid: string;
  channel: number;
  keepHotspot: boolean;
}

class ShellError extends Error {
  constructor(public command: string, public stderr: string) {
    super(`Shell command failed: ${command}\n${stderr}`);
    this.name = 'ShellError';
  }
}

class ValidationError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 400);
  }
}

export class NetworkService {
  // Execute shell command safely with timeout and logging
  private static execSafe(cmd: string, options?: { timeout?: number }): string {
    const timeout = options?.timeout ?? 15000;
    
    // Log command (redact passwords)
    const safeCmd = cmd.replace(/psk="[^"]*"/g, 'psk="[REDACTED]"');
    logger.debug('Executing shell command', { command: safeCmd });

    try {
      const output = execSync(cmd, {
        timeout,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return output;
    } catch (err: any) {
      const stderr = err.stderr?.toString() || err.message;
      logger.error('Shell command failed', { command: safeCmd, stderr });
      throw new ShellError(cmd, stderr);
    }
  }

  // Get current network configuration from database
  private static getDbConfig() {
    const config = db.prepare(`
      SELECT mode, hotspot_ssid, hotspot_password, hotspot_channel, 
             client_ssid, client_ip, ethernet_ip, keep_hotspot
      FROM network_config WHERE id = 1
    `).get() as any;

    if (!config) {
      throw new AppError('CONFIG_NOT_FOUND', 'Network configuration not found', 500);
    }

    return config;
  }

  // Get comprehensive network status
  static async getNetworkStatus(): Promise<NetworkStatus> {
    const dbConfig = this.getDbConfig();

    // Check if hotspot is active
    let hotspotActive = false;
    try {
      const status = this.execSafe('systemctl is-active hostapd').trim();
      hotspotActive = status === 'active';
    } catch {
      hotspotActive = false;
    }

    // Get wlan0 IP addresses
    let wlanIPs: string[] = [];
    try {
      const wlanInfo = this.execSafe('ip addr show wlan0');
      const matches = [...wlanInfo.matchAll(/inet (\d+\.\d+\.\d+\.\d+)/g)];
      wlanIPs = matches.map(m => m[1]);
    } catch {
      wlanIPs = [];
    }

    // Get eth0 IP
    let ethernetIP: string | null = null;
    try {
      const ethInfo = this.execSafe('ip addr show eth0');
      const ethMatch = ethInfo.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      ethernetIP = ethMatch?.[1] ?? null;
    } catch {
      ethernetIP = null;
    }

    // Get connected WiFi SSID (if in client mode)
    let connectedSSID: string | null = null;
    try {
      const iwOutput = this.execSafe('iwgetid -r');
      connectedSSID = iwOutput.trim() || null;
    } catch {
      connectedSSID = null;
    }

    // Count connected hotspot clients
    let clientCount = 0;
    try {
      const arpOutput = this.execSafe('cat /proc/net/arp');
      clientCount = arpOutput
        .split('\n')
        .filter(line => 
          line.includes('192.168.4.') && 
          !line.includes('00:00:00:00:00:00')
        ).length;
    } catch {
      clientCount = 0;
    }

    // Build access URLs
    const accessUrls = this.buildAccessUrls(hotspotActive, wlanIPs, ethernetIP);

    return {
      mode: dbConfig.mode,
      hotspot: {
        active: hotspotActive,
        ssid: dbConfig.hotspot_ssid,
        ip: '192.168.4.1',
        clientCount
      },
      wifi: {
        connected: !!connectedSSID,
        ssid: connectedSSID,
        ip: wlanIPs.find(ip => !ip.startsWith('192.168.4.')) || null
      },
      ethernet: {
        connected: !!ethernetIP,
        ip: ethernetIP
      },
      accessUrls
    };
  }

  // Build list of URLs where PocketCloud can be accessed
  private static buildAccessUrls(
    hotspotActive: boolean, 
    wlanIPs: string[], 
    ethernetIP: string | null
  ): string[] {
    const urls: string[] = [];
    const port = process.env.PORT || 3000;

    // Hotspot URL
    if (hotspotActive) {
      urls.push(`http://192.168.4.1:${port}`);
    }

    // WiFi client IPs
    wlanIPs
      .filter(ip => !ip.startsWith('192.168.4.'))
      .forEach(ip => urls.push(`http://${ip}:${port}`));

    // Ethernet IP
    if (ethernetIP) {
      urls.push(`http://${ethernetIP}:${port}`);
    }

    // mDNS hostname
    urls.push(`http://pocketcloud.local:${port}`);

    return urls;
  }

  // Scan for available WiFi networks
  static async scanWifiNetworks(): Promise<WifiNetwork[]> {
    logger.info('Starting WiFi scan...');
    
    try {
      const output = this.execSafe('sudo iwlist wlan0 scan', { timeout: 20000 });
      
      // Parse iwlist output
      const cells = output.split('Cell ').slice(1);
      const networks = cells.map(cell => {
        const ssid = cell.match(/ESSID:"([^"]+)"/)?.[1];
        const signalMatch = cell.match(/Signal level=(-?\d+)/);
        const signal = signalMatch ? parseInt(signalMatch[1]) : -100;
        const secured = cell.includes('Encryption key:on');
        const freq = cell.match(/Frequency:(\S+)/)?.[1] || null;

        return { ssid, signal, secured, frequency: freq };
      });

      const dbConfig = this.getDbConfig();

      // Filter and deduplicate
      const filtered = networks
        .filter(n => n.ssid && n.ssid !== dbConfig.hotspot_ssid) // Exclude own hotspot
        .filter((n, i, arr) => arr.findIndex(x => x.ssid === n.ssid) === i) // Deduplicate
        .sort((a, b) => b.signal - a.signal); // Strongest first

      logger.info(`WiFi scan complete: ${filtered.length} networks found`);
      return filtered as WifiNetwork[];
    } catch (err: any) {
      logger.error('WiFi scan failed', { error: err.message });
      throw new AppError('SCAN_FAILED', 'Failed to scan WiFi networks', 500);
    }
  }

  // Connect to a WiFi network
  static async connectToWifi(ssid: string, password: string): Promise<ConnectResult> {
    logger.info('Attempting WiFi connection', { ssid });

    // Sanitize inputs to prevent shell injection
    const safeSsid = ssid.replace(/['"\\$`]/g, '');
    const safePassword = password.replace(/['"\\$`]/g, '');

    if (safeSsid !== ssid || safePassword !== password) {
      throw new ValidationError(
        'INVALID_CHARS',
        'SSID or password contains invalid characters'
      );
    }

    const dbConfig = this.getDbConfig();

    // Step 1: Write wpa_supplicant config
    const wpaConfig = `ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=US

network={
  ssid="${safeSsid}"
  psk="${safePassword}"
  key_mgmt=WPA-PSK
  priority=1
}`.trim();

    fs.writeFileSync('/tmp/pocketcloud-wpa.conf', wpaConfig, { mode: 0o600 });
    logger.debug('WPA config written');

    // Step 2: Stop current hotspot if keep_hotspot is false
    if (!dbConfig.keep_hotspot) {
      logger.info('Stopping hotspot services');
      try {
        this.execSafe('sudo systemctl stop hostapd');
        this.execSafe('sudo systemctl stop dnsmasq');
      } catch (err) {
        logger.warn('Failed to stop hotspot services', { error: err });
      }
    }

    // Step 3: Connect to WiFi
    try {
      this.execSafe('sudo killall wpa_supplicant || true');
      this.execSafe('sudo wpa_supplicant -B -i wlan0 -c /tmp/pocketcloud-wpa.conf');
      this.execSafe('sudo dhclient wlan0');
    } catch (err: any) {
      logger.error('WiFi connection failed', { error: err.message });
      await this.restoreHotspot();
      throw new AppError(
        'WIFI_CONNECT_FAILED',
        'Failed to connect to WiFi. Hotspot restored.',
        400
      );
    }

    // Step 4: Wait for IP address (poll 15 times × 2 seconds = 30 second max)
    let ip: string | null = null;
    for (let i = 0; i < 15; i++) {
      await this.sleep(2000);
      
      try {
        const info = this.execSafe('ip addr show wlan0');
        const matches = [...info.matchAll(/inet (\d+\.\d+\.\d+\.\d+)/g)];
        const clientIp = matches
          .map(m => m[1])
          .find(addr => !addr.startsWith('192.168.4.'));
        
        if (clientIp) {
          ip = clientIp;
          break;
        }
      } catch {
        // Continue polling
      }
    }

    if (!ip) {
      logger.error('Failed to obtain IP address');
      await this.restoreHotspot();
      throw new AppError(
        'WIFI_CONNECT_FAILED',
        'Could not obtain IP address. Wrong password or network not found.',
        400
      );
    }

    // Step 5: Update database
    db.prepare(`
      UPDATE network_config 
      SET mode = 'client', client_ssid = ?, client_ip = ?, updated_at = ?
      WHERE id = 1
    `).run(ssid, ip, Date.now());

    // Clean up temp config
    try {
      fs.unlinkSync('/tmp/pocketcloud-wpa.conf');
    } catch {
      // Ignore cleanup errors
    }

    logger.info('WiFi connection successful', { ssid, ip });
    return { success: true, ssid, ip };
  }

  // Restore hotspot mode (fallback)
  static async restoreHotspot(): Promise<void> {
    logger.info('Restoring hotspot mode');

    try {
      this.execSafe('sudo killall wpa_supplicant || true');
      this.execSafe('sudo dhclient -r wlan0 || true');
      this.execSafe('sudo ip addr flush dev wlan0');
      this.execSafe('sudo ip addr add 192.168.4.1/24 dev wlan0');
      this.execSafe('sudo systemctl start hostapd');
      this.execSafe('sudo systemctl start dnsmasq');

      db.prepare(`
        UPDATE network_config 
        SET mode = 'hotspot', client_ssid = NULL, client_ip = NULL, updated_at = ?
        WHERE id = 1
      `).run(Date.now());

      logger.info('Hotspot restored successfully');
    } catch (err: any) {
      logger.error('Failed to restore hotspot', { error: err.message });
      throw new AppError('HOTSPOT_RESTORE_FAILED', 'Failed to restore hotspot mode', 500);
    }
  }

  // Disconnect from WiFi and restore hotspot
  static async disconnectWifi(): Promise<void> {
    logger.info('Disconnecting from WiFi');
    await this.restoreHotspot();
  }

  // Get hotspot configuration (without password)
  static getHotspotConfig(): HotspotConfig {
    const config = this.getDbConfig();
    return {
      ssid: config.hotspot_ssid,
      channel: config.hotspot_channel,
      keepHotspot: !!config.keep_hotspot
    };
  }

  // Update hotspot configuration
  static async updateHotspotConfig(
    ssid?: string,
    password?: string,
    channel?: number,
    keepHotspot?: boolean
  ): Promise<void> {
    logger.info('Updating hotspot configuration');

    const dbConfig = this.getDbConfig();
    const newSsid = ssid ?? dbConfig.hotspot_ssid;
    const newPassword = password ?? dbConfig.hotspot_password;
    const newChannel = channel ?? dbConfig.hotspot_channel;
    const newKeepHotspot = keepHotspot ?? !!dbConfig.keep_hotspot;

    // Sanitize inputs
    const safeSsid = newSsid.replace(/['"\\$`]/g, '');
    const safePassword = newPassword.replace(/['"\\$`]/g, '');

    if (safeSsid !== newSsid || safePassword !== newPassword) {
      throw new ValidationError(
        'INVALID_CHARS',
        'SSID or password contains invalid characters'
      );
    }

    if (safePassword.length < 8) {
      throw new ValidationError(
        'PASSWORD_TOO_SHORT',
        'Password must be at least 8 characters'
      );
    }

    // Update hostapd.conf
    const hostapdConf = `interface=wlan0
driver=nl80211
ssid=${safeSsid}
hw_mode=g
channel=${newChannel}
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=${safePassword}
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP`;

    try {
      fs.writeFileSync('/tmp/pocketcloud-hostapd.conf', hostapdConf, { mode: 0o600 });
      this.execSafe('sudo mv /tmp/pocketcloud-hostapd.conf /etc/hostapd/hostapd.conf');
      this.execSafe('sudo systemctl restart hostapd');
    } catch (err: any) {
      logger.error('Failed to update hostapd config', { error: err.message });
      throw new AppError('CONFIG_UPDATE_FAILED', 'Failed to update hotspot configuration', 500);
    }

    // Update database
    db.prepare(`
      UPDATE network_config 
      SET hotspot_ssid = ?, hotspot_password = ?, hotspot_channel = ?, 
          keep_hotspot = ?, updated_at = ?
      WHERE id = 1
    `).run(safeSsid, safePassword, newChannel, newKeepHotspot ? 1 : 0, Date.now());

    logger.info('Hotspot configuration updated', { ssid: safeSsid });
  }

  // Helper: sleep function
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
