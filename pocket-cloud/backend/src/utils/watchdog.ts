import { writeFileSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';

export class WatchdogService {
  private static readonly HEARTBEAT_FILE = '/tmp/pocketcloud-heartbeat';
  private static readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private static readonly MAX_HEARTBEAT_AGE = 120000; // 2 minutes
  private static heartbeatTimer: NodeJS.Timeout | null = null;

  /**
   * Start the watchdog heartbeat
   */
  public static start(): void {
    console.log('Starting watchdog heartbeat service...');
    
    // Write initial heartbeat
    this.writeHeartbeat();
    
    // Set up interval to write heartbeat every 30 seconds
    this.heartbeatTimer = setInterval(() => {
      this.writeHeartbeat();
    }, this.HEARTBEAT_INTERVAL);

    console.log(`Watchdog heartbeat started (interval: ${this.HEARTBEAT_INTERVAL}ms)`);
  }

  /**
   * Stop the watchdog heartbeat
   */
  public static stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log('Watchdog heartbeat stopped');
    }
  }

  /**
   * Write heartbeat timestamp to file
   */
  private static writeHeartbeat(): void {
    try {
      const timestamp = Date.now();
      const heartbeatData = {
        timestamp,
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      };

      writeFileSync(this.HEARTBEAT_FILE, JSON.stringify(heartbeatData, null, 2));
    } catch (error) {
      console.error('Failed to write heartbeat:', error);
    }
  }

  /**
   * Check if heartbeat is recent (for monitoring scripts)
   */
  public static checkHeartbeat(): { isAlive: boolean; age?: number; error?: string } {
    try {
      if (!existsSync(this.HEARTBEAT_FILE)) {
        return { isAlive: false, error: 'Heartbeat file not found' };
      }

      const stats = statSync(this.HEARTBEAT_FILE);
      const age = Date.now() - stats.mtime.getTime();

      if (age > this.MAX_HEARTBEAT_AGE) {
        return { isAlive: false, age, error: 'Heartbeat is stale' };
      }

      return { isAlive: true, age };
    } catch (error) {
      return { 
        isAlive: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get detailed heartbeat information
   */
  public static getHeartbeatInfo(): any {
    try {
      if (!existsSync(this.HEARTBEAT_FILE)) {
        return null;
      }

      const content = require('fs').readFileSync(this.HEARTBEAT_FILE, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to read heartbeat info:', error);
      return null;
    }
  }

  /**
   * Create watchdog monitoring script
   */
  public static createMonitoringScript(): string {
    const script = `#!/bin/bash

# Pocket Cloud Watchdog Monitor
# This script should be run by cron every minute

HEARTBEAT_FILE="${this.HEARTBEAT_FILE}"
MAX_AGE_SECONDS=120
LOG_TAG="pocketcloud-watchdog"
SERVICE_NAME="pocketcloud-backend"

# Check if heartbeat file exists
if [ ! -f "$HEARTBEAT_FILE" ]; then
    echo "$(date): Heartbeat file missing - restarting service" | logger -t "$LOG_TAG"
    systemctl restart "$SERVICE_NAME"
    exit 1
fi

# Check heartbeat age
HEARTBEAT_AGE=$(( $(date +%s) - $(stat -c %Y "$HEARTBEAT_FILE" 2>/dev/null || echo 0) ))

if [ "$HEARTBEAT_AGE" -gt "$MAX_AGE_SECONDS" ]; then
    echo "$(date): Heartbeat stale (${HEARTBEAT_AGE}s) - restarting service" | logger -t "$LOG_TAG"
    systemctl restart "$SERVICE_NAME"
    exit 1
fi

# Optional: Check if process is actually running
if ! pgrep -f "pocket.*backend" > /dev/null; then
    echo "$(date): Backend process not found - restarting service" | logger -t "$LOG_TAG"
    systemctl restart "$SERVICE_NAME"
    exit 1
fi

# All checks passed
exit 0
`;

    return script;
  }

  /**
   * Install watchdog monitoring script
   */
  public static installMonitoringScript(): { success: boolean; error?: string } {
    try {
      const script = this.createMonitoringScript();
      const scriptPath = '/usr/local/bin/pocketcloud-watchdog-monitor';
      
      // Write script file
      writeFileSync(scriptPath, script);
      
      // Make executable
      execSync(`chmod +x "${scriptPath}"`);
      
      // Add to cron (run every minute)
      const cronEntry = `* * * * * root ${scriptPath} >/dev/null 2>&1`;
      const cronFile = '/etc/cron.d/pocketcloud-watchdog';
      
      writeFileSync(cronFile, cronEntry);
      
      console.log('Watchdog monitoring script installed');
      return { success: true };
      
    } catch (error) {
      console.error('Failed to install watchdog monitoring script:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get system health metrics
   */
  public static getSystemHealth(): {
    uptime: number;
    memoryUsage: { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number };
    cpuUsage: { user: number; system: number };
    loadAverage: number[];
    diskSpace?: { total: number; used: number; free: number };
  } {
    const health = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      loadAverage: require('os').loadavg()
    };

    // Try to get disk space info
    try {
      const storagePath = process.env.STORAGE_PATH || '/mnt/pocketcloud';
      const dfOutput = execSync(`df -B1 "${storagePath}"`, { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');
      const dataLine = lines[lines.length - 1];
      const columns = dataLine.split(/\s+/);
      
      (health as any).diskSpace = {
        total: parseInt(columns[1], 10),
        used: parseInt(columns[2], 10),
        free: parseInt(columns[3], 10)
      };
    } catch (error) {
      // Disk space info not available
    }

    return health;
  }

  /**
   * Handle graceful shutdown
   */
  public static handleShutdown(): void {
    console.log('Watchdog service shutting down...');
    this.stop();
    
    // Remove heartbeat file
    try {
      if (existsSync(this.HEARTBEAT_FILE)) {
        require('fs').unlinkSync(this.HEARTBEAT_FILE);
      }
    } catch (error) {
      console.error('Failed to remove heartbeat file:', error);
    }
  }
}