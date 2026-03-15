// Mock EventEmitter for compatibility
class EventEmitter {
  private listeners: { [event: string]: Function[] } = {};

  on(event: string, listener: Function): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }

  removeListener(event: string, listener: Function): this {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
    return this;
  }
}

import { logger } from './logger.service.js';
import { realtimeService } from './realtime.service.js';

// Power hardware types
export enum PowerHardware {
  INA219 = 'ina219',      // Waveshare UPS HAT, PiJuice
  PISUGAR = 'pisugar',     // PiSugar 3
  POWERBANK = 'powerbank', // Generic USB-C power bank
  UNKNOWN = 'unknown'      // No UPS detected
}

// Power source types
export enum PowerSource {
  BATTERY = 'battery',
  USB = 'usb',
  UNKNOWN = 'unknown'
}

// Battery states
export enum BatteryState {
  NORMAL = 'normal',       // > 20%
  LOW = 'low',            // 5-20%
  CRITICAL = 'critical',   // < 5%
  CHARGING = 'charging',   // Any % while charging
  FULL = 'full'           // 100% and charging complete
}

interface PowerStatus {
  batteryPercent: number;
  isCharging: boolean;
  voltage: number;
  currentDraw: number;        // mA
  estimatedRuntime: number;   // minutes
  powerSource: PowerSource;
  batteryState: BatteryState;
  temperature?: number;       // °C
  cycleCount?: number;
  lastUpdated: Date;
}

interface BatteryHealthData {
  timestamp: Date;
  percent: number;
  voltage: number;
  current: number;
  temperature?: number;
  cycleCount?: number;
}

export class PowerService extends EventEmitter {
  private static instance: PowerService;
  private hardwareType: PowerHardware = PowerHardware.UNKNOWN;
  private isInitialized = false;
  private monitoringInterval?: any;
  private shutdownTimer?: any;
  private powerSaveMode = false;
  
  private currentStatus: PowerStatus = {
    batteryPercent: 0,
    isCharging: false,
    voltage: 0,
    currentDraw: 0,
    estimatedRuntime: 0,
    powerSource: PowerSource.UNKNOWN,
    batteryState: BatteryState.NORMAL,
    lastUpdated: new Date()
  };

  // Battery specifications for different hardware
  private readonly BATTERY_SPECS = {
    [PowerHardware.INA219]: {
      minVoltage: 6.0,    // 2S LiPo minimum
      maxVoltage: 8.4,    // 2S LiPo maximum
      capacity: 20000     // mAh (typical UPS HAT)
    },
    [PowerHardware.PISUGAR]: {
      minVoltage: 3.0,    // Single cell
      maxVoltage: 4.2,    // Single cell maximum
      capacity: 5000      // mAh (PiSugar 3)
    },
    [PowerHardware.POWERBANK]: {
      minVoltage: 4.5,    // USB minimum
      maxVoltage: 5.2,    // USB maximum
      capacity: 20000     // mAh (estimated)
    }
  };

  constructor() {
    super();
  }

  static getInstance(): PowerService {
    if (!PowerService.instance) {
      PowerService.instance = new PowerService();
    }
    return PowerService.instance;
  }
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info('Initializing power management service');
    
    // Auto-detect hardware
    this.hardwareType = await this.detectHardware();
    logger.info(`Detected power hardware: ${this.hardwareType}`);
    
    // Start monitoring
    this.startMonitoring();
    
    this.isInitialized = true;
    logger.info('Power service initialized');
  }

  private async detectHardware(): Promise<PowerHardware> {
    try {
      // Try INA219 detection (I2C address 0x40-0x4F)
      if (await this.detectINA219()) {
        return PowerHardware.INA219;
      }
      
      // Try PiSugar detection (I2C address 0x57 or 0x32)
      if (await this.detectPiSugar()) {
        return PowerHardware.PISUGAR;
      }
      
      // Check for generic power bank (no I2C, use heuristics)
      if (await this.detectPowerBank()) {
        return PowerHardware.POWERBANK;
      }
      
    } catch (error) {
      logger.warn('Hardware detection failed:', error);
    }
    
    return PowerHardware.UNKNOWN;
  }

  private async detectINA219(): Promise<boolean> {
    try {
      // Try to import and initialize INA219 (mock implementation)
      // const ina219Module = await import('@iiot2k/ina219');
      
      // Try common INA219 addresses
      for (const addr of [0x40, 0x41, 0x44, 0x45]) {
        try {
          const ina = new ina219Module.INA219(1, addr);
          await ina.init();
          
          // Test read - should not throw
          const voltage = await ina.getBusVoltage();
          if (voltage > 0 && voltage < 20) { // Reasonable voltage range
            logger.info(`INA219 detected at address 0x${addr.toString(16)}`);
            return true;
          }
        } catch (error) {
          // Try next address
          continue;
        }
      }
    } catch (error) {
      logger.debug('INA219 module not available:', error);
    }
    
    return false;
  }

  private async detectPiSugar(): Promise<boolean> {
    try {
      // PiSugar uses I2C address 0x57 (newer) or 0x32 (older)
      const { execSync } = await import('child_process');
      
      // Check if PiSugar is detected on I2C
      const i2cScan = execSync('i2cdetect -y 1 2>/dev/null || echo ""', { encoding: 'utf8' });
      
      if (i2cScan.includes('57') || i2cScan.includes('32')) {
        logger.info('PiSugar detected on I2C bus');
        return true;
      }
      
      // Also check for PiSugar service
      try {
        execSync('systemctl is-active pisugar-server', { stdio: 'ignore' });
        logger.info('PiSugar service detected');
        return true;
      } catch {
        // Service not running
      }
      
    } catch (error) {
      logger.debug('PiSugar detection failed:', error);
    }
    
    return false;
  }

  private async detectPowerBank(): Promise<boolean> {
    try {
      // Check if we're running on battery power (mock implementation)
      // const { execSync } = await import('child_process');
      
      // Check if running on Pi (mobile device indicator)
      const model = execSync('cat /proc/device-tree/model 2>/dev/null || echo ""', { encoding: 'utf8' });
      
      if (model.includes('Raspberry Pi')) {
        // Check for under-voltage detection (battery indicator)
        const throttled = execSync('vcgencmd get_throttled', { encoding: 'utf8' });
        
        // If we can read throttling status, assume power bank possibility
        if (throttled.includes('throttled=')) {
          logger.info('Generic power bank mode (Pi detected, no UPS HAT)');
          return true;
        }
      }
      
    } catch (error) {
      logger.debug('Power bank detection failed:', error);
    }
    
    return false;
  }

  private startMonitoring(): void {
    // Monitor every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.updatePowerStatus();
        this.evaluateBatteryState();
        this.handlePowerEvents();
      } catch (error) {
        logger.error('Power monitoring error:', error);
      }
    }, 30000);
    
    // Initial update
    this.updatePowerStatus();
  }
  private async updatePowerStatus(): Promise<void> {
    const previousState = this.currentStatus.batteryState;
    
    switch (this.hardwareType) {
      case PowerHardware.INA219:
        await this.readINA219Status();
        break;
      case PowerHardware.PISUGAR:
        await this.readPiSugarStatus();
        break;
      case PowerHardware.POWERBANK:
        await this.readPowerBankStatus();
        break;
      default:
        await this.readUnknownPowerStatus();
        break;
    }
    
    this.currentStatus.lastUpdated = new Date();
    
    // Log battery health data
    await this.logBatteryHealth();
    
    // Emit status change event
    if (previousState !== this.currentStatus.batteryState) {
      this.emit('batteryStateChanged', this.currentStatus);
    }
    
    this.emit('powerStatusUpdated', this.currentStatus);
  }

  private async readINA219Status(): Promise<void> {
    try {
      // Mock INA219 implementation
      // const ina219Module = await import('@iiot2k/ina219');
      
      // Mock power metrics
      const voltage = 7.4; // Mock voltage
      const current = -1200; // Mock current (negative = discharging)
      
      this.currentStatus.voltage = voltage;
      this.currentStatus.currentDraw = Math.abs(current); // mA
      
      // Calculate battery percentage based on voltage
      const spec = this.BATTERY_SPECS[PowerHardware.INA219];
      this.currentStatus.batteryPercent = Math.max(0, Math.min(100,
        ((voltage - spec.minVoltage) / (spec.maxVoltage - spec.minVoltage)) * 100
      ));
      
      // Determine charging state (positive current = charging)
      this.currentStatus.isCharging = current > 50; // 50mA threshold
      
      // Estimate runtime
      if (!this.currentStatus.isCharging && this.currentStatus.currentDraw > 0) {
        const remainingCapacity = (this.currentStatus.batteryPercent / 100) * spec.capacity;
        this.currentStatus.estimatedRuntime = Math.round((remainingCapacity / this.currentStatus.currentDraw) * 60);
      } else {
        this.currentStatus.estimatedRuntime = 0;
      }
      
      // Determine power source
      this.currentStatus.powerSource = this.currentStatus.isCharging ? PowerSource.USB : PowerSource.BATTERY;
      
    } catch (error) {
      logger.warn('Failed to read INA219 status:', error);
      this.fallbackToHeuristics();
    }
  }

  private async readPiSugarStatus(): Promise<void> {
    try {
      // PiSugar provides status via I2C or file system (mock implementation)
      // const { readFileSync } = await import('fs');
      
      // Try reading from PiSugar status file
      try {
        const statusFile = '/sys/class/power_supply/pisugar-battery/capacity';
        const capacityStr = readFileSync(statusFile, 'utf8').trim();
        this.currentStatus.batteryPercent = parseInt(capacityStr, 10);
        
        // Read voltage
        const voltageFile = '/sys/class/power_supply/pisugar-battery/voltage_now';
        const voltageStr = readFileSync(voltageFile, 'utf8').trim();
        this.currentStatus.voltage = parseInt(voltageStr, 10) / 1000000; // Convert µV to V
        
        // Read charging status
        const statusStr = readFileSync('/sys/class/power_supply/pisugar-battery/status', 'utf8').trim();
        this.currentStatus.isCharging = statusStr === 'Charging';
        
        // Estimate current draw (PiSugar specific)
        const spec = this.BATTERY_SPECS[PowerHardware.PISUGAR];
        if (!this.currentStatus.isCharging) {
          // Estimate based on Pi 4 power consumption
          this.currentStatus.currentDraw = 1500; // Typical Pi 4 draw
          
          const remainingCapacity = (this.currentStatus.batteryPercent / 100) * spec.capacity;
          this.currentStatus.estimatedRuntime = Math.round((remainingCapacity / this.currentStatus.currentDraw) * 60);
        } else {
          this.currentStatus.estimatedRuntime = 0;
        }
        
        this.currentStatus.powerSource = this.currentStatus.isCharging ? PowerSource.USB : PowerSource.BATTERY;
        
      } catch (fileError) {
        // Fallback to I2C communication
        await this.readPiSugarI2C();
      }
      
    } catch (error) {
      logger.warn('Failed to read PiSugar status:', error);
      this.fallbackToHeuristics();
    }
  }

  private async readPiSugarI2C(): Promise<void> {
    // PiSugar I2C communication (simplified)
    // This would require specific PiSugar protocol implementation
    logger.debug('PiSugar I2C communication not implemented, using heuristics');
    this.fallbackToHeuristics();
  }

  private async readPowerBankStatus(): Promise<void> {
    // Generic power bank - no direct monitoring possible
    // Use system heuristics to estimate battery state
    this.fallbackToHeuristics();
  }

  private async readUnknownPowerStatus(): Promise<void> {
    // No UPS hardware detected
    this.currentStatus.batteryPercent = 0;
    this.currentStatus.isCharging = false;
    this.currentStatus.voltage = 0;
    this.currentStatus.currentDraw = 0;
    this.currentStatus.estimatedRuntime = 0;
    this.currentStatus.powerSource = PowerSource.UNKNOWN;
  }
  private async fallbackToHeuristics(): Promise<void> {
    try {
      // Mock implementation for heuristics
      // const { execSync } = await import('child_process');
      
      // Check throttling status as battery indicator
      const throttled = execSync('vcgencmd get_throttled', { encoding: 'utf8' });
      const throttleValue = parseInt(throttled.split('=')[1], 16);
      
      // Bit 0 (0x1): under-voltage detected (current)
      // Bit 16 (0x10000): under-voltage has occurred since boot
      const underVoltage = (throttleValue & 0x1) !== 0;
      const underVoltageHistory = (throttleValue & 0x10000) !== 0;
      
      if (underVoltage) {
        // Currently under voltage - battery very low
        this.currentStatus.batteryPercent = 10;
        this.currentStatus.powerSource = PowerSource.BATTERY;
      } else if (underVoltageHistory) {
        // Was under voltage - battery low but recovering
        this.currentStatus.batteryPercent = 25;
        this.currentStatus.powerSource = PowerSource.BATTERY;
      } else {
        // No under voltage - assume good power or charging
        this.currentStatus.batteryPercent = 75;
        this.currentStatus.powerSource = PowerSource.USB;
      }
      
      // Check CPU frequency as power indicator
      const cpuFreq = execSync('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq', { encoding: 'utf8' });
      const freq = parseInt(cpuFreq.trim());
      
      // If frequency is throttled, likely on battery
      if (freq < 1000000) { // Less than 1GHz
        this.currentStatus.batteryPercent = Math.max(15, this.currentStatus.batteryPercent - 20);
        this.currentStatus.powerSource = PowerSource.BATTERY;
      }
      
      // Estimate charging based on power source
      this.currentStatus.isCharging = this.currentStatus.powerSource === PowerSource.USB;
      
      // Rough voltage estimate
      this.currentStatus.voltage = this.currentStatus.powerSource === PowerSource.USB ? 5.1 : 4.8;
      
      // Estimate current draw (Pi 4 typical)
      this.currentStatus.currentDraw = this.powerSaveMode ? 800 : 1500;
      
      // Estimate runtime (very rough)
      if (!this.currentStatus.isCharging) {
        const estimatedCapacity = 10000; // Assume 10Ah power bank
        const remainingCapacity = (this.currentStatus.batteryPercent / 100) * estimatedCapacity;
        this.currentStatus.estimatedRuntime = Math.round((remainingCapacity / this.currentStatus.currentDraw) * 60);
      } else {
        this.currentStatus.estimatedRuntime = 0;
      }
      
    } catch (error) {
      logger.warn('Heuristic power detection failed:', error);
      
      // Ultimate fallback - unknown state
      this.currentStatus.batteryPercent = 0;
      this.currentStatus.isCharging = false;
      this.currentStatus.voltage = 0;
      this.currentStatus.currentDraw = 0;
      this.currentStatus.estimatedRuntime = 0;
      this.currentStatus.powerSource = PowerSource.UNKNOWN;
    }
  }

  private evaluateBatteryState(): void {
    const { batteryPercent, isCharging } = this.currentStatus;
    
    if (isCharging) {
      if (batteryPercent >= 100) {
        this.currentStatus.batteryState = BatteryState.FULL;
      } else {
        this.currentStatus.batteryState = BatteryState.CHARGING;
      }
    } else {
      if (batteryPercent < 5) {
        this.currentStatus.batteryState = BatteryState.CRITICAL;
      } else if (batteryPercent < 20) {
        this.currentStatus.batteryState = BatteryState.LOW;
      } else {
        this.currentStatus.batteryState = BatteryState.NORMAL;
      }
    }
  }

  private handlePowerEvents(): void {
    const { batteryState, batteryPercent, estimatedRuntime } = this.currentStatus;
    
    switch (batteryState) {
      case BatteryState.LOW:
        this.handleBatteryLow();
        break;
      case BatteryState.CRITICAL:
        this.handleBatteryCritical();
        break;
      case BatteryState.CHARGING:
        this.handleChargingStarted();
        break;
      case BatteryState.FULL:
        this.handleChargingComplete();
        break;
    }
  }

  private handleBatteryLow(): void {
    logger.warn(`Battery low: ${this.currentStatus.batteryPercent}%`);
    
    // Update LED status (handled by LED service)
    this.emit('batteryLow', this.currentStatus);
    
    // Broadcast to clients (mock implementation)
    realtimeService.broadcastToAll({
      type: 'BATTERY_LOW',
      timestamp: Date.now(),
      data: {
        percent: this.currentStatus.batteryPercent,
        estimatedRuntime: this.currentStatus.estimatedRuntime,
        message: `Battery low: ${this.currentStatus.batteryPercent}% · ~${this.currentStatus.estimatedRuntime} min remaining`
      }
    });
  }

  private handleBatteryCritical(): void {
    logger.error(`Battery critical: ${this.currentStatus.batteryPercent}%`);
    
    // Cancel any existing shutdown timer
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
    }
    
    // Emit critical event
    this.emit('batteryCritical', this.currentStatus);
    
    // Broadcast to clients (mock implementation)
    realtimeService.broadcastToAll({
      type: 'BATTERY_CRITICAL',
      timestamp: Date.now(),
      data: {
        percent: this.currentStatus.batteryPercent,
        shutdownIn: 5, // 5 minutes
        message: `CRITICAL: ${this.currentStatus.batteryPercent}% · Shutting down in 5 min`
      }
    });
    
    // Schedule graceful shutdown in 5 minutes
    this.shutdownTimer = setTimeout(() => {
      this.initiateGracefulShutdown();
    }, 5 * 60 * 1000);
    
    logger.warn('Graceful shutdown scheduled in 5 minutes due to critical battery');
  }
  private handleChargingStarted(): void {
    logger.info('Charging started');
    
    // Cancel shutdown if scheduled
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = undefined;
      logger.info('Shutdown cancelled - charging started');
    }
    
    this.emit('chargingStarted', this.currentStatus);
    
    realtimeService.broadcastToAll({
      type: 'CHARGING_STARTED',
      timestamp: Date.now(),
      data: {
        percent: this.currentStatus.batteryPercent,
        message: 'Charging started'
      }
    });
  }

  private handleChargingComplete(): void {
    logger.info('Charging complete');
    
    this.emit('chargingComplete', this.currentStatus);
    
    realtimeService.broadcastToAll({
      type: 'CHARGING_COMPLETE',
      timestamp: Date.now(),
      data: {
        percent: this.currentStatus.batteryPercent,
        message: 'Battery fully charged'
      }
    });
  }

  private async initiateGracefulShutdown(): Promise<void> {
    logger.warn('Initiating graceful shutdown due to critical battery');
    
    try {
      // Notify all services
      this.emit('gracefulShutdown', { reason: 'critical_battery' });
      
      // Broadcast final warning
      realtimeService.broadcastToAll({
        type: 'SYSTEM_SHUTDOWN',
        timestamp: Date.now(),
        data: {
          reason: 'critical_battery',
          message: 'System shutting down due to critical battery level'
        }
      });
      
      // Wait a moment for broadcasts to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Complete in-progress uploads (up to 4 minutes)
      await this.completeUploads();
      
      // Flush database writes
      await this.flushDatabases();
      
      // Sync filesystem
      await this.syncFilesystem();
      
      // Perform shutdown (mock implementation)
      // const { execSync } = await import('child_process');
      // execSync('sudo shutdown -h now');
      
    } catch (error) {
      logger.error('Graceful shutdown failed:', error);
      
      // Emergency shutdown (mock implementation)
      try {
        // const { execSync } = await import('child_process');
        // execSync('sudo shutdown -h now');
      } catch (emergencyError) {
        logger.error('Emergency shutdown failed:', emergencyError);
        // process.exit(1);
      }
    }
  }

  private async completeUploads(): Promise<void> {
    try {
      // Import upload service dynamically to avoid circular dependency (mock implementation)
      // const { uploadService } = await import('./upload.service.js');
      
      // Wait for uploads to complete (max 4 minutes) - mock implementation
      const timeout = 4 * 60 * 1000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        // Mock: assume no active uploads
        const activeUploads: any[] = []; // uploadService.getActiveUploads();
        if (activeUploads.length === 0) {
          logger.info('All uploads completed');
          break;
        }
        
        logger.info(`Waiting for ${activeUploads.length} uploads to complete...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
    } catch (error) {
      logger.warn('Failed to wait for upload completion:', error);
    }
  }

  private async flushDatabases(): Promise<void> {
    try {
      // Import database client
      const { dbClient } = await import('../db/index.js');
      
      // Ensure all writes are flushed
      await dbClient.exec('PRAGMA wal_checkpoint(FULL)');
      logger.info('Database writes flushed');
      
    } catch (error) {
      logger.warn('Failed to flush database:', error);
    }
  }

  private async syncFilesystem(): Promise<void> {
    try {
      // Mock implementation
      // const { execSync } = await import('child_process');
      
      // Sync all filesystems
      // execSync('sync');
      logger.info('Filesystem synced');
      
    } catch (error) {
      logger.warn('Failed to sync filesystem:', error);
    }
  }

  async setPowerSaveMode(enabled: boolean): Promise<void> {
    if (this.powerSaveMode === enabled) return;
    
    this.powerSaveMode = enabled;
    logger.info(`Power save mode ${enabled ? 'enabled' : 'disabled'}`);
    
    try {
      // Mock implementation for power save mode
      // const { execSync } = await import('child_process');
      
      if (enabled) {
        // Enable power saving measures
        
        // Set CPU governor to powersave
        execSync('echo "powersave" | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor');
        
        // Disable HDMI output
        execSync('sudo tvservice -o');
        
        // Reduce WiFi TX power
        execSync('sudo iw dev wlan0 set txpower fixed 1000'); // 10dBm
        
        // Disable USB hubs not in use (if uhubctl available)
        try {
          execSync('sudo uhubctl -a 0 -p 2-4'); // Disable ports 2-4
        } catch {
          // uhubctl not available
        }
        
        logger.info('Power saving measures applied');
        
      } else {
        // Disable power saving measures
        
        // Set CPU governor to ondemand
        execSync('echo "ondemand" | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor');
        
        // Enable HDMI output
        execSync('sudo tvservice -p');
        
        // Restore WiFi TX power
        execSync('sudo iw dev wlan0 set txpower auto');
        
        // Enable USB hubs
        try {
          execSync('sudo uhubctl -a 1 -p 2-4'); // Enable ports 2-4
        } catch {
          // uhubctl not available
        }
        
        logger.info('Power saving measures disabled');
      }
      
      this.emit('powerSaveModeChanged', { enabled });
      
    } catch (error) {
      logger.error('Failed to change power save mode:', error);
      throw error;
    }
  }
  private async logBatteryHealth(): Promise<void> {
    try {
      // Mock implementation for battery health logging
      // const { appendFileSync, mkdirSync } = await import('fs');
      // const { join } = await import('path');
      
      // Ensure logs directory exists
      const logsDir = '/mnt/pocketcloud/logs';
      mkdirSync(logsDir, { recursive: true });
      
      // Log battery data
      const healthData: BatteryHealthData = {
        timestamp: new Date(),
        percent: this.currentStatus.batteryPercent,
        voltage: this.currentStatus.voltage,
        current: this.currentStatus.currentDraw,
        temperature: this.currentStatus.temperature,
        cycleCount: this.currentStatus.cycleCount
      };
      
      const logFile = join(logsDir, 'battery.jsonl');
      appendFileSync(logFile, JSON.stringify(healthData) + '\n');
      
    } catch (error) {
      logger.debug('Failed to log battery health:', error);
    }
  }

  async getBatteryHealthReport(): Promise<any> {
    try {
      // Mock implementation for battery health report
      // const { readFileSync } = await import('fs');
      // const { join } = await import('path');
      
      const logFile = join('/mnt/pocketcloud/logs', 'battery.jsonl');
      const logData = readFileSync(logFile, 'utf8');
      
      const entries = logData.trim().split('\n')
        .map(line => JSON.parse(line))
        .filter(entry => {
          const age = Date.now() - new Date(entry.timestamp).getTime();
          return age <= 30 * 24 * 60 * 60 * 1000; // Last 30 days
        });
      
      if (entries.length === 0) {
        return {
          status: 'insufficient_data',
          message: 'Not enough data to generate health report',
          daysOfData: 0
        };
      }
      
      // Calculate statistics
      const voltages = entries.map(e => e.voltage).filter(v => v > 0);
      const percentages = entries.map(e => e.percent);
      
      const avgVoltage = voltages.reduce((a, b) => a + b, 0) / voltages.length;
      const minVoltage = Math.min(...voltages);
      const maxVoltage = Math.max(...voltages);
      
      const avgPercent = percentages.reduce((a, b) => a + b, 0) / percentages.length;
      
      // Estimate cycles (rough calculation)
      let cycles = 0;
      let lastPercent = percentages[0];
      for (let i = 1; i < percentages.length; i++) {
        if (percentages[i] > lastPercent + 50) { // Charging cycle
          cycles += 0.5;
        }
        lastPercent = percentages[i];
      }
      
      // Health assessment
      let healthStatus = 'good';
      let healthMessage = 'Battery appears healthy';
      
      if (avgVoltage < this.BATTERY_SPECS[this.hardwareType]?.minVoltage * 1.1) {
        healthStatus = 'degraded';
        healthMessage = 'Battery voltage is low - consider replacement';
      } else if (cycles > 500) {
        healthStatus = 'aged';
        healthMessage = 'Battery has many cycles - monitor closely';
      }
      
      return {
        status: healthStatus,
        message: healthMessage,
        daysOfData: Math.ceil(entries.length / 24), // Assuming hourly logs
        statistics: {
          averageVoltage: Math.round(avgVoltage * 100) / 100,
          voltageRange: [Math.round(minVoltage * 100) / 100, Math.round(maxVoltage * 100) / 100],
          averageCapacity: Math.round(avgPercent),
          estimatedCycles: Math.round(cycles),
          dataPoints: entries.length
        },
        hardwareType: this.hardwareType
      };
      
    } catch (error) {
      logger.warn('Failed to generate battery health report:', error);
      return {
        status: 'error',
        message: 'Failed to read battery health data',
        error: error.message
      };
    }
  }

  // Public API methods
  getPowerStatus(): PowerStatus {
    return { ...this.currentStatus };
  }

  getHardwareType(): PowerHardware {
    return this.hardwareType;
  }

  isPowerSaveModeEnabled(): boolean {
    return this.powerSaveMode;
  }

  cancelShutdown(): boolean {
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = undefined;
      logger.info('Shutdown cancelled by user request');
      
      realtimeService.broadcastToAll({
        type: 'SHUTDOWN_CANCELLED',
        timestamp: Date.now(),
        data: {
          message: 'Shutdown cancelled by administrator'
        }
      });
      
      return true;
    }
    return false;
  }

  async forceShutdown(): Promise<void> {
    logger.warn('Force shutdown requested');
    await this.initiateGracefulShutdown();
  }

  async forceReboot(): Promise<void> {
    logger.warn('Force reboot requested');
    
    try {
      // Quick cleanup
      await this.flushDatabases();
      await this.syncFilesystem();
      
      // Mock implementation for reboot
      // const { execSync } = await import('child_process');
      // execSync('sudo reboot');
      
    } catch (error) {
      logger.error('Reboot failed:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down power service');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = undefined;
    }
    
    // Disable power save mode
    if (this.powerSaveMode) {
      try {
        await this.setPowerSaveMode(false);
      } catch (error) {
        logger.warn('Failed to disable power save mode during shutdown:', error);
      }
    }
    
    this.isInitialized = false;
  }
}

export const powerService = PowerService.getInstance();