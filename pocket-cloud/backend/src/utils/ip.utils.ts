/**
 * Network IP address utilities
 * Functions for getting current IP addresses across different network interfaces
 */

import { networkInterfaces, NetworkInterfaceInfo } from 'os';
import { safeExec } from './shell.utils.js';

export interface NetworkInterface {
  name: string;
  address: string;
  netmask: string;
  family: 'IPv4' | 'IPv6';
  mac: string;
  internal: boolean;
  cidr: string | null;
}

export interface NetworkStatus {
  interfaces: NetworkInterface[];
  defaultGateway: string | null;
  dnsServers: string[];
  publicIP: string | null;
}

/**
 * Get all network interfaces with their IP addresses
 * @returns Array of network interface information
 */
export function getAllInterfaces(): NetworkInterface[] {
  // TODO: Parse network interfaces from OS
  // TODO: Filter out loopback and inactive interfaces
  // TODO: Include MAC addresses and CIDR notation
  // TODO: Handle IPv4 and IPv6 addresses
  
  const interfaces = networkInterfaces();
  const result: NetworkInterface[] = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!addresses) continue;

    for (const addr of addresses) {
      result.push({
        name,
        address: addr.address,
        netmask: addr.netmask,
        family: addr.family as 'IPv4' | 'IPv6',
        mac: addr.mac,
        internal: addr.internal,
        cidr: addr.cidr,
      });
    }
  }

  return result;
}

/**
 * Get IPv4 address for a specific interface
 * @param interfaceName - Name of the network interface (e.g., 'wlan0', 'eth0')
 * @returns IPv4 address or null if not found
 */
export function getInterfaceIP(interfaceName: string): string | null {
  // TODO: Get IP address for specific interface
  // TODO: Handle interface not found or not configured
  // TODO: Return only IPv4 addresses
  
  const interfaces = getAllInterfaces();
  const interface_ = interfaces.find(
    iface => iface.name === interfaceName && 
             iface.family === 'IPv4' && 
             !iface.internal
  );

  return interface_?.address || null;
}

/**
 * Get the primary/default network interface IP
 * @returns Primary IPv4 address or null
 */
export function getPrimaryIP(): string | null {
  // TODO: Determine primary network interface
  // TODO: Prefer non-internal, IPv4 addresses
  // TODO: Handle multiple active interfaces
  
  const interfaces = getAllInterfaces();
  const primaryInterface = interfaces.find(
    iface => iface.family === 'IPv4' && 
             !iface.internal &&
             !iface.address.startsWith('169.254.') // Exclude link-local
  );

  return primaryInterface?.address || null;
}

/**
 * Get WiFi interface IP address
 * @returns WiFi IP address or null
 */
export async function getWiFiIP(): Promise<string | null> {
  // TODO: Try common WiFi interface names
  // TODO: Use system commands to detect active WiFi interface
  // TODO: Handle multiple WiFi interfaces
  
  const commonWiFiInterfaces = ['wlan0', 'wlan1', 'wlp2s0', 'wlp3s0'];
  
  for (const interfaceName of commonWiFiInterfaces) {
    const ip = getInterfaceIP(interfaceName);
    if (ip) {
      return ip;
    }
  }

  // Try to detect WiFi interface using system commands
  try {
    const result = await safeExec('iwconfig 2>/dev/null | grep -o "^[a-zA-Z0-9]*"');
    if (result.success && result.stdout) {
      const wifiInterface = result.stdout.split('\n')[0];
      return getInterfaceIP(wifiInterface);
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Get Ethernet interface IP address
 * @returns Ethernet IP address or null
 */
export function getEthernetIP(): string | null {
  // TODO: Try common Ethernet interface names
  // TODO: Handle different naming conventions (eth0, enp0s3, etc.)
  
  const commonEthernetInterfaces = ['eth0', 'eth1', 'enp0s3', 'enp0s8', 'ens33'];
  
  for (const interfaceName of commonEthernetInterfaces) {
    const ip = getInterfaceIP(interfaceName);
    if (ip) {
      return ip;
    }
  }

  return null;
}

/**
 * Get hotspot interface IP address (typically the AP interface)
 * @returns Hotspot IP address or null
 */
export function getHotspotIP(): string | null {
  // TODO: Check for hotspot/AP interface
  // TODO: Look for bridge interfaces
  // TODO: Return configured hotspot IP
  
  // Common hotspot interface names
  const hotspotInterfaces = ['ap0', 'wlan0', 'br0'];
  
  for (const interfaceName of hotspotInterfaces) {
    const ip = getInterfaceIP(interfaceName);
    if (ip && ip.startsWith('192.168.4.')) {
      return ip;
    }
  }

  return null;
}

/**
 * Get default gateway IP address
 * @returns Gateway IP address or null
 */
export async function getDefaultGateway(): Promise<string | null> {
  // TODO: Use route command to get default gateway
  // TODO: Parse routing table output
  // TODO: Handle multiple gateways
  
  try {
    const result = await safeExec('ip route show default');
    if (result.success) {
      const match = result.stdout.match(/default via (\d+\.\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    }
  } catch {
    // Try alternative command
    try {
      const result = await safeExec('route -n | grep "^0.0.0.0"');
      if (result.success) {
        const parts = result.stdout.split(/\s+/);
        return parts[1] || null;
      }
    } catch {
      // Ignore errors
    }
  }

  return null;
}

/**
 * Get DNS server addresses
 * @returns Array of DNS server IPs
 */
export async function getDNSServers(): Promise<string[]> {
  // TODO: Read DNS servers from /etc/resolv.conf
  // TODO: Handle systemd-resolved
  // TODO: Parse DNS configuration
  
  try {
    const result = await safeExec('cat /etc/resolv.conf | grep nameserver | awk \'{print $2}\'');
    if (result.success && result.stdout) {
      return result.stdout.split('\n').filter(ip => ip.trim().length > 0);
    }
  } catch {
    // Ignore errors
  }

  return [];
}

/**
 * Get public IP address using external service
 * @returns Public IP address or null
 */
export async function getPublicIP(): Promise<string | null> {
  // TODO: Query external IP service
  // TODO: Handle network errors gracefully
  // TODO: Use multiple services as fallback
  // TODO: Cache result to avoid excessive requests
  
  const services = [
    'curl -s https://ipv4.icanhazip.com',
    'curl -s https://api.ipify.org',
    'curl -s https://checkip.amazonaws.com',
  ];

  for (const service of services) {
    try {
      const result = await safeExec(service, { timeout: 5000 });
      if (result.success && result.stdout) {
        const ip = result.stdout.trim();
        // Validate IP format
        if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
          return ip;
        }
      }
    } catch {
      // Try next service
    }
  }

  return null;
}

/**
 * Check if an IP address is in a private range
 * @param ip - IP address to check
 * @returns True if IP is private
 */
export function isPrivateIP(ip: string): boolean {
  // TODO: Check against private IP ranges
  // TODO: Handle IPv6 private ranges
  
  const privateRanges = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^127\./,                   // 127.0.0.0/8 (loopback)
    /^169\.254\./,              // 169.254.0.0/16 (link-local)
  ];

  return privateRanges.some(range => range.test(ip));
}

/**
 * Get comprehensive network status
 * @returns Complete network status information
 */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  // TODO: Gather all network information
  // TODO: Determine active connections
  // TODO: Include connectivity status
  
  const [defaultGateway, dnsServers, publicIP] = await Promise.all([
    getDefaultGateway(),
    getDNSServers(),
    getPublicIP(),
  ]);

  return {
    interfaces: getAllInterfaces(),
    defaultGateway,
    dnsServers,
    publicIP,
  };
}

/**
 * Test connectivity to a host
 * @param host - Hostname or IP address to test
 * @param timeout - Timeout in milliseconds
 * @returns True if host is reachable
 */
export async function testConnectivity(host: string, timeout: number = 5000): Promise<boolean> {
  // TODO: Use ping command to test connectivity
  // TODO: Handle different ping implementations
  // TODO: Parse ping results
  
  try {
    const result = await safeExec(`ping -c 1 -W ${Math.floor(timeout / 1000)} ${host}`, { timeout });
    return result.success && result.stdout.includes('1 received');
  } catch {
    return false;
  }
}