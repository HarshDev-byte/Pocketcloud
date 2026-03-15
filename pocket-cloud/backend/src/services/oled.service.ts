import { EventEmitter } from 'events';
import { logger } from './logger.service.js';

// OLED display configuration
const OLED_CONFIG = {
  WIDTH: 128,
  HEIGHT: 64,
  I2C_ADDRESS: 0x3C,
  I2C_BUS: 1
};

// Screen definitions
export enum ScreenType {
  DEFAULT = 'default',
  TRANSFERS = 'transfers', 
  WIFI = 'wifi',
  QR_CODE = 'qr_code'
}

interface SystemInfo {
  ipAddress: string;
  connectedUsers: number;
  filesTransferredToday: number;
  storageUsed: number;
  storageTotal: number;
  cpuTemp: number;
  ramUsed: number;
  ramTotal: number;
  uptime: number;
  wifiSSID?: string;
  wifiClients: number;
  wifiSignal?: number;
  activeUploads: number;
  activeDownloads: number;
  uploadSpeed: number; // MB/s
  downloadSpeed: number; // MB/s
}

export class OLEDService extends EventEmitter {
  private static instance: OLEDService;
  private oled: any;
  private font: any;
  private isInitialized = false;
  private currentScreen: ScreenType = ScreenType.DEFAULT;
  private updateInterval?: NodeJS.Timeout;
  private displayEnabled = true;
  private systemInfo: SystemInfo = {
    ipAddress: '192.168.4.1',
    connectedUsers: 0,
    filesTransferredToday: 0,
    storageUsed: 0,
    storageTotal: 1000,
    cpuTemp: 0,
    ramUsed: 0,
    ramTotal: 4096,
    uptime: 0,
    wifiClients: 0,
    activeUploads: 0,
    activeDownloads: 0,
    uploadSpeed: 0,
    downloadSpeed: 0
  };

  constructor() {
    super();
  }

  static getInstance(): OLEDService {
    if (!OLEDService.instance) {
      OLEDService.instance = new OLEDService();
    }
    return OLEDService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Import OLED library dynamically
      const oledModule = await import('oled-i2c-bus');
      const i2cBus = await import('i2c-bus');
      
      // Initialize I2C bus
      const bus = i2cBus.openSync(OLED_CONFIG.I2C_BUS);
      
      // Initialize OLED display
      this.oled = new oledModule({
        width: OLED_CONFIG.WIDTH,
        height: OLED_CONFIG.HEIGHT,
        address: OLED_CONFIG.I2C_ADDRESS,
        bus: bus
      });

      // Initialize display
      await this.oled.turnOnDisplay();
      await this.oled.clearDisplay();
      
      // Load font
      this.font = oledModule.font;
      
      this.isInitialized = true;
      logger.info('OLED service initialized');
      
      // Start update loop
      this.startUpdateLoop();
      
      // Show startup message
      this.showStartupMessage();
      
    } catch (error) {
      logger.warn('Failed to initialize OLED service (hardware not available):', error);
      // Continue without OLED functionality
    }
  }

  private startUpdateLoop(): void {
    // Update display every 5 seconds
    this.updateInterval = setInterval(() => {
      if (this.displayEnabled) {
        this.updateDisplay();
      }
    }, 5000);
  }

  private async showStartupMessage(): Promise<void> {
    if (!this.isInitialized) return;
    
    try {
      await this.oled.clearDisplay();
      
      // Center "PocketCloud Drive" text
      await this.oled.setCursor(10, 20);
      await this.oled.writeString(this.font, 1, 'PocketCloud Drive', 1, true);
      
      await this.oled.setCursor(30, 35);
      await this.oled.writeString(this.font, 1, 'Starting...', 1, true);
      
      // Wait 3 seconds then switch to default screen
      setTimeout(() => {
        this.setScreen(ScreenType.DEFAULT);
      }, 3000);
      
    } catch (error) {
      logger.warn('Error showing startup message:', error);
    }
  }
  updateSystemInfo(info: Partial<SystemInfo>): void {
    this.systemInfo = { ...this.systemInfo, ...info };
    
    // Trigger immediate update if display is enabled
    if (this.displayEnabled && this.isInitialized) {
      this.updateDisplay();
    }
  }

  setScreen(screen: ScreenType): void {
    if (this.currentScreen === screen) return;
    
    this.currentScreen = screen;
    logger.debug(`OLED screen changed to: ${screen}`);
    
    if (this.displayEnabled) {
      this.updateDisplay();
    }
    
    this.emit('screenChanged', screen);
  }

  cycleScreen(): void {
    const screens = Object.values(ScreenType);
    const currentIndex = screens.indexOf(this.currentScreen);
    const nextIndex = (currentIndex + 1) % screens.length;
    this.setScreen(screens[nextIndex]);
  }

  private async updateDisplay(): Promise<void> {
    if (!this.isInitialized) return;
    
    try {
      await this.oled.clearDisplay();
      
      switch (this.currentScreen) {
        case ScreenType.DEFAULT:
          await this.drawDefaultScreen();
          break;
        case ScreenType.TRANSFERS:
          await this.drawTransfersScreen();
          break;
        case ScreenType.WIFI:
          await this.drawWifiScreen();
          break;
        case ScreenType.QR_CODE:
          await this.drawQRScreen();
          break;
      }
      
    } catch (error) {
      logger.warn('Error updating OLED display:', error);
    }
  }

  private async drawDefaultScreen(): Promise<void> {
    // Line 1: Title
    await this.oled.setCursor(0, 0);
    await this.oled.writeString(this.font, 1, 'PocketCloud Drive', 1, true);
    
    // Line 2: IP Address
    await this.oled.setCursor(0, 12);
    await this.oled.writeString(this.font, 1, this.systemInfo.ipAddress, 1, true);
    
    // Line 3: Separator
    await this.drawLine(0, 22, 127, 22);
    
    // Line 4: Activity
    const activityText = `${this.systemInfo.connectedUsers} users · ${this.systemInfo.filesTransferredToday} files today`;
    await this.oled.setCursor(0, 26);
    await this.oled.writeString(this.font, 1, activityText, 1, true);
    
    // Line 5: Storage bar
    const storagePercent = (this.systemInfo.storageUsed / this.systemInfo.storageTotal) * 100;
    const storageText = `${Math.round(this.systemInfo.storageTotal - this.systemInfo.storageUsed)}GB free`;
    
    await this.oled.setCursor(0, 36);
    await this.drawProgressBar(0, 36, 80, 8, storagePercent);
    await this.oled.setCursor(85, 36);
    await this.oled.writeString(this.font, 1, storageText, 1, true);
    
    // Line 6: Separator
    await this.drawLine(0, 46, 127, 46);
    
    // Line 7: Hardware stats
    const hwText = `CPU: ${this.systemInfo.cpuTemp}°C  RAM: ${(this.systemInfo.ramUsed/1024).toFixed(1)}/${(this.systemInfo.ramTotal/1024).toFixed(0)}GB`;
    await this.oled.setCursor(0, 50);
    await this.oled.writeString(this.font, 1, hwText, 1, true);
    
    // Line 8: Uptime
    const uptimeText = `Up: ${this.formatUptime(this.systemInfo.uptime)}`;
    await this.oled.setCursor(0, 58);
    await this.oled.writeString(this.font, 1, uptimeText, 1, true);
  }

  private async drawTransfersScreen(): Promise<void> {
    // Title
    await this.oled.setCursor(0, 0);
    await this.oled.writeString(this.font, 1, 'Transfer Activity', 1, true);
    
    await this.drawLine(0, 10, 127, 10);
    
    // Upload stats
    await this.oled.setCursor(0, 16);
    await this.oled.writeString(this.font, 1, `Uploads: ${this.systemInfo.activeUploads}`, 1, true);
    
    await this.oled.setCursor(0, 26);
    const uploadSpeedText = this.systemInfo.uploadSpeed > 0 ? 
      `↑ ${this.systemInfo.uploadSpeed.toFixed(1)} MB/s` : '↑ Idle';
    await this.oled.writeString(this.font, 1, uploadSpeedText, 1, true);
    
    // Download stats
    await this.oled.setCursor(0, 36);
    await this.oled.writeString(this.font, 1, `Downloads: ${this.systemInfo.activeDownloads}`, 1, true);
    
    await this.oled.setCursor(0, 46);
    const downloadSpeedText = this.systemInfo.downloadSpeed > 0 ? 
      `↓ ${this.systemInfo.downloadSpeed.toFixed(1)} MB/s` : '↓ Idle';
    await this.oled.writeString(this.font, 1, downloadSpeedText, 1, true);
    
    // Total activity
    await this.oled.setCursor(0, 56);
    await this.oled.writeString(this.font, 1, `Files today: ${this.systemInfo.filesTransferredToday}`, 1, true);
  }

  private async drawWifiScreen(): Promise<void> {
    // Title
    await this.oled.setCursor(0, 0);
    await this.oled.writeString(this.font, 1, 'WiFi Information', 1, true);
    
    await this.drawLine(0, 10, 127, 10);
    
    // SSID
    await this.oled.setCursor(0, 16);
    const ssidText = this.systemInfo.wifiSSID || 'PocketCloud-AP';
    await this.oled.writeString(this.font, 1, `SSID: ${ssidText}`, 1, true);
    
    // Signal strength (if available)
    if (this.systemInfo.wifiSignal !== undefined) {
      await this.oled.setCursor(0, 26);
      await this.oled.writeString(this.font, 1, `Signal: ${this.systemInfo.wifiSignal}%`, 1, true);
    }
    
    // Connected clients
    await this.oled.setCursor(0, 36);
    await this.oled.writeString(this.font, 1, `Clients: ${this.systemInfo.wifiClients}`, 1, true);
    
    // IP Address
    await this.oled.setCursor(0, 46);
    await this.oled.writeString(this.font, 1, `IP: ${this.systemInfo.ipAddress}`, 1, true);
    
    // Instructions
    await this.oled.setCursor(0, 56);
    await this.oled.writeString(this.font, 1, 'Hold WiFi btn for pwd', 1, true);
  }
  private async drawQRScreen(): Promise<void> {
    // Title
    await this.oled.setCursor(0, 0);
    await this.oled.writeString(this.font, 1, 'Scan to Connect', 1, true);
    
    await this.drawLine(0, 10, 127, 10);
    
    // QR Code placeholder (would need QR code library)
    // For now, show connection info
    await this.oled.setCursor(10, 20);
    await this.oled.writeString(this.font, 1, '█████████████', 1, true);
    await this.oled.setCursor(10, 28);
    await this.oled.writeString(this.font, 1, '█ QR CODE █', 1, true);
    await this.oled.setCursor(10, 36);
    await this.oled.writeString(this.font, 1, '█████████████', 1, true);
    
    // URL below QR code
    await this.oled.setCursor(0, 50);
    await this.oled.writeString(this.font, 1, `http://${this.systemInfo.ipAddress}`, 1, true);
  }

  private async drawProgressBar(x: number, y: number, width: number, height: number, percent: number): Promise<void> {
    // Draw border
    await this.drawRect(x, y, width, height);
    
    // Fill based on percentage
    const fillWidth = Math.round((width - 2) * (percent / 100));
    if (fillWidth > 0) {
      await this.fillRect(x + 1, y + 1, fillWidth, height - 2);
    }
  }

  private async drawLine(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    if (!this.oled) return;
    
    // Simple horizontal line implementation
    if (y1 === y2) {
      for (let x = x1; x <= x2; x++) {
        await this.oled.drawPixel([x, y1], 1);
      }
    }
  }

  private async drawRect(x: number, y: number, width: number, height: number): Promise<void> {
    if (!this.oled) return;
    
    // Draw rectangle outline
    for (let i = 0; i < width; i++) {
      await this.oled.drawPixel([x + i, y], 1);
      await this.oled.drawPixel([x + i, y + height - 1], 1);
    }
    for (let i = 0; i < height; i++) {
      await this.oled.drawPixel([x, y + i], 1);
      await this.oled.drawPixel([x + width - 1, y + i], 1);
    }
  }

  private async fillRect(x: number, y: number, width: number, height: number): Promise<void> {
    if (!this.oled) return;
    
    // Fill rectangle
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        await this.oled.drawPixel([x + i, y + j], 1);
      }
    }
  }

  private formatUptime(seconds: number): string {
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

  setDisplayEnabled(enabled: boolean): void {
    this.displayEnabled = enabled;
    
    if (!enabled && this.isInitialized) {
      // Turn off display to prevent burn-in
      this.oled.turnOffDisplay().catch((error: any) => {
        logger.warn('Error turning off OLED display:', error);
      });
    } else if (enabled && this.isInitialized) {
      // Turn on display and update
      this.oled.turnOnDisplay().then(() => {
        this.updateDisplay();
      }).catch((error: any) => {
        logger.warn('Error turning on OLED display:', error);
      });
    }
    
    logger.debug(`OLED display ${enabled ? 'enabled' : 'disabled'}`);
  }

  isDisplayEnabled(): boolean {
    return this.displayEnabled;
  }

  getCurrentScreen(): ScreenType {
    return this.currentScreen;
  }

  async showMessage(message: string, duration: number = 5000): Promise<void> {
    if (!this.isInitialized) return;
    
    try {
      await this.oled.clearDisplay();
      
      // Center the message
      const lines = this.wrapText(message, 21); // ~21 chars per line
      const startY = Math.max(0, (64 - lines.length * 10) / 2);
      
      for (let i = 0; i < lines.length; i++) {
        await this.oled.setCursor(0, startY + i * 10);
        await this.oled.writeString(this.font, 1, lines[i], 1, true);
      }
      
      // Return to normal display after duration
      setTimeout(() => {
        this.updateDisplay();
      }, duration);
      
    } catch (error) {
      logger.warn('Error showing OLED message:', error);
    }
  }

  private wrapText(text: string, maxLength: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      if ((currentLine + word).length <= maxLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down OLED service');
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    
    if (this.isInitialized && this.oled) {
      try {
        await this.oled.clearDisplay();
        await this.oled.turnOffDisplay();
      } catch (error) {
        logger.warn('Error during OLED shutdown:', error);
      }
    }
    
    this.isInitialized = false;
  }

  // Test method
  async testDisplay(): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('OLED not initialized for testing');
      return;
    }
    
    logger.info('Starting OLED test sequence');
    
    const screens = Object.values(ScreenType);
    
    for (const screen of screens) {
      logger.info(`Testing screen: ${screen}`);
      this.setScreen(screen);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Return to default
    this.setScreen(ScreenType.DEFAULT);
    logger.info('OLED test sequence completed');
  }
}

export const oledService = OLEDService.getInstance();