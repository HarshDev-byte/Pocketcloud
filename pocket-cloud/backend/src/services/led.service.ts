import { EventEmitter } from 'events';
import { logger } from './logger.service.js';

// GPIO pin definitions
const LED_PINS = {
  RED: 17,
  GREEN: 27,
  BLUE: 22
};

// LED status definitions
export enum LEDStatus {
  NORMAL = 'normal',           // Solid green
  STANDBY = 'standby',         // Slow pulse green
  TRANSFER = 'transfer',       // Solid blue
  ACTIVE_TRANSFER = 'active',  // Fast pulse blue
  WARNING = 'warning',         // Solid amber
  UPDATE = 'update',           // Fast pulse amber
  ERROR = 'error',             // Solid red
  SHUTDOWN = 'shutdown',       // Pulse red + blue
  SETUP = 'setup',             // Rainbow cycle
  NEW_USER = 'new_user'        // Fast white pulse
}

interface LEDColor {
  r: number;
  g: number;
  b: number;
}

export class LEDService extends EventEmitter {
  private static instance: LEDService;
  private pigpio: any;
  private isInitialized = false;
  private currentStatus: LEDStatus = LEDStatus.STANDBY;
  private animationInterval?: NodeJS.Timeout;
  private animationFrame = 0;
  private isAnimating = false;

  constructor() {
    super();
  }

  static getInstance(): LEDService {
    if (!LEDService.instance) {
      LEDService.instance = new LEDService();
    }
    return LEDService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Import pigpio dynamically
      const pigpioModule = await import('pigpio');
      this.pigpio = pigpioModule.Gpio;

      // Initialize GPIO pins for RGB LED
      this.setupGPIO();
      
      this.isInitialized = true;
      logger.info('LED service initialized');
      
      // Start with standby status
      this.setStatus(LEDStatus.STANDBY);
      
    } catch (error) {
      logger.warn('Failed to initialize LED service (pigpio not available):', error);
      // Continue without LED functionality
    }
  }

  private setupGPIO(): void {
    if (!this.pigpio) return;

    // Set up RGB LED pins as outputs
    Object.values(LED_PINS).forEach(pin => {
      try {
        const gpio = new this.pigpio(pin, { mode: this.pigpio.OUTPUT });
        gpio.pwmWrite(0); // Start with LED off
      } catch (error) {
        logger.warn(`Failed to setup GPIO pin ${pin}:`, error);
      }
    });
  }

  setStatus(status: LEDStatus): void {
    if (this.currentStatus === status) return;
    
    this.currentStatus = status;
    this.stopAnimation();
    
    logger.debug(`LED status changed to: ${status}`);
    
    switch (status) {
      case LEDStatus.NORMAL:
        this.setColor(0, 255, 0); // Solid green
        break;
        
      case LEDStatus.STANDBY:
        this.pulse(0, 255, 0, 3000); // Slow pulse green
        break;
        
      case LEDStatus.TRANSFER:
        this.setColor(0, 0, 255); // Solid blue
        break;
        
      case LEDStatus.ACTIVE_TRANSFER:
        this.pulse(0, 0, 255, 500); // Fast pulse blue
        break;
        
      case LEDStatus.WARNING:
        this.setColor(255, 128, 0); // Solid amber
        break;
        
      case LEDStatus.UPDATE:
        this.pulse(255, 128, 0, 300); // Fast pulse amber
        break;
        
      case LEDStatus.ERROR:
        this.setColor(255, 0, 0); // Solid red
        break;
        
      case LEDStatus.SHUTDOWN:
        this.alternatingPulse(255, 0, 0, 0, 0, 255, 1000); // Red + blue pulse
        break;
        
      case LEDStatus.SETUP:
        this.rainbow(); // Rainbow cycle
        break;
        
      case LEDStatus.NEW_USER:
        this.pulse(255, 255, 255, 200); // Fast white pulse
        break;
    }
    
    this.emit('statusChanged', status);
  }
  setColor(r: number, g: number, b: number): void {
    if (!this.isInitialized || !this.pigpio) return;
    
    try {
      // Convert 0-255 to PWM range (0-255)
      const redGpio = new this.pigpio(LED_PINS.RED, { mode: this.pigpio.OUTPUT });
      const greenGpio = new this.pigpio(LED_PINS.GREEN, { mode: this.pigpio.OUTPUT });
      const blueGpio = new this.pigpio(LED_PINS.BLUE, { mode: this.pigpio.OUTPUT });
      
      redGpio.pwmWrite(r);
      greenGpio.pwmWrite(g);
      blueGpio.pwmWrite(b);
      
    } catch (error) {
      logger.warn('Failed to set LED color:', error);
    }
  }

  pulse(r: number, g: number, b: number, periodMs: number): void {
    this.stopAnimation();
    this.isAnimating = true;
    
    const steps = 50;
    const stepTime = periodMs / steps;
    
    this.animationInterval = setInterval(() => {
      if (!this.isAnimating) return;
      
      // Sine wave breathing effect
      const phase = (this.animationFrame % steps) / steps;
      const intensity = (Math.sin(phase * 2 * Math.PI) + 1) / 2;
      
      this.setColor(
        Math.round(r * intensity),
        Math.round(g * intensity),
        Math.round(b * intensity)
      );
      
      this.animationFrame++;
    }, stepTime);
  }

  blink(r: number, g: number, b: number, onMs: number, offMs: number): void {
    this.stopAnimation();
    this.isAnimating = true;
    
    let isOn = true;
    
    const toggle = () => {
      if (!this.isAnimating) return;
      
      if (isOn) {
        this.setColor(r, g, b);
        setTimeout(toggle, onMs);
      } else {
        this.setColor(0, 0, 0);
        setTimeout(toggle, offMs);
      }
      isOn = !isOn;
    };
    
    toggle();
  }

  alternatingPulse(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, periodMs: number): void {
    this.stopAnimation();
    this.isAnimating = true;
    
    const steps = 50;
    const stepTime = periodMs / steps;
    
    this.animationInterval = setInterval(() => {
      if (!this.isAnimating) return;
      
      const phase = (this.animationFrame % steps) / steps;
      const intensity = (Math.sin(phase * 2 * Math.PI) + 1) / 2;
      
      // Alternate between two colors
      const useFirst = Math.floor(this.animationFrame / steps) % 2 === 0;
      
      if (useFirst) {
        this.setColor(
          Math.round(r1 * intensity),
          Math.round(g1 * intensity),
          Math.round(b1 * intensity)
        );
      } else {
        this.setColor(
          Math.round(r2 * intensity),
          Math.round(g2 * intensity),
          Math.round(b2 * intensity)
        );
      }
      
      this.animationFrame++;
    }, stepTime);
  }

  rainbow(): void {
    this.stopAnimation();
    this.isAnimating = true;
    
    this.animationInterval = setInterval(() => {
      if (!this.isAnimating) return;
      
      // HSV to RGB conversion for rainbow effect
      const hue = (this.animationFrame * 2) % 360;
      const { r, g, b } = this.hsvToRgb(hue, 100, 100);
      
      this.setColor(r, g, b);
      this.animationFrame++;
    }, 50);
  }

  private hsvToRgb(h: number, s: number, v: number): LEDColor {
    h = h / 60;
    s = s / 100;
    v = v / 100;
    
    const c = v * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = v - c;
    
    let r = 0, g = 0, b = 0;
    
    if (h >= 0 && h < 1) {
      r = c; g = x; b = 0;
    } else if (h >= 1 && h < 2) {
      r = x; g = c; b = 0;
    } else if (h >= 2 && h < 3) {
      r = 0; g = c; b = x;
    } else if (h >= 3 && h < 4) {
      r = 0; g = x; b = c;
    } else if (h >= 4 && h < 5) {
      r = x; g = 0; b = c;
    } else if (h >= 5 && h < 6) {
      r = c; g = 0; b = x;
    }
    
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }
  off(): void {
    this.stopAnimation();
    this.setColor(0, 0, 0);
  }

  private stopAnimation(): void {
    this.isAnimating = false;
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = undefined;
    }
  }

  // Status evaluation based on system state
  evaluateStatus(systemState: {
    thermalZone: number;
    storageUsedPercent: number;
    activeTransfers: number;
    transferSpeed: number; // MB/s
    connectedClients: number;
    hasErrors: boolean;
    isShuttingDown: boolean;
    isFirstBoot: boolean;
    hasUpdates: boolean;
    newUserConnected: boolean;
    batteryState?: string; // Battery state from power service
    isCharging?: boolean;  // Charging status from power service
  }): LEDStatus {
    
    // Priority order (highest to lowest)
    if (systemState.isShuttingDown) {
      return LEDStatus.SHUTDOWN;
    }
    
    if (systemState.hasErrors) {
      return LEDStatus.ERROR;
    }
    
    if (systemState.isFirstBoot) {
      return LEDStatus.SETUP;
    }
    
    if (systemState.newUserConnected) {
      return LEDStatus.NEW_USER;
    }
    
    // Battery status takes priority over thermal/storage warnings
    if (systemState.batteryState === 'critical') {
      return LEDStatus.ERROR; // Red for critical battery
    }
    
    if (systemState.batteryState === 'low') {
      return LEDStatus.WARNING; // Amber for low battery
    }
    
    if (systemState.isCharging && systemState.batteryState === 'charging') {
      return LEDStatus.ACTIVE_TRANSFER; // Fast blue pulse for charging
    }
    
    if (systemState.thermalZone >= 3 || systemState.storageUsedPercent > 95) {
      return LEDStatus.WARNING;
    }
    
    if (systemState.hasUpdates) {
      return LEDStatus.UPDATE;
    }
    
    if (systemState.activeTransfers > 0) {
      if (systemState.transferSpeed > 1) {
        return LEDStatus.ACTIVE_TRANSFER;
      } else {
        return LEDStatus.TRANSFER;
      }
    }
    
    if (systemState.connectedClients > 0) {
      return LEDStatus.NORMAL;
    }
    
    return LEDStatus.STANDBY;
  }

  getCurrentStatus(): LEDStatus {
    return this.currentStatus;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down LED service');
    this.stopAnimation();
    this.off();
    
    // Cleanup GPIO
    if (this.isInitialized && this.pigpio) {
      try {
        Object.values(LED_PINS).forEach(pin => {
          const gpio = new this.pigpio(pin, { mode: this.pigpio.OUTPUT });
          gpio.pwmWrite(0);
        });
      } catch (error) {
        logger.warn('Error during LED GPIO cleanup:', error);
      }
    }
    
    this.isInitialized = false;
  }

  // Test methods for debugging
  testSequence(): void {
    logger.info('Starting LED test sequence');
    
    const sequence = [
      { status: LEDStatus.NORMAL, duration: 2000 },
      { status: LEDStatus.STANDBY, duration: 3000 },
      { status: LEDStatus.TRANSFER, duration: 2000 },
      { status: LEDStatus.ACTIVE_TRANSFER, duration: 3000 },
      { status: LEDStatus.WARNING, duration: 2000 },
      { status: LEDStatus.UPDATE, duration: 3000 },
      { status: LEDStatus.ERROR, duration: 2000 },
      { status: LEDStatus.NEW_USER, duration: 3000 },
      { status: LEDStatus.SETUP, duration: 5000 }
    ];
    
    let index = 0;
    const runNext = () => {
      if (index >= sequence.length) {
        this.setStatus(LEDStatus.STANDBY);
        logger.info('LED test sequence completed');
        return;
      }
      
      const step = sequence[index];
      logger.info(`Testing LED status: ${step.status}`);
      this.setStatus(step.status);
      
      setTimeout(() => {
        index++;
        runNext();
      }, step.duration);
    };
    
    runNext();
  }
}

export const ledService = LEDService.getInstance();