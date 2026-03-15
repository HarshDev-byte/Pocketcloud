import { EventEmitter } from 'events';
import { logger } from './logger.service.js';
import { oledService } from './oled.service.js';

// GPIO pin definitions
const BUTTON_PINS = {
  POWER: 3,    // Built-in power button
  WIFI: 26     // Optional WiFi button
};

// Button press types
export enum ButtonPress {
  SHORT = 'short',      // < 2 seconds
  LONG = 'long',        // 2-5 seconds  
  VERY_LONG = 'very_long' // > 10 seconds
}

interface ButtonState {
  pressed: boolean;
  pressStartTime: number;
  lastPressTime: number;
}

export class ButtonService extends EventEmitter {
  private static instance: ButtonService;
  private pigpio: any;
  private isInitialized = false;
  private buttonStates: Map<number, ButtonState> = new Map();
  private pressTimers: Map<number, NodeJS.Timeout> = new Map();
  private shutdownTimer?: NodeJS.Timeout;
  private wifiPasswordTimer?: NodeJS.Timeout;

  constructor() {
    super();
    
    // Initialize button states
    Object.values(BUTTON_PINS).forEach(pin => {
      this.buttonStates.set(pin, {
        pressed: false,
        pressStartTime: 0,
        lastPressTime: 0
      });
    });
  }

  static getInstance(): ButtonService {
    if (!ButtonService.instance) {
      ButtonService.instance = new ButtonService();
    }
    return ButtonService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Import pigpio dynamically
      const pigpioModule = await import('pigpio');
      this.pigpio = pigpioModule.Gpio;

      // Setup button GPIO pins
      this.setupButtons();
      
      this.isInitialized = true;
      logger.info('Button service initialized');
      
    } catch (error) {
      logger.warn('Failed to initialize button service (pigpio not available):', error);
      // Continue without button functionality
    }
  }

  private setupButtons(): void {
    if (!this.pigpio) return;

    // Setup power button (GPIO 3)
    try {
      const powerButton = new this.pigpio(BUTTON_PINS.POWER, {
        mode: this.pigpio.INPUT,
        pullUpDown: this.pigpio.PUD_UP,
        edge: this.pigpio.EITHER_EDGE
      });

      powerButton.on('interrupt', (level: number) => {
        this.handleButtonInterrupt(BUTTON_PINS.POWER, level);
      });

      logger.info('Power button (GPIO 3) initialized');
    } catch (error) {
      logger.warn('Failed to setup power button:', error);
    }

    // Setup WiFi button (GPIO 26) if available
    try {
      const wifiButton = new this.pigpio(BUTTON_PINS.WIFI, {
        mode: this.pigpio.INPUT,
        pullUpDown: this.pigpio.PUD_UP,
        edge: this.pigpio.EITHER_EDGE
      });

      wifiButton.on('interrupt', (level: number) => {
        this.handleButtonInterrupt(BUTTON_PINS.WIFI, level);
      });

      logger.info('WiFi button (GPIO 26) initialized');
    } catch (error) {
      logger.debug('WiFi button not available (optional)');
    }
  }

  private handleButtonInterrupt(pin: number, level: number): void {
    const now = Date.now();
    const state = this.buttonStates.get(pin);
    if (!state) return;

    if (level === 0) {
      // Button pressed (active low)
      state.pressed = true;
      state.pressStartTime = now;
      
      logger.debug(`Button ${pin} pressed`);
      
      // Clear any existing timer
      const existingTimer = this.pressTimers.get(pin);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      // Set timer for very long press detection (10 seconds)
      const timer = setTimeout(() => {
        if (state.pressed) {
          this.handleButtonPress(pin, ButtonPress.VERY_LONG);
        }
      }, 10000);
      
      this.pressTimers.set(pin, timer);
      
    } else {
      // Button released
      if (state.pressed) {
        const pressDuration = now - state.pressStartTime;
        state.pressed = false;
        state.lastPressTime = now;
        
        // Clear timer
        const timer = this.pressTimers.get(pin);
        if (timer) {
          clearTimeout(timer);
          this.pressTimers.delete(pin);
        }
        
        logger.debug(`Button ${pin} released after ${pressDuration}ms`);
        
        // Determine press type
        let pressType: ButtonPress;
        if (pressDuration < 2000) {
          pressType = ButtonPress.SHORT;
        } else if (pressDuration < 5000) {
          pressType = ButtonPress.LONG;
        } else {
          pressType = ButtonPress.VERY_LONG;
        }
        
        this.handleButtonPress(pin, pressType);
      }
    }
  }

  private handleButtonPress(pin: number, pressType: ButtonPress): void {
    logger.info(`Button ${pin} ${pressType} press detected`);
    
    if (pin === BUTTON_PINS.POWER) {
      this.handlePowerButton(pressType);
    } else if (pin === BUTTON_PINS.WIFI) {
      this.handleWifiButton(pressType);
    }
    
    this.emit('buttonPress', { pin, pressType });
  }
  private handlePowerButton(pressType: ButtonPress): void {
    switch (pressType) {
      case ButtonPress.SHORT:
        // Toggle display on/off (prevent OLED burn-in)
        const currentState = oledService.isDisplayEnabled();
        oledService.setDisplayEnabled(!currentState);
        logger.info(`Display ${currentState ? 'disabled' : 'enabled'} via power button`);
        break;
        
      case ButtonPress.LONG:
        // Graceful shutdown sequence
        this.initiateGracefulShutdown();
        break;
        
      case ButtonPress.VERY_LONG:
        // Emergency shutdown (immediate)
        this.initiateEmergencyShutdown();
        break;
    }
  }

  private handleWifiButton(pressType: ButtonPress): void {
    switch (pressType) {
      case ButtonPress.SHORT:
        // Show WiFi password on OLED for 30 seconds
        this.showWifiPassword();
        break;
        
      case ButtonPress.LONG:
        // Reset WiFi password and restart hostapd
        this.resetWifiPassword();
        break;
        
      case ButtonPress.VERY_LONG:
        // Cycle through OLED screens
        oledService.cycleScreen();
        break;
    }
  }

  private async initiateGracefulShutdown(): Promise<void> {
    logger.warn('Graceful shutdown initiated via power button');
    
    // Show shutdown message on OLED
    await oledService.showMessage('Shutting down in 3s...', 3000);
    
    // Import LED service dynamically to avoid circular dependency
    try {
      const { ledService } = await import('./led.service.js');
      ledService.setStatus('shutdown' as any);
    } catch (error) {
      logger.debug('LED service not available for shutdown indication');
    }
    
    // Set 3-second countdown
    this.shutdownTimer = setTimeout(async () => {
      try {
        // Graceful shutdown
        await this.performGracefulShutdown();
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        this.performEmergencyShutdown();
      }
    }, 3000);
    
    this.emit('shutdownInitiated', { type: 'graceful', countdown: 3 });
  }

  private initiateEmergencyShutdown(): void {
    logger.error('Emergency shutdown initiated via power button');
    
    // Show emergency message
    oledService.showMessage('Emergency shutdown!', 1000);
    
    // Immediate shutdown
    setTimeout(() => {
      this.performEmergencyShutdown();
    }, 1000);
    
    this.emit('shutdownInitiated', { type: 'emergency', countdown: 1 });
  }

  private async performGracefulShutdown(): Promise<void> {
    logger.info('Performing graceful shutdown');
    
    try {
      // Import services dynamically
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Stop PocketCloud services gracefully
      await execAsync('sudo systemctl stop pocketcloud-backend');
      await execAsync('sudo systemctl stop pocketcloud-gpio');
      
      // Sync filesystem
      await execAsync('sync');
      
      // Shutdown system
      await execAsync('sudo shutdown -h now');
      
    } catch (error) {
      logger.error('Graceful shutdown failed, falling back to emergency:', error);
      this.performEmergencyShutdown();
    }
  }

  private async performEmergencyShutdown(): Promise<void> {
    logger.error('Performing emergency shutdown');
    
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Force immediate shutdown
      await execAsync('sudo shutdown -h now');
      
    } catch (error) {
      logger.error('Emergency shutdown failed:', error);
      // Last resort - exit process
      process.exit(1);
    }
  }

  private async showWifiPassword(): Promise<void> {
    logger.info('Showing WiFi password via WiFi button');
    
    try {
      // Read WiFi password from hostapd config
      const password = await this.getWifiPassword();
      
      if (password) {
        await oledService.showMessage(`WiFi Password:\n${password}`, 30000);
        
        // Clear password timer if it exists
        if (this.wifiPasswordTimer) {
          clearTimeout(this.wifiPasswordTimer);
        }
        
        // Hide password after 30 seconds
        this.wifiPasswordTimer = setTimeout(() => {
          oledService.updateDisplay();
        }, 30000);
        
      } else {
        await oledService.showMessage('WiFi password not found', 3000);
      }
      
    } catch (error) {
      logger.error('Failed to show WiFi password:', error);
      await oledService.showMessage('Error reading WiFi config', 3000);
    }
    
    this.emit('wifiPasswordShown');
  }

  private async getWifiPassword(): Promise<string | null> {
    try {
      const { readFile } = await import('fs/promises');
      
      // Read hostapd configuration
      const configPath = '/etc/hostapd/hostapd.conf';
      const config = await readFile(configPath, 'utf8');
      
      // Extract password
      const passwordMatch = config.match(/wpa_passphrase=(.+)/);
      return passwordMatch ? passwordMatch[1].trim() : null;
      
    } catch (error) {
      logger.warn('Could not read WiFi password from hostapd config:', error);
      return null;
    }
  }

  private async resetWifiPassword(): Promise<void> {
    logger.warn('WiFi password reset initiated via WiFi button');
    
    try {
      await oledService.showMessage('Resetting WiFi...', 5000);
      
      // Generate new random password
      const newPassword = this.generateRandomPassword();
      
      // Update hostapd configuration
      await this.updateWifiPassword(newPassword);
      
      // Restart hostapd service
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      await execAsync('sudo systemctl restart hostapd');
      
      // Show new password
      await oledService.showMessage(`New WiFi Password:\n${newPassword}`, 30000);
      
      logger.info('WiFi password reset successfully');
      
    } catch (error) {
      logger.error('Failed to reset WiFi password:', error);
      await oledService.showMessage('WiFi reset failed', 3000);
    }
    
    this.emit('wifiPasswordReset');
  }

  private generateRandomPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return password;
  }

  private async updateWifiPassword(newPassword: string): Promise<void> {
    try {
      const { readFile, writeFile } = await import('fs/promises');
      
      const configPath = '/etc/hostapd/hostapd.conf';
      let config = await readFile(configPath, 'utf8');
      
      // Update password in config
      config = config.replace(/wpa_passphrase=.+/, `wpa_passphrase=${newPassword}`);
      
      await writeFile(configPath, config, 'utf8');
      
    } catch (error) {
      throw new Error(`Failed to update WiFi password: ${error}`);
    }
  }
  cancelShutdown(): void {
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = undefined;
      logger.info('Shutdown cancelled');
      
      oledService.showMessage('Shutdown cancelled', 2000);
      this.emit('shutdownCancelled');
    }
  }

  getButtonState(pin: number): ButtonState | undefined {
    return this.buttonStates.get(pin);
  }

  isButtonPressed(pin: number): boolean {
    const state = this.buttonStates.get(pin);
    return state ? state.pressed : false;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down button service');
    
    // Clear all timers
    this.pressTimers.forEach(timer => clearTimeout(timer));
    this.pressTimers.clear();
    
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = undefined;
    }
    
    if (this.wifiPasswordTimer) {
      clearTimeout(this.wifiPasswordTimer);
      this.wifiPasswordTimer = undefined;
    }
    
    // Cleanup GPIO
    if (this.isInitialized && this.pigpio) {
      try {
        Object.values(BUTTON_PINS).forEach(pin => {
          try {
            const gpio = new this.pigpio(pin, { mode: this.pigpio.INPUT });
            gpio.removeAllListeners();
          } catch (error) {
            logger.debug(`GPIO ${pin} cleanup skipped:`, error);
          }
        });
      } catch (error) {
        logger.warn('Error during button GPIO cleanup:', error);
      }
    }
    
    this.isInitialized = false;
  }

  // Test methods
  simulateButtonPress(pin: number, pressType: ButtonPress): void {
    logger.info(`Simulating ${pressType} press on button ${pin}`);
    this.handleButtonPress(pin, pressType);
  }

  testButtons(): void {
    logger.info('Starting button test sequence');
    
    // Test power button
    setTimeout(() => {
      logger.info('Testing power button short press (display toggle)');
      this.simulateButtonPress(BUTTON_PINS.POWER, ButtonPress.SHORT);
    }, 1000);
    
    setTimeout(() => {
      logger.info('Testing WiFi button short press (show password)');
      this.simulateButtonPress(BUTTON_PINS.WIFI, ButtonPress.SHORT);
    }, 3000);
    
    setTimeout(() => {
      logger.info('Testing WiFi button very long press (cycle screens)');
      this.simulateButtonPress(BUTTON_PINS.WIFI, ButtonPress.VERY_LONG);
    }, 6000);
    
    logger.info('Button test sequence started (WARNING: Do not test shutdown buttons!)');
  }

  // Status methods for monitoring
  getStatus() {
    return {
      initialized: this.isInitialized,
      buttons: Object.fromEntries(
        Array.from(this.buttonStates.entries()).map(([pin, state]) => [
          pin, {
            pressed: state.pressed,
            lastPress: state.lastPressTime,
            pressDuration: state.pressed ? Date.now() - state.pressStartTime : 0
          }
        ])
      ),
      shutdownPending: !!this.shutdownTimer,
      wifiPasswordVisible: !!this.wifiPasswordTimer
    };
  }
}

export const buttonService = ButtonService.getInstance();