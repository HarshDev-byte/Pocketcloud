/**
 * Network Service Integration Tests
 * Tests network functionality with both real Pi hardware and mocked commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetworkService } from '../services/network.service';
import * as shellUtils from '../utils/shell.utils';

// Mock shell utilities for development environment
const mockShellUtils = vi.mocked(shellUtils);

describe('NetworkService', () => {
  let networkService: NetworkService;
  const isRealPi = process.env.NODE_ENV === 'test-pi';

  beforeEach(() => {
    networkService = new NetworkService();
    
    if (!isRealPi) {
      // Setup mocks for development environment
      vi.clearAllMocks();
    }
  });

  afterEach(() => {
    if (!isRealPi) {
      vi.restoreAllMocks();
    }
  });

  describe('getNetworkStatus', () => {
    it('returns hotspot info when in hotspot mode', async () => {
      if (!isRealPi) {
        // Mock hotspot mode response
        mockShellUtils.executeCommand.mockImplementation((cmd: string) => {
          if (cmd.includes('ip addr show wlan0')) {
            return Promise.resolve({
              stdout: 'inet 192.168.4.1/24 brd 192.168.4.255 scope global wlan0',
              stderr: '',
              exitCode: 0
            });
          }
          if (cmd.includes('pgrep hostapd')) {
            return Promise.resolve({
              stdout: '1234',
              stderr: '',
              exitCode: 0
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        });
      }

      const status = await networkService.getNetworkStatus();

      expect(status).toMatchObject({
        mode: 'hotspot',
        wlan0: {
          ip: '192.168.4.1',
          interface: 'wlan0'
        }
      });
      
      expect(status.accessUrls).toContain('http://192.168.4.1');
      expect(status.accessUrls).toContain('http://pocketcloud.local');
    });

    it('returns all IPs when multiple interfaces have IPs', async () => {
      if (!isRealPi) {
        mockShellUtils.executeCommand.mockImplementation((cmd: string) => {
          if (cmd.includes('ip addr')) {
            return Promise.resolve({
              stdout: `
                inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0
                inet 192.168.4.1/24 brd 192.168.4.255 scope global wlan0
              `,
              stderr: '',
              exitCode: 0
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        });
      }

      const status = await networkService.getNetworkStatus();

      expect(status.eth0?.ip).toBe('192.168.1.100');
      expect(status.wlan0?.ip).toBe('192.168.4.1');
      expect(status.accessUrls).toContain('http://192.168.1.100');
      expect(status.accessUrls).toContain('http://192.168.4.1');
    });

    it('includes mDNS hostname in accessUrls', async () => {
      const status = await networkService.getNetworkStatus();
      
      expect(status.accessUrls).toContain('http://pocketcloud.local');
    });
  });

  describe('scanWifiNetworks', () => {
    it('returns array of networks with required fields', async () => {
      if (!isRealPi) {
        mockShellUtils.executeCommand.mockResolvedValue({
          stdout: `
            Cell 01 - Address: AA:BB:CC:DD:EE:FF
                      ESSID:"TestNetwork1"
                      Quality=70/70  Signal level=-30 dBm
                      Encryption key:on
            Cell 02 - Address: 11:22:33:44:55:66
                      ESSID:"TestNetwork2"
                      Quality=50/70  Signal level=-50 dBm
                      Encryption key:off
          `,
          stderr: '',
          exitCode: 0
        });
      }

      const networks = await networkService.scanWifiNetworks();

      expect(Array.isArray(networks)).toBe(true);
      
      if (networks.length > 0) {
        const network = networks[0];
        expect(network).toHaveProperty('ssid');
        expect(network).toHaveProperty('signal');
        expect(network).toHaveProperty('security');
        expect(network).toHaveProperty('bssid');
        
        expect(typeof network.ssid).toBe('string');
        expect(typeof network.signal).toBe('number');
        expect(typeof network.security).toBe('string');
      }
    });

    it('deduplicates networks by SSID', async () => {
      if (!isRealPi) {
        mockShellUtils.executeCommand.mockResolvedValue({
          stdout: `
            Cell 01 - Address: AA:BB:CC:DD:EE:FF
                      ESSID:"DuplicateNetwork"
                      Quality=70/70  Signal level=-30 dBm
            Cell 02 - Address: 11:22:33:44:55:66
                      ESSID:"DuplicateNetwork"
                      Quality=50/70  Signal level=-50 dBm
          `,
          stderr: '',
          exitCode: 0
        });
      }

      const networks = await networkService.scanWifiNetworks();
      const ssids = networks.map(n => n.ssid);
      const uniqueSSIDs = [...new Set(ssids)];
      
      expect(ssids.length).toBe(uniqueSSIDs.length);
    });

    it('sorts by signal strength descending', async () => {
      if (!isRealPi) {
        mockShellUtils.executeCommand.mockResolvedValue({
          stdout: `
            Cell 01 - Address: AA:BB:CC:DD:EE:FF
                      ESSID:"WeakNetwork"
                      Quality=30/70  Signal level=-70 dBm
            Cell 02 - Address: 11:22:33:44:55:66
                      ESSID:"StrongNetwork"
                      Quality=70/70  Signal level=-30 dBm
          `,
          stderr: '',
          exitCode: 0
        });
      }

      const networks = await networkService.scanWifiNetworks();
      
      if (networks.length >= 2) {
        expect(networks[0].signal).toBeGreaterThanOrEqual(networks[1].signal);
      }
    });

    it('filters out own hotspot SSID', async () => {
      if (!isRealPi) {
        mockShellUtils.executeCommand.mockResolvedValue({
          stdout: `
            Cell 01 - Address: AA:BB:CC:DD:EE:FF
                      ESSID:"PocketCloud-1234"
                      Quality=70/70  Signal level=-30 dBm
            Cell 02 - Address: 11:22:33:44:55:66
                      ESSID:"OtherNetwork"
                      Quality=50/70  Signal level=-50 dBm
          `,
          stderr: '',
          exitCode: 0
        });
      }

      const networks = await networkService.scanWifiNetworks();
      const pocketCloudNetworks = networks.filter(n => n.ssid.startsWith('PocketCloud'));
      
      expect(pocketCloudNetworks.length).toBe(0);
    });

    it('times out after 15 seconds', async () => {
      if (!isRealPi) {
        mockShellUtils.executeCommand.mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({
            stdout: '',
            stderr: 'Timeout',
            exitCode: 1
          }), 16000))
        );
      }

      const startTime = Date.now();
      
      try {
        await networkService.scanWifiNetworks();
      } catch (error) {
        // Expected to timeout or return empty array
      }
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(16000); // Should timeout before 16s
    }, 20000);
  });

  describe('connectToWifi', () => {
    it('returns success with IP when credentials correct', async () => {
      if (!isRealPi) {
        mockShellUtils.executeCommand.mockImplementation((cmd: string) => {
          if (cmd.includes('wpa_supplicant')) {
            return Promise.resolve({ stdout: 'OK', stderr: '', exitCode: 0 });
          }
          if (cmd.includes('dhclient')) {
            return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
          }
          if (cmd.includes('ip addr show wlan0')) {
            return Promise.resolve({
              stdout: 'inet 192.168.1.100/24 brd 192.168.1.255 scope global wlan0',
              stderr: '',
              exitCode: 0
            });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        });
      }

      const result = await networkService.connectToWifi('TestNetwork', 'validpassword');

      expect(result.success).toBe(true);
      expect(result.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    });

    it('falls back to hotspot on wrong password', async () => {
      if (!isRealPi) {
        mockShellUtils.executeCommand.mockImplementation((cmd: string) => {
          if (cmd.includes('wpa_supplicant')) {
            return Promise.resolve({ stdout: '', stderr: 'Authentication failed', exitCode: 1 });
          }
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        });
      }

      const result = await networkService.connectToWifi('TestNetwork', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
      
      // Should automatically return to hotspot mode
      const status = await networkService.getNetworkStatus();
      expect(status.mode).toBe('hotspot');
    });

    it('sanitizes SSID to prevent shell injection', async () => {
      const maliciousSSID = 'Test; rm -rf /';
      
      if (!isRealPi) {
        mockShellUtils.executeCommand.mockImplementation((cmd: string) => {
          // Verify the command doesn't contain the malicious part
          expect(cmd).not.toContain('rm -rf');
          return Promise.resolve({ stdout: '', stderr: 'Invalid SSID', exitCode: 1 });
        });
      }

      const result = await networkService.connectToWifi(maliciousSSID, 'password');
      expect(result.success).toBe(false);
    });

    it('never logs passwords', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const consoleErrorSpy = vi.spyOn(console, 'error');
      
      try {
        await networkService.connectToWifi('TestNetwork', 'secretpassword');
      } catch (error) {
        // Ignore connection errors
      }

      const allLogs = [
        ...consoleSpy.mock.calls.flat(),
        ...consoleErrorSpy.mock.calls.flat()
      ].join(' ');

      expect(allLogs).not.toContain('secretpassword');
      
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('sanitizeForShell', () => {
    it('allows alphanumeric and safe chars', () => {
      const safe = 'TestNetwork123_-';
      const result = networkService.sanitizeForShell(safe);
      expect(result).toBe(safe);
    });

    it('rejects semicolons', () => {
      const malicious = 'Test;Network';
      expect(() => networkService.sanitizeForShell(malicious))
        .toThrow('Invalid characters in input');
    });

    it('rejects backticks', () => {
      const malicious = 'Test`Network';
      expect(() => networkService.sanitizeForShell(malicious))
        .toThrow('Invalid characters in input');
    });

    it('rejects $() substitutions', () => {
      const malicious = 'Test$(rm -rf /)Network';
      expect(() => networkService.sanitizeForShell(malicious))
        .toThrow('Invalid characters in input');
    });

    it('rejects newlines', () => {
      const malicious = 'Test\nNetwork';
      expect(() => networkService.sanitizeForShell(malicious))
        .toThrow('Invalid characters in input');
    });
  });
});

// Helper function to detect if running on actual Pi hardware
function isRunningOnPi(): boolean {
  try {
    const fs = require('fs');
    const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    return cpuInfo.includes('Raspberry Pi');
  } catch {
    return false;
  }
}