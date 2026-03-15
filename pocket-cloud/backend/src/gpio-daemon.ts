#!/usr/bin/env node

/**
 * PocketCloud GPIO Daemon
 * 
 * Standalone process that manages LED, OLED, and button hardware interfaces.
 * Runs independently of the main backend to ensure hardware feedback works
 * even if the main application crashes.
 */

import { EventEmitter } from 'events';
import { createConnection } from 'net';
import { readFileSync, existsSync } from 'fs';
import { ledService } from './services/led.service.js';
import { oledService } from './services/oled.service.js';
import { buttonService } from './services/button.service.js';

// Configuration
const CONFIG = {
  SOCKET_PATH: '/tmp/pocketcloud-gpio.sock',
  UPDATE_INTERVAL: 5000, // 5 seconds
  BACKEND_CHECK_INTERVAL: 10000, // 10 seconds
  BACKEND_PORT: 3000
};

interface SystemState {
  thermalZone: number;
  storageUsedPercent: number;
  activeTransfers: number;
  transferSpeed: number;
  connectedClients: number;
  hasErrors: boolean;
  isShuttingDown: boolean;
  isFirstBoot: boolean;
  hasUpdates: boolean;
  newUserConnected: boolean;
  cpuTemp: number;
  ramUsed: number;
  ramTotal: number;
  uptime: number;
  ipAddress: string;
  filesTransferredToday: number;
  storageUsed: number;
  storageTotal: number;
  wifiSSID?: string;
  wifiClients: number;
  activeUploads: number;
  activeDownloads: number;
  uploadSpeed: number;
  downloadSpeed: number;
}

class GPIODaemon extends EventEmitter {
  private isRunning = false;
  private updateTimer?: NodeJS.Timeout;
  private backendCheckTimer?: NodeJS.Timeout;
  private systemState: SystemState;
  private backendConnected = false;
  private lastUserConnectTime = 0;

  constructor() {
    super();
    
    // Initialize default system state
    this.systemState = {
      thermalZone: 1,
      storageUsedPercent: 0,
      activeTransfers: 0,
      transferSpeed: 0,
      connectedClients: 0,
      hasErrors: false,
      isShuttingDown: false,
      isFirstBoot: this.checkFirstBoot(),
      hasUpdates: false,
      newUserConnected: false,
      cpuTemp: 0,
      ramUsed: 0,
      ramTotal: 4096,
      uptime: 0,
      ipAddress: '192.168.4.1',
      filesTransferredToday: 0,
      storageUsed: 0,
      storageTotal: 1000,
      wifiClients: 0,
      activeUploads: 0,
      activeDownloads: 0,
      uploadSpeed: 0,
      downloadSpeed: 0
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    console.log('Starting PocketCloud GPIO Daemon...');
    
    try {
      // Initialize hardware services
      await this.initializeServices();
      
      // Start monitoring loops
      this.startUpdateLoop();
      this.startBackendMonitoring();
      
      // Setup signal handlers
      this.setupSignalHandlers();
      
      this.isRunning = true;
      console.log('GPIO Daemon started successfully');
      
    } catch (error) {
      console.error('Failed to start GPIO daemon:', error);
      process.exit(1);
    }
  }

  private async initializeServices(): Promise<void> {
    console.log('Initializing hardware services...');
    
    // Initialize LED service
    try {
      await ledService.initialize();
      console.log('✓ LED service initialized');
    } catch (error) {
      console.warn('⚠ LED service failed to initialize:', error);
    }
    
    // Initialize OLED service
    try {
      await oledService.initialize();
      console.log('✓ OLED service initialized');
    } catch (error) {
      console.warn('⚠ OLED service failed to initialize:', error);
    }
    
    // Initialize button service
    try {
      await buttonService.initialize();
      console.log('✓ Button service initialized');
      
      // Setup button event handlers
      this.setupButtonHandlers();
      
    } catch (error) {
      console.warn('⚠ Button service failed to initialize:', error);
    }
  }

  private setupButtonHandlers(): void {
    buttonService.on('buttonPress', (event) => {
      console.log(`Button press: GPIO ${event.pin}, type: ${event.pressType}`);
    });
    
    buttonService.on('shutdownInitiated', (event) => {
      console.log(`Shutdown initiated: ${event.type}, countdown: ${event.countdown}s`);
      this.systemState.isShuttingDown = true;
      this.updateHardwareStatus();
    });
    
    buttonService.on('shutdownCancelled', () => {
      console.log('Shutdown cancelled');
      this.systemState.isShuttingDown = false;
      this.updateHardwareStatus();
    });
  }
  private startUpdateLoop(): void {
    this.updateTimer = setInterval(() => {
      this.updateSystemState();
      this.updateHardwareStatus();
    }, CONFIG.UPDATE_INTERVAL);
    
    // Initial update
    this.updateSystemState();
    this.updateHardwareStatus();
  }

  private startBackendMonitoring(): void {
    this.backendCheckTimer = setInterval(() => {
      this.checkBackendConnection();
    }, CONFIG.BACKEND_CHECK_INTERVAL);
    
    // Initial check
    this.checkBackendConnection();
  }

  private async updateSystemState(): Promise<void> {
    try {
      // Update basic system info
      this.systemState.uptime = this.getUptime();
      this.systemState.cpuTemp = this.getCPUTemperature();
      this.systemState.ipAddress = this.getIPAddress();
      
      const memInfo = this.getMemoryInfo();
      this.systemState.ramUsed = memInfo.used;
      this.systemState.ramTotal = memInfo.total;
      
      const storageInfo = this.getStorageInfo();
      this.systemState.storageUsed = storageInfo.used;
      this.systemState.storageTotal = storageInfo.total;
      this.systemState.storageUsedPercent = (storageInfo.used / storageInfo.total) * 100;
      
      // Try to get more detailed info from backend if connected
      if (this.backendConnected) {
        await this.fetchBackendStatus();
      }
      
    } catch (error) {
      console.warn('Error updating system state:', error);
    }
  }

  private updateHardwareStatus(): void {
    try {
      // Update LED status based on system state
      const ledStatus = ledService.evaluateStatus(this.systemState);
      ledService.setStatus(ledStatus);
      
      // Update OLED display
      oledService.updateSystemInfo({
        ipAddress: this.systemState.ipAddress,
        connectedUsers: this.systemState.connectedClients,
        filesTransferredToday: this.systemState.filesTransferredToday,
        storageUsed: this.systemState.storageUsed,
        storageTotal: this.systemState.storageTotal,
        cpuTemp: this.systemState.cpuTemp,
        ramUsed: this.systemState.ramUsed,
        ramTotal: this.systemState.ramTotal,
        uptime: this.systemState.uptime,
        wifiSSID: this.systemState.wifiSSID,
        wifiClients: this.systemState.wifiClients,
        activeUploads: this.systemState.activeUploads,
        activeDownloads: this.systemState.activeDownloads,
        uploadSpeed: this.systemState.uploadSpeed,
        downloadSpeed: this.systemState.downloadSpeed
      });
      
    } catch (error) {
      console.warn('Error updating hardware status:', error);
    }
  }

  private async checkBackendConnection(): Promise<void> {
    try {
      // Simple HTTP check to backend
      const response = await fetch(`http://localhost:${CONFIG.BACKEND_PORT}/api/health`, {
        timeout: 5000
      });
      
      if (response.ok) {
        if (!this.backendConnected) {
          console.log('✓ Backend connection established');
          this.backendConnected = true;
          this.systemState.hasErrors = false;
        }
      } else {
        throw new Error(`Backend returned ${response.status}`);
      }
      
    } catch (error) {
      if (this.backendConnected) {
        console.warn('⚠ Backend connection lost:', error);
        this.backendConnected = false;
        this.systemState.hasErrors = true;
      }
    }
  }

  private async fetchBackendStatus(): Promise<void> {
    try {
      const response = await fetch(`http://localhost:${CONFIG.BACKEND_PORT}/api/system/status`, {
        timeout: 3000
      });
      
      if (response.ok) {
        const status = await response.json();
        
        // Update system state with backend data
        this.systemState.connectedClients = status.connectedClients || 0;
        this.systemState.activeTransfers = status.activeTransfers || 0;
        this.systemState.transferSpeed = status.transferSpeed || 0;
        this.systemState.thermalZone = status.thermalZone || 1;
        this.systemState.hasUpdates = status.hasUpdates || false;
        this.systemState.filesTransferredToday = status.filesTransferredToday || 0;
        this.systemState.activeUploads = status.activeUploads || 0;
        this.systemState.activeDownloads = status.activeDownloads || 0;
        this.systemState.uploadSpeed = status.uploadSpeed || 0;
        this.systemState.downloadSpeed = status.downloadSpeed || 0;
        
        // Check for new user connections
        if (status.connectedClients > this.systemState.connectedClients) {
          const now = Date.now();
          if (now - this.lastUserConnectTime > 30000) { // 30 second cooldown
            this.systemState.newUserConnected = true;
            this.lastUserConnectTime = now;
            
            // Reset flag after 5 seconds
            setTimeout(() => {
              this.systemState.newUserConnected = false;
            }, 5000);
          }
        }
      }
      
    } catch (error) {
      console.debug('Could not fetch backend status:', error);
    }
  }
  // System information gathering methods
  private getUptime(): number {
    try {
      const uptime = readFileSync('/proc/uptime', 'utf8');
      return parseFloat(uptime.split(' ')[0]);
    } catch {
      return 0;
    }
  }

  private getCPUTemperature(): number {
    try {
      const temp = readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
      return parseInt(temp.trim()) / 1000;
    } catch {
      return 0;
    }
  }

  private getIPAddress(): string {
    try {
      const { execSync } = require('child_process');
      const ip = execSync("hostname -I | awk '{print $1}'", { encoding: 'utf8' }).trim();
      return ip || '192.168.4.1';
    } catch {
      return '192.168.4.1';
    }
  }

  private getMemoryInfo(): { used: number; total: number } {
    try {
      const meminfo = readFileSync('/proc/meminfo', 'utf8');
      const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
      const availableMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
      
      if (totalMatch && availableMatch) {
        const total = parseInt(totalMatch[1]) / 1024; // Convert to MB
        const available = parseInt(availableMatch[1]) / 1024;
        const used = total - available;
        return { used, total };
      }
    } catch (error) {
      console.debug('Error reading memory info:', error);
    }
    
    return { used: 0, total: 4096 };
  }

  private getStorageInfo(): { used: number; total: number } {
    try {
      const { execSync } = require('child_process');
      const df = execSync('df /mnt/pocketcloud 2>/dev/null || df /', { encoding: 'utf8' });
      const lines = df.split('\n');
      
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        if (parts.length >= 4) {
          const total = parseInt(parts[1]) / 1024 / 1024; // Convert to GB
          const used = parseInt(parts[2]) / 1024 / 1024;
          return { used, total };
        }
      }
    } catch (error) {
      console.debug('Error reading storage info:', error);
    }
    
    return { used: 0, total: 1000 };
  }

  private checkFirstBoot(): boolean {
    // Check if this is first boot by looking for setup completion marker
    return !existsSync('/opt/pocketcloud/.setup-complete');
  }

  private setupSignalHandlers(): void {
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down GPIO daemon...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGHUP', () => shutdown('SIGHUP'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.stop().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    console.log('Stopping GPIO daemon...');
    this.isRunning = false;
    
    // Clear timers
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
    
    if (this.backendCheckTimer) {
      clearInterval(this.backendCheckTimer);
      this.backendCheckTimer = undefined;
    }
    
    // Shutdown hardware services
    try {
      await ledService.shutdown();
      await oledService.shutdown();
      await buttonService.shutdown();
      console.log('Hardware services shut down');
    } catch (error) {
      console.error('Error shutting down hardware services:', error);
    }
  }
}

// Main execution
async function main() {
  console.log('PocketCloud GPIO Daemon v1.0.0');
  console.log('Hardware interface for LED, OLED, and buttons');
  console.log('');
  
  const daemon = new GPIODaemon();
  
  try {
    await daemon.start();
    
    // Keep process alive
    process.stdin.resume();
    
  } catch (error) {
    console.error('Failed to start GPIO daemon:', error);
    process.exit(1);
  }
}

// Start the daemon
if (require.main === module) {
  main().catch(console.error);
}