/**
 * Terminal progress bar implementation
 * Pure ANSI escape codes, no external dependencies
 */

import { WriteStream } from 'tty';

export interface ProgressOptions {
  total: number;
  width?: number;
  complete?: string;
  incomplete?: string;
  renderThrottle?: number;
  clear?: boolean;
}

export class ProgressBar {
  private total: number;
  private current: number = 0;
  private width: number;
  private completeChar: string;
  private incomplete: string;
  private renderThrottle: number;
  private clear: boolean;
  private lastRender: number = 0;
  private startTime: number;
  private stream: WriteStream;

  constructor(format: string, options: ProgressOptions) {
    this.total = options.total;
    this.width = options.width || 40;
    this.completeChar = options.complete || '█';
    this.incomplete = options.incomplete || '░';
    this.renderThrottle = options.renderThrottle || 16; // ~60fps
    this.clear = options.clear !== false;
    this.startTime = Date.now();
    this.stream = process.stderr as WriteStream;
  }

  public tick(delta: number = 1, tokens?: Record<string, any>): void {
    this.current += delta;
    
    if (this.current > this.total) {
      this.current = this.total;
    }

    const now = Date.now();
    if (now - this.lastRender < this.renderThrottle && this.current < this.total) {
      return;
    }

    this.render(tokens);
    this.lastRender = now;
  }

  public update(current: number, tokens?: Record<string, any>): void {
    this.current = Math.min(current, this.total);
    this.render(tokens);
  }

  private render(tokens?: Record<string, any>): void {
    if (!this.stream.isTTY) {
      return;
    }

    const percentage = Math.floor((this.current / this.total) * 100);
    const completed = Math.floor((this.current / this.total) * this.width);
    const remaining = this.width - completed;

    // Build progress bar
    const bar = this.completeChar.repeat(completed) + this.incomplete.repeat(remaining);
    
    // Calculate speed and ETA
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.current / elapsed;
    const eta = rate > 0 ? (this.total - this.current) / rate : 0;

    // Format tokens
    const defaultTokens = {
      bar,
      current: this.formatBytes(this.current),
      total: this.formatBytes(this.total),
      percent: percentage,
      rate: this.formatSpeed(rate),
      eta: this.formatTime(eta)
    };

    const allTokens = { ...defaultTokens, ...tokens };

    // Build output string
    let output = `[${bar}] ${percentage}%`;
    
    if (allTokens.rate) {
      output += ` · ${allTokens.rate}`;
    }
    
    if (eta > 0 && eta < Infinity) {
      output += ` · ${this.formatTime(eta)} remaining`;
    }

    // Clear line and write
    this.stream.write('\r\x1b[K' + output);

    if (this.current >= this.total) {
      this.stream.write('\n');
    }
  }

  public complete(): void {
    this.current = this.total;
    this.render();
  }

  public terminate(): void {
    if (this.clear && this.stream.isTTY) {
      this.stream.write('\r\x1b[K');
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private formatSpeed(bytesPerSecond: number): string {
    return this.formatBytes(bytesPerSecond) + '/s';
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return Math.round(seconds) + 's';
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${minutes}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }
}

// Simple spinner for indeterminate progress
export class Spinner {
  private frames: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: NodeJS.Timeout | null = null;
  private frameIndex: number = 0;
  private stream: WriteStream;
  private text: string;

  constructor(text: string = '') {
    this.text = text;
    this.stream = process.stderr as WriteStream;
  }

  public start(): void {
    if (!this.stream.isTTY) {
      if (this.text) {
        this.stream.write(this.text + '\n');
      }
      return;
    }

    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      this.stream.write(`\r${frame} ${this.text}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  public stop(finalText?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.stream.isTTY) {
      this.stream.write('\r\x1b[K');
      if (finalText) {
        this.stream.write(finalText + '\n');
      }
    }
  }

  public setText(text: string): void {
    this.text = text;
  }
}