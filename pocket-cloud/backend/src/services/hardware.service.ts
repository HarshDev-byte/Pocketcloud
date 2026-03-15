import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import { thermalService } from './thermal.service.js';

export interface HardwareStats {
  cpuTemp: number;
  cpuUsage: number;
  memInfo: {
    total: number;
    available: number;
    used: number;
    buffers: number;
    cached: number;
    free: number;
  };
  diskUsage: {
    total: number;
    used: number;
    available: number;
  };
  diskIO: {
    readSectors: number;
    writeSectors: number;
    readSpeed: number;  // sectors/sec
    writeSpeed: number; // sectors/sec
  };
  networkIO: {
    rxBytes: number;
    txBytes: number;
    rxSpeed: number;  // bytes/sec
    txSpeed: number;  // bytes/sec
  };
  loadAvg: number[];
  uptime: number;
  wifiClients: Array<{
    ip: string;
    mac: string;
    hostname?: string;
  }>;
  timestamp: number;
}

export interface ThermalStatus {
  temperature: number;
  isThrottling: boolean;
  isPaused: boolean;
  warningLevel: 'normal' | 'warning' | 'critical';
}

/**
 * Hardware monitoring service optimized for Raspberry Pi 4B
 * Reads system metrics and provides real-time monitoring
 */
export class HardwareService extends EventEmitter {
  private static instance: HardwareService;
  private intervalId: NodeJS.Timeout | null = null;
  private statsHistory: HardwareStats[] = [];
  private maxHistorySize = 60; // 5 minutes at 5-second intervals
  
  // Previous values for delta calculations
  private prevCpuStats: { idle: number; total: number } | null = null;
  private prevDiskStats: { readSectors: number; writeSectors: number } | null = null;
  private prevNetworkStats: { rxBytes: number; txBytes: number } | null = null;
  private prevTimestamp = 0;
  
  // Thermal protection
  private thermalStatus: ThermalStatus = {
    temperature: 0,
    isThrottling: false,
    isPaused: false,
    warningLevel: 'normal'
  };

  private constructor() {
    super();
  }

  public static getInstance(): HardwareService {
    if (!HardwareService.instance) {
      HardwareService.instance = new HardwareService();
    }
    return HardwareService.instance;
  }

  /**
   * Start monitoring hardware metrics
   */
  public startMonitoring(): void {
    if (this.intervalId) {
      return; // Already monitoring
    }

    // Start thermal monitoring service
    thermalService.start().catch(error => {
      console.error('Failed to start thermal monitoring:', error);
    });

    // Initial reading
    this.collectStats();

    // Start periodic collection every 5 seconds
    this.intervalId = setInterval(() => {
      this.collectStats();
    }, 5000);

    console.log('Hardware monitoring started');
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Hardware monitoring stopped');
    }

    // Stop thermal monitoring service
    thermalService.stop().catch(error => {
      console.error('Failed to stop thermal monitoring:', error);
    });
  }

  /**
   * Get current hardware stats
   */
  public getCurrentStats(): HardwareStats | null {
    return this.statsHistory.length > 0 ? this.statsHistory[this.statsHistory.length - 1] : null;
  }

  /**
   * Get stats history (last 5 minutes)
   */
  public getStatsHistory(): HardwareStats[] {
    return [...this.statsHistory];
  }

  /**
   * Get thermal status
   */
  public getThermalStatus(): ThermalStatus {
    return { ...this.thermalStatus };
  }

  /**
   * Collect all hardware statistics
   */
  private collectStats(): void {
    try {
      const timestamp = Date.now();
      const timeDelta = this.prevTimestamp > 0 ? (timestamp - this.prevTimestamp) / 1000 : 1;

      const stats: HardwareStats = {
        cpuTemp: this.readCpuTemperature(),
        cpuUsage: this.readCpuUsage(),
        memInfo: this.readMemoryInfo(),
        diskUsage: this.readDiskUsage(),
        diskIO: this.readDiskIO(timeDelta),
        networkIO: this.readNetworkIO(timeDelta),
        loadAvg: this.readLoadAverage(),
        uptime: this.readUptime(),
        wifiClients: this.readWifiClients(),
        timestamp
      };

      // Add to history
      this.statsHistory.push(stats);
      if (this.statsHistory.length > this.maxHistorySize) {
        this.statsHistory.shift();
      }

      // Update thermal status
      this.updateThermalStatus(stats.cpuTemp);

      // Emit stats to WebSocket clients
      this.emit('stats', stats);

      this.prevTimestamp = timestamp;

    } catch (error) {
      console.error('Error collecting hardware stats:', error);
    }
  }

  /**
   * Read CPU temperature from thermal zone
   */
  private readCpuTemperature(): number {
    try {
      const tempPath = '/sys/class/thermal/thermal_zone0/temp';
      if (existsSync(tempPath)) {
        const tempStr = readFileSync(tempPath, 'utf8').trim();
        return parseInt(tempStr) / 1000; // Convert millidegrees to degrees
      }
    } catch (error) {
      console.warn('Cannot read CPU temperature:', error);
    }
    return 0;
  }

  /**
   * Calculate CPU usage from /proc/stat
   */
  private readCpuUsage(): number {
    try {
      const statData = readFileSync('/proc/stat', 'utf8');
      const cpuLine = statData.split('\n')[0];
      const values = cpuLine.split(/\s+/).slice(1).map(Number);
      
      // CPU times: user, nice, system, idle, iowait, irq, softirq, steal
      const idle = values[3] + values[4]; // idle + iowait
      const total = values.reduce((sum, val) => sum + val, 0);

      if (this.prevCpuStats) {
        const idleDelta = idle - this.prevCpuStats.idle;
        const totalDelta = total - this.prevCpuStats.total;
        
        if (totalDelta > 0) {
          const usage = ((totalDelta - idleDelta) / totalDelta) * 100;
          this.prevCpuStats = { idle, total };
          return Math.round(usage * 100) / 100; // Round to 2 decimal places
        }
      }

      this.prevCpuStats = { idle, total };
      return 0;
    } catch (error) {
      console.warn('Cannot read CPU usage:', error);
      return 0;
    }
  }

  /**
   * Read memory information from /proc/meminfo
   */
  private readMemoryInfo(): HardwareStats['memInfo'] {
    try {
      const memData = readFileSync('/proc/meminfo', 'utf8');
      const lines = memData.split('\n');
      
      const getValue = (key: string): number => {
        const line = lines.find(l => l.startsWith(key));
        if (line) {
          const match = line.match(/(\d+)/);
          return match ? parseInt(match[1]) * 1024 : 0; // Convert KB to bytes
        }
        return 0;
      };

      const total = getValue('MemTotal:');
      const available = getValue('MemAvailable:');
      const buffers = getValue('Buffers:');
      const cached = getValue('Cached:');
      const free = getValue('MemFree:');
      const used = total - available;

      return { total, available, used, buffers, cached, free };
    } catch (error) {
      console.warn('Cannot read memory info:', error);
      return { total: 0, available: 0, used: 0, buffers: 0, cached: 0, free: 0 };
    }
  }

  /**
   * Read disk usage for storage mount point
   */
  private readDiskUsage(): HardwareStats['diskUsage'] {
    try {
      const storagePath = process.env.STORAGE_PATH || '/mnt/pocketcloud';
      const output = execSync(`df -B1 "${storagePath}"`, { encoding: 'utf8' });
      const lines = output.trim().split('\n');
      
      if (lines.length >= 2) {
        const values = lines[1].split(/\s+/);
        const total = parseInt(values[1]);
        const used = parseInt(values[2]);
        const available = parseInt(values[3]);
        
        return { total, used, available };
      }
    } catch (error) {
      console.warn('Cannot read disk usage:', error);
    }
    
    return { total: 0, used: 0, available: 0 };
  }

  /**
   * Read disk I/O statistics from /proc/diskstats
   */
  private readDiskIO(timeDelta: number): HardwareStats['diskIO'] {
    try {
      const diskData = readFileSync('/proc/diskstats', 'utf8');
      const lines = diskData.split('\n');
      
      // Find the main disk (usually sda, mmcblk0, or nvme0n1)
      const diskLine = lines.find(line => 
        line.includes(' sda ') || 
        line.includes(' mmcblk0 ') || 
        line.includes(' nvme0n1 ')
      );
      
      if (diskLine) {
        const values = diskLine.trim().split(/\s+/);
        const readSectors = parseInt(values[5]);  // sectors read
        const writeSectors = parseInt(values[9]); // sectors written
        
        let readSpeed = 0;
        let writeSpeed = 0;
        
        if (this.prevDiskStats && timeDelta > 0) {
          readSpeed = (readSectors - this.prevDiskStats.readSectors) / timeDelta;
          writeSpeed = (writeSectors - this.prevDiskStats.writeSectors) / timeDelta;
        }
        
        this.prevDiskStats = { readSectors, writeSectors };
        
        return {
          readSectors,
          writeSectors,
          readSpeed: Math.max(0, readSpeed),
          writeSpeed: Math.max(0, writeSpeed)
        };
      }
    } catch (error) {
      console.warn('Cannot read disk I/O:', error);
    }
    
    return { readSectors: 0, writeSectors: 0, readSpeed: 0, writeSpeed: 0 };
  }

  /**
   * Read network I/O statistics from /proc/net/dev
   */
  private readNetworkIO(timeDelta: number): HardwareStats['networkIO'] {
    try {
      const netData = readFileSync('/proc/net/dev', 'utf8');
      const lines = netData.split('\n');
      
      // Find wlan0 interface
      const wlanLine = lines.find(line => line.includes('wlan0:'));
      
      if (wlanLine) {
        const values = wlanLine.split(':')[1].trim().split(/\s+/);
        const rxBytes = parseInt(values[0]);  // received bytes
        const txBytes = parseInt(values[8]);  // transmitted bytes
        
        let rxSpeed = 0;
        let txSpeed = 0;
        
        if (this.prevNetworkStats && timeDelta > 0) {
          rxSpeed = (rxBytes - this.prevNetworkStats.rxBytes) / timeDelta;
          txSpeed = (txBytes - this.prevNetworkStats.txBytes) / timeDelta;
        }
        
        this.prevNetworkStats = { rxBytes, txBytes };
        
        return {
          rxBytes,
          txBytes,
          rxSpeed: Math.max(0, rxSpeed),
          txSpeed: Math.max(0, txSpeed)
        };
      }
    } catch (error) {
      console.warn('Cannot read network I/O:', error);
    }
    
    return { rxBytes: 0, txBytes: 0, rxSpeed: 0, txSpeed: 0 };
  }

  /**
   * Read load average from /proc/loadavg
   */
  private readLoadAverage(): number[] {
    try {
      const loadData = readFileSync('/proc/loadavg', 'utf8');
      const values = loadData.trim().split(' ');
      return [
        parseFloat(values[0]), // 1 minute
        parseFloat(values[1]), // 5 minutes
        parseFloat(values[2])  // 15 minutes
      ];
    } catch (error) {
      console.warn('Cannot read load average:', error);
      return [0, 0, 0];
    }
  }

  /**
   * Read system uptime from /proc/uptime
   */
  private readUptime(): number {
    try {
      const uptimeData = readFileSync('/proc/uptime', 'utf8');
      const uptime = parseFloat(uptimeData.split(' ')[0]);
      return uptime;
    } catch (error) {
      console.warn('Cannot read uptime:', error);
      return 0;
    }
  }

  /**
   * Read connected WiFi clients from ARP table
   */
  private readWifiClients(): Array<{ ip: string; mac: string; hostname?: string }> {
    try {
      const arpData = readFileSync('/proc/net/arp', 'utf8');
      const lines = arpData.split('\n').slice(1); // Skip header
      const clients: Array<{ ip: string; mac: string; hostname?: string }> = [];
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const ip = parts[0];
          const mac = parts[3];
          
          // Only include 192.168.4.x addresses (our AP network)
          if (ip.startsWith('192.168.4.') && mac !== '00:00:00:00:00:00') {
            let hostname: string | undefined;
            
            // Try to resolve hostname
            try {
              const hostOutput = execSync(`getent hosts ${ip}`, { 
                encoding: 'utf8', 
                timeout: 1000 
              });
              const hostParts = hostOutput.trim().split(/\s+/);
              if (hostParts.length >= 2) {
                hostname = hostParts[1];
              }
            } catch {
              // Hostname resolution failed, that's OK
            }
            
            clients.push({ ip, mac, hostname });
          }
        }
      }
      
      return clients;
    } catch (error) {
      console.warn('Cannot read WiFi clients:', error);
      return [];
    }
  }

  /**
   * Update thermal status and emit warnings
   */
  private updateThermalStatus(temperature: number): void {
    const prevStatus = { ...this.thermalStatus };
    
    this.thermalStatus.temperature = temperature;
    
    // Determine warning level
    if (temperature >= 85) {
      this.thermalStatus.warningLevel = 'critical';
      this.thermalStatus.isPaused = true;
    } else if (temperature >= 80) {
      this.thermalStatus.warningLevel = 'warning';
      this.thermalStatus.isThrottling = true;
      this.thermalStatus.isPaused = false;
    } else if (temperature >= 70) {
      this.thermalStatus.warningLevel = 'warning';
      this.thermalStatus.isThrottling = false;
      this.thermalStatus.isPaused = false;
    } else {
      this.thermalStatus.warningLevel = 'normal';
      this.thermalStatus.isThrottling = false;
      this.thermalStatus.isPaused = false;
    }
    
    // Emit thermal warnings if status changed
    if (prevStatus.warningLevel !== this.thermalStatus.warningLevel) {
      if (this.thermalStatus.warningLevel === 'critical') {
        console.warn(`CRITICAL: CPU temperature ${temperature}°C - pausing media processing`);
        this.emit('thermal-critical', this.thermalStatus);
      } else if (this.thermalStatus.warningLevel === 'warning') {
        console.warn(`WARNING: CPU temperature ${temperature}°C - throttling enabled`);
        this.emit('thermal-warning', this.thermalStatus);
      } else if (prevStatus.warningLevel !== 'normal') {
        console.log(`INFO: CPU temperature normalized ${temperature}°C`);
        this.emit('thermal-normal', this.thermalStatus);
      }
    }
  }

  /**
   * Check if media processing should be paused due to thermal conditions
   */
  public shouldPauseMediaProcessing(): boolean {
    return this.thermalStatus.isPaused;
  }

  /**
   * Check if upload processing should be throttled
   */
  public shouldThrottleUploads(): boolean {
    return this.thermalStatus.isThrottling;
  }
}

// Export singleton instance
export const hardwareService = HardwareService.getInstance();