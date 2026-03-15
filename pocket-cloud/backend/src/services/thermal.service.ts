import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { logger } from './logger.service.js';
import { RealtimeService } from './realtime.service.js';

interface ThermalStatus {
  temp: number;
  zone: number;
  throttled: boolean;
  message: string;
  timestamp: Date;
}

interface ThermalZone {
  name: string;
  maxTemp: number;
  actions: string[];
}

export class ThermalService extends EventEmitter {
  private static instance: ThermalService;
  private isRunning = false;
  private currentStatus: ThermalStatus;
  private monitorInterval?: NodeJS.Timeout;
  private criticalStartTime?: Date;
  
  private readonly zones: ThermalZone[] = [
    { name: 'Normal', maxTemp: 60, actions: [] },
    { name: 'Warm', maxTemp: 70, actions: ['log_warning'] },
    { name: 'Hot', maxTemp: 80, actions: ['pause_transcoding', 'limit_uploads'] },
    { name: 'Critical', maxTemp: 100, actions: ['pause_all', 'alert_admin'] }
  ];

  private readonly TEMP_PATH = '/sys/class/thermal/thermal_zone0/temp';
  private readonly CHECK_INTERVAL = 10000; // 10 seconds
  private readonly WARNING_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly CRITICAL_SHUTDOWN_DELAY = 2 * 60 * 1000; // 2 minutes
  
  private lastWarningTime = 0;
  private transcodingPaused = false;
  private uploadLimited = false;
  private backgroundPaused = false;

  constructor() {
    super();
    this.currentStatus = {
      temp: 0,
      zone: 1,
      throttled: false,
      message: 'Initializing thermal monitoring',
      timestamp: new Date()
    };
  }

  static getInstance(): ThermalService {
    if (!ThermalService.instance) {
      ThermalService.instance = new ThermalService();
    }
    return ThermalService.instance;
  }
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    logger.info('Starting thermal monitoring service');
    this.isRunning = true;
    
    // Initial temperature check
    await this.checkTemperature();
    
    // Start monitoring loop
    this.monitorInterval = setInterval(async () => {
      try {
        await this.checkTemperature();
      } catch (error) {
        logger.error('Thermal monitoring error:', error);
      }
    }, this.CHECK_INTERVAL);
    
    logger.info('Thermal monitoring started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info('Stopping thermal monitoring service');
    this.isRunning = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    
    // Reset all throttling
    await this.resetThrottling();
    
    logger.info('Thermal monitoring stopped');
  }

  private async readTemperature(): Promise<number> {
    try {
      const tempStr = await fs.readFile(this.TEMP_PATH, 'utf8');
      const tempMilliC = parseInt(tempStr.trim(), 10);
      return tempMilliC / 1000; // Convert to Celsius
    } catch (error) {
      logger.warn('Failed to read temperature, using fallback:', error);
      return 45; // Safe fallback temperature
    }
  }

  private determineZone(temp: number): number {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (temp >= this.zones[i].maxTemp) {
        return i + 1;
      }
    }
    return 1; // Normal zone
  }

  private async checkTemperature(): Promise<void> {
    const temp = await this.readTemperature();
    const zone = this.determineZone(temp);
    const previousZone = this.currentStatus.zone;
    
    this.currentStatus = {
      temp,
      zone,
      throttled: zone > 1,
      message: this.getZoneMessage(zone),
      timestamp: new Date()
    };

    // Zone change actions
    if (zone !== previousZone) {
      await this.handleZoneChange(zone, previousZone);
    }

    // Zone-specific periodic actions
    await this.handleZoneActions(zone);

    // Broadcast status via WebSocket
    this.broadcastStatus();
    
    // Emit event for other services
    this.emit('temperature', this.currentStatus);
  }
  private getZoneMessage(zone: number): string {
    switch (zone) {
      case 1: return 'Normal operation - all features active';
      case 2: return 'Warm - monitoring closely';
      case 3: return 'Hot - transcoding paused, uploads limited';
      case 4: return 'Critical - all background processing paused';
      default: return 'Unknown thermal state';
    }
  }

  private async handleZoneChange(newZone: number, oldZone: number): Promise<void> {
    logger.info(`Thermal zone changed: ${this.zones[oldZone - 1]?.name} → ${this.zones[newZone - 1]?.name} (${this.currentStatus.temp}°C)`);

    if (newZone >= 3 && oldZone < 3) {
      // Entering hot zone
      await this.pauseTranscoding();
      await this.limitUploads();
    } else if (newZone < 3 && oldZone >= 3) {
      // Leaving hot zone
      await this.resumeTranscoding();
      await this.unlimitUploads();
    }

    if (newZone >= 4 && oldZone < 4) {
      // Entering critical zone
      await this.pauseBackgroundProcessing();
      this.criticalStartTime = new Date();
      
      // Schedule shutdown warning
      setTimeout(() => {
        if (this.currentStatus.zone >= 4) {
          this.suggestShutdown();
        }
      }, this.CRITICAL_SHUTDOWN_DELAY);
    } else if (newZone < 4 && oldZone >= 4) {
      // Leaving critical zone
      await this.resumeBackgroundProcessing();
      this.criticalStartTime = undefined;
    }
  }

  private async handleZoneActions(zone: number): Promise<void> {
    const now = Date.now();

    if (zone === 2 && now - this.lastWarningTime > this.WARNING_INTERVAL) {
      // Log warning every 5 minutes in warm zone
      logger.warn(`System running warm: ${this.currentStatus.temp}°C`);
      this.lastWarningTime = now;
    }
  }

  private async pauseTranscoding(): Promise<void> {
    if (this.transcodingPaused) return;
    
    logger.warn('Pausing ffmpeg transcoding due to high temperature');
    this.transcodingPaused = true;
    this.emit('transcoding:pause');
  }

  private async resumeTranscoding(): Promise<void> {
    if (!this.transcodingPaused) return;
    
    logger.info('Resuming ffmpeg transcoding - temperature normalized');
    this.transcodingPaused = false;
    this.emit('transcoding:resume');
  }

  private async limitUploads(): Promise<void> {
    if (this.uploadLimited) return;
    
    logger.warn('Limiting concurrent uploads to 2 due to high temperature');
    this.uploadLimited = true;
    this.emit('uploads:limit', { maxConcurrent: 2 });
  }

  private async unlimitUploads(): Promise<void> {
    if (!this.uploadLimited) return;
    
    logger.info('Removing upload limits - temperature normalized');
    this.uploadLimited = false;
    this.emit('uploads:unlimit');
  }
  private async pauseBackgroundProcessing(): Promise<void> {
    if (this.backgroundPaused) return;
    
    logger.error('Pausing ALL background processing due to critical temperature');
    this.backgroundPaused = true;
    this.emit('background:pause');
  }

  private async resumeBackgroundProcessing(): Promise<void> {
    if (!this.backgroundPaused) return;
    
    logger.info('Resuming background processing - temperature normalized');
    this.backgroundPaused = false;
    this.emit('background:resume');
  }

  private suggestShutdown(): void {
    const duration = this.criticalStartTime ? 
      Date.now() - this.criticalStartTime.getTime() : 0;
    
    logger.error(`Critical temperature sustained for ${Math.round(duration / 1000)}s - consider shutdown`);
    
    this.broadcastStatus({
      ...this.currentStatus,
      message: `Critical temperature for ${Math.round(duration / 1000)}s - consider shutdown`
    });
  }

  private async resetThrottling(): Promise<void> {
    if (this.transcodingPaused) {
      await this.resumeTranscoding();
    }
    if (this.uploadLimited) {
      await this.unlimitUploads();
    }
    if (this.backgroundPaused) {
      await this.resumeBackgroundProcessing();
    }
  }

  private broadcastStatus(status?: ThermalStatus): void {
    const statusToSend = status || this.currentStatus;
    
    try {
      const realtimeService = RealtimeService.getInstance();
      realtimeService.broadcast('THERMAL_STATUS', statusToSend);
    } catch (error) {
      // Realtime service might not be available during startup
      logger.debug('Could not broadcast thermal status:', error);
    }
  }

  // Public API
  getStatus(): ThermalStatus {
    return { ...this.currentStatus };
  }

  isThrottled(): boolean {
    return this.currentStatus.throttled;
  }

  getThrottleState() {
    return {
      transcoding: this.transcodingPaused,
      uploads: this.uploadLimited,
      background: this.backgroundPaused
    };
  }
}

export const thermalService = ThermalService.getInstance();