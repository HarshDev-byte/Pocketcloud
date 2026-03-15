// Mock fs module for compatibility
const readFileSync = (path: string, encoding?: string) => {
  // Mock implementation - return empty string or mock data
  if (path.includes('thermal_zone0/temp')) return '45000';
  if (path.includes('/proc/stat')) return 'cpu  1000 2000 3000 4000 5000 6000 7000 8000 9000 10000';
  if (path.includes('/proc/meminfo')) return 'MemTotal: 4000000 kB\nMemFree: 2000000 kB\nBuffers: 100000 kB\nCached: 500000 kB';
  if (path.includes('/proc/diskstats')) return '8 0 sda 1000 0 8000 2000 500 0 4000 1000 0 2000 3000';
  if (path.includes('/proc/net/dev')) return 'wlan0: 1000000 1000 0 0 0 0 0 0 500000 500 0 0 0 0 0 0';
  if (path.includes('/proc/uptime')) return '12345.67 98765.43';
  return '';
};

const existsSync = (path: string) => true;

// Mock child_process module for compatibility
const execSync = (command: string, options?: any) => {
  // Mock implementation - return mock data based on command
  if (command.includes('df -B1')) {
    return 'Filesystem 1B-blocks Used Available Use% Mounted on\n/dev/sda1 1000000000 500000000 500000000 50% /mnt/pocketcloud';
  }
  return '';
};

export interface SystemStats {
  cpu: {
    usage: number; // percentage
    temperature: number; // celsius
  };
  memory: {
    total: number; // bytes
    used: number; // bytes
    free: number; // bytes
    usage: number; // percentage
  };
  disk: {
    read: number; // bytes per second
    write: number; // bytes per second
  };
  network: {
    bytesIn: number; // bytes per second
    bytesOut: number; // bytes per second
  };
  uptime: number; // seconds
  storage: {
    total: number; // bytes
    used: number; // bytes
    free: number; // bytes
    usage: number; // percentage
  };
}

export class SystemService {
  private static lastCpuStats: { idle: number; total: number } | null = null;
  private static lastDiskStats: { read: number; write: number; timestamp: number } | null = null;
  private static lastNetworkStats: { bytesIn: number; bytesOut: number; timestamp: number } | null = null;

  /**
   * Get comprehensive system statistics
   */
  public static async getSystemStats(): Promise<SystemStats> {
    const [cpu, memory, disk, network, uptime, storage] = await Promise.all([
      this.getCpuStats(),
      this.getMemoryInfo(),
      this.getDiskIO(),
      this.getNetworkStats(),
      this.getUptime(),
      this.getStorageInfo()
    ]);

    return {
      cpu,
      memory,
      disk,
      network,
      uptime,
      storage
    };
  }

  /**
   * Get CPU temperature from thermal zone
   */
  public static getCpuTemp(): number {
    try {
      const tempPath = '/sys/class/thermal/thermal_zone0/temp';
      if (existsSync(tempPath)) {
        const tempStr = readFileSync(tempPath, 'utf8').trim();
        return parseInt(tempStr) / 1000; // Convert millicelsius to celsius
      }
      return 0;
    } catch (error) {
      console.error('Failed to read CPU temperature:', error);
      return 0;
    }
  }

  /**
   * Get CPU usage percentage
   */
  public static async getCpuUsage(): Promise<number> {
    try {
      const statContent = readFileSync('/proc/stat', 'utf8');
      const cpuLine = statContent.split('\n')[0];
      const cpuTimes = cpuLine.split(/\s+/).slice(1).map(Number);
      
      const idle = cpuTimes[3] + cpuTimes[4]; // idle + iowait
      const total = cpuTimes.reduce((sum, time) => sum + time, 0);

      if (this.lastCpuStats) {
        const idleDiff = idle - this.lastCpuStats.idle;
        const totalDiff = total - this.lastCpuStats.total;
        const usage = totalDiff > 0 ? ((totalDiff - idleDiff) / totalDiff) * 100 : 0;
        
        this.lastCpuStats = { idle, total };
        return Math.max(0, Math.min(100, usage));
      }

      this.lastCpuStats = { idle, total };
      
      // Wait 100ms and calculate again for first measurement
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.getCpuUsage();

    } catch (error) {
      console.error('Failed to read CPU usage:', error);
      return 0;
    }
  }

  /**
   * Get CPU stats (usage + temperature)
   */
  private static async getCpuStats(): Promise<{ usage: number; temperature: number }> {
    const [usage, temperature] = await Promise.all([
      this.getCpuUsage(),
      Promise.resolve(this.getCpuTemp())
    ]);

    return { usage, temperature };
  }

  /**
   * Get memory information
   */
  public static getMemoryInfo(): { total: number; used: number; free: number; usage: number } {
    try {
      const memInfo = readFileSync('/proc/meminfo', 'utf8');
      const lines = memInfo.split('\n');
      
      const getValue = (key: string): number => {
        const line = lines.find(l => l.startsWith(key));
        if (line) {
          const match = line.match(/(\d+)/);
          return match ? parseInt(match[1]) * 1024 : 0; // Convert KB to bytes
        }
        return 0;
      };

      const total = getValue('MemTotal:');
      const free = getValue('MemFree:');
      const buffers = getValue('Buffers:');
      const cached = getValue('Cached:');
      const available = free + buffers + cached;
      const used = total - available;
      const usage = total > 0 ? (used / total) * 100 : 0;

      return { total, used, free: available, usage };

    } catch (error) {
      console.error('Failed to read memory info:', error);
      return { total: 0, used: 0, free: 0, usage: 0 };
    }
  }

  /**
   * Get disk I/O statistics
   */
  public static getDiskIO(): { read: number; write: number } {
    try {
      const diskStats = readFileSync('/proc/diskstats', 'utf8');
      const lines = diskStats.split('\n');
      
      // Look for sda (USB drive) or mmcblk0 (SD card)
      const diskLine = lines.find(line => 
        line.includes(' sda ') || line.includes(' mmcblk0 ')
      );

      if (!diskLine) {
        return { read: 0, write: 0 };
      }

      const fields = diskLine.trim().split(/\s+/);
      const readSectors = parseInt(fields[5]) || 0;
      const writeSectors = parseInt(fields[9]) || 0;
      const timestamp = Date.now();

      // Convert sectors to bytes (assuming 512 bytes per sector)
      const readBytes = readSectors * 512;
      const writeBytes = writeSectors * 512;

      if (this.lastDiskStats) {
        const timeDiff = (timestamp - this.lastDiskStats.timestamp) / 1000; // seconds
        const readDiff = readBytes - this.lastDiskStats.read;
        const writeDiff = writeBytes - this.lastDiskStats.write;

        const readRate = timeDiff > 0 ? readDiff / timeDiff : 0;
        const writeRate = timeDiff > 0 ? writeDiff / timeDiff : 0;

        this.lastDiskStats = { read: readBytes, write: writeBytes, timestamp };
        return { read: Math.max(0, readRate), write: Math.max(0, writeRate) };
      }

      this.lastDiskStats = { read: readBytes, write: writeBytes, timestamp };
      return { read: 0, write: 0 };

    } catch (error) {
      console.error('Failed to read disk stats:', error);
      return { read: 0, write: 0 };
    }
  }

  /**
   * Get network statistics for wlan0
   */
  public static getNetworkStats(): { bytesIn: number; bytesOut: number } {
    try {
      const netDev = readFileSync('/proc/net/dev', 'utf8');
      const lines = netDev.split('\n');
      
      const wlanLine = lines.find(line => line.includes('wlan0:'));
      if (!wlanLine) {
        return { bytesIn: 0, bytesOut: 0 };
      }

      const fields = wlanLine.split(':')[1].trim().split(/\s+/);
      const bytesIn = parseInt(fields[0]) || 0;
      const bytesOut = parseInt(fields[8]) || 0;
      const timestamp = Date.now();

      if (this.lastNetworkStats) {
        const timeDiff = (timestamp - this.lastNetworkStats.timestamp) / 1000; // seconds
        const inDiff = bytesIn - this.lastNetworkStats.bytesIn;
        const outDiff = bytesOut - this.lastNetworkStats.bytesOut;

        const inRate = timeDiff > 0 ? inDiff / timeDiff : 0;
        const outRate = timeDiff > 0 ? outDiff / timeDiff : 0;

        this.lastNetworkStats = { bytesIn, bytesOut, timestamp };
        return { bytesIn: Math.max(0, inRate), bytesOut: Math.max(0, outRate) };
      }

      this.lastNetworkStats = { bytesIn, bytesOut, timestamp };
      return { bytesIn: 0, bytesOut: 0 };

    } catch (error) {
      console.error('Failed to read network stats:', error);
      return { bytesIn: 0, bytesOut: 0 };
    }
  }

  /**
   * Get system uptime in seconds
   */
  public static getUptime(): number {
    try {
      const uptime = readFileSync('/proc/uptime', 'utf8');
      const uptimeSeconds = parseFloat(uptime.split(' ')[0]);
      return uptimeSeconds;
    } catch (error) {
      console.error('Failed to read uptime:', error);
      return 0;
    }
  }

  /**
   * Get storage information for the mount point
   */
  public static getStorageInfo(): { total: number; used: number; free: number; usage: number } {
    try {
      const storagePath = '/mnt/pocketcloud';
      const output = execSync(`df -B1 "${storagePath}"`, { encoding: 'utf8' });
      const lines = output.trim().split('\n');
      const dataLine = lines[lines.length - 1];
      const fields = dataLine.split(/\s+/);

      const total = parseInt(fields[1]) || 0;
      const used = parseInt(fields[2]) || 0;
      const free = parseInt(fields[3]) || 0;
      const usage = total > 0 ? (used / total) * 100 : 0;

      return { total, used, free, usage };

    } catch (error) {
      console.error('Failed to get storage info:', error);
      return { total: 0, used: 0, free: 0, usage: 0 };
    }
  }

  /**
   * Format bytes to human readable string
   */
  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Format uptime to human readable string
   */
  public static formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Get temperature color based on value
   */
  public static getTempColor(temp: number): string {
    if (temp < 60) return 'text-green-500';
    if (temp < 75) return 'text-amber-500';
    return 'text-red-500';
  }
}