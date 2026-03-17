import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const LOG_DIR = process.env.LOG_DIR || '/mnt/pocketcloud/logs';

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogMeta {
  [key: string]: any;
}

class Logger {
  private getTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  private getLogFileName(): string {
    const date = new Date().toISOString().slice(0, 10);
    return join(LOG_DIR, `app-${date}.log`);
  }

  private sanitizeMeta(meta: LogMeta): LogMeta {
    const sanitized = { ...meta };
    
    // Remove sensitive fields
    const sensitiveKeys = ['password', 'token', 'secret', 'hash', 'authorization'];
    
    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  private log(level: LogLevel, message: string, meta?: LogMeta): void {
    const timestamp = this.getTimestamp();
    const sanitizedMeta = meta ? this.sanitizeMeta(meta) : {};
    const metaStr = Object.keys(sanitizedMeta).length > 0 ? ` ${JSON.stringify(sanitizedMeta)}` : '';
    const logLine = `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${message}${metaStr}\n`;

    // Write to stdout
    process.stdout.write(logLine);

    // Write to file
    try {
      const logFile = this.getLogFileName();
      appendFileSync(logFile, logLine);
    } catch (error) {
      // Fallback to stderr if file write fails
      process.stderr.write(`Logger error: ${error}\n`);
    }
  }

  info(message: string, meta?: LogMeta): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: LogMeta): void {
    this.log('error', message, meta);
  }

  debug(message: string, meta?: LogMeta): void {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, meta);
    }
  }
}

export const logger = new Logger();