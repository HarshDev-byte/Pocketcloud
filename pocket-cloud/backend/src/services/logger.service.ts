import { db } from '../db';

// Import modules using eval to avoid TypeScript module resolution issues
const fs = eval('require')('fs');
const path = eval('require')('path');

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  service: string;
  userId?: string;
  message: string;
  meta?: any;
}

export interface LogQuery {
  level?: LogLevel;
  service?: string;
  userId?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

export class LoggerService {
  private static readonly LOG_DIR = eval('process.env.LOG_DIR') || path.join(eval('process.cwd()') || '.', 'logs');
  private static readonly MAX_LOG_AGE_DAYS = 14;
  private static readonly MAX_DB_LOGS = 10000; // Keep last 10k logs in DB

  /**
   * Initialize logger service
   */
  public static initialize(): void {
    // Ensure log directory exists
    if (!fs.existsSync(this.LOG_DIR)) {
      fs.mkdirSync(this.LOG_DIR, { recursive: true });
    }

    // Clean old logs on startup
    this.cleanOldLogs();
  }

  /**
   * Log a message
   */
  public static log(level: LogLevel, service: string, message: string, userId?: string, meta?: any): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      service,
      userId,
      message,
      meta
    };

    // Write to file
    this.writeToFile(entry);

    // Write to database
    this.writeToDatabase(entry);

    // Write errors to journald as well
    if (level === 'error') {
      console.error(`[${service}] ${message}`, meta || '');
    }
  }

  /**
   * Convenience methods for different log levels
   */
  public static debug(service: string, message: string, userId?: string, meta?: any): void {
    this.log('debug', service, message, userId, meta);
  }

  public static info(service: string, message: string, userId?: string, meta?: any): void {
    this.log('info', service, message, userId, meta);
  }

  public static warn(service: string, message: string, userId?: string, meta?: any): void {
    this.log('warn', service, message, userId, meta);
  }

  public static error(service: string, message: string, userId?: string, meta?: any): void {
    this.log('error', service, message, userId, meta);
  }

  /**
   * Query logs from database
   */
  public static queryLogs(query: LogQuery = {}): LogEntry[] {
    try {
      let sql = 'SELECT * FROM log_entries WHERE 1=1';
      const params: any[] = [];

      if (query.level) {
        sql += ' AND level = ?';
        params.push(query.level);
      }

      if (query.service) {
        sql += ' AND service = ?';
        params.push(query.service);
      }

      if (query.userId) {
        sql += ' AND user_id = ?';
        params.push(query.userId);
      }

      if (query.startTime) {
        sql += ' AND timestamp >= ?';
        params.push(query.startTime);
      }

      if (query.endTime) {
        sql += ' AND timestamp <= ?';
        params.push(query.endTime);
      }

      sql += ' ORDER BY timestamp DESC';

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
      }

      if (query.offset) {
        sql += ' OFFSET ?';
        params.push(query.offset);
      }

      const database = db();
      const stmt = database.prepare(sql);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => ({
        timestamp: row.timestamp,
        level: row.level,
        service: row.service,
        userId: row.user_id,
        message: row.message,
        meta: row.meta ? JSON.parse(row.meta) : undefined
      }));

    } catch (error) {
      console.error('Failed to query logs:', error);
      return [];
    }
  }

  /**
   * Get log file content for download
   */
  public static getLogFileContent(date?: string): string {
    try {
      const logDate = date || new Date().toISOString().split('T')[0];
      const logFile = path.join(this.LOG_DIR, `app-${logDate}.log`);
      
      if (!fs.existsSync(logFile)) {
        return '';
      }

      return fs.readFileSync(logFile, 'utf8');

    } catch (error) {
      console.error('Failed to read log file:', error);
      return '';
    }
  }

  /**
   * Clear old logs from database
   */
  public static clearOldLogs(): number {
    try {
      // Keep only the most recent logs
      const database = db();
      const deleteStmt = database.prepare(`
        DELETE FROM log_entries 
        WHERE id NOT IN (
          SELECT id FROM log_entries 
          ORDER BY timestamp DESC 
          LIMIT ?
        )
      `);
      
      const result = deleteStmt.run(this.MAX_DB_LOGS);
      return result.changes;

    } catch (error) {
      console.error('Failed to clear old logs:', error);
      return 0;
    }
  }

  /**
   * Write log entry to daily file
   */
  private static writeToFile(entry: LogEntry): void {
    try {
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      const logFile = path.join(this.LOG_DIR, `app-${date}.log`);
      
      const logLine = JSON.stringify({
        timestamp: new Date(entry.timestamp).toISOString(),
        level: entry.level,
        service: entry.service,
        userId: entry.userId,
        message: entry.message,
        meta: entry.meta
      }) + '\n';

      fs.appendFileSync(logFile, logLine);

    } catch (error) {
      console.error('Failed to write log to file:', error);
    }
  }

  /**
   * Write log entry to database
   */
  private static writeToDatabase(entry: LogEntry): void {
    try {
      const database = db();
      const stmt = database.prepare(`
        INSERT INTO log_entries (timestamp, level, service, user_id, message, meta, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        entry.timestamp,
        entry.level,
        entry.service,
        entry.userId || null,
        entry.message,
        entry.meta ? JSON.stringify(entry.meta) : null,
        Date.now()
      );

    } catch (error) {
      console.error('Failed to write log to database:', error);
    }
  }

  /**
   * Clean old log files
   */
  private static cleanOldLogs(): void {
    try {
      if (!fs.existsSync(this.LOG_DIR)) {
        return;
      }

      const files = fs.readdirSync(this.LOG_DIR);
      const cutoffTime = Date.now() - (this.MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000);

      for (const file of files) {
        if (file.startsWith('app-') && file.endsWith('.log')) {
          const filePath = path.join(this.LOG_DIR, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            fs.unlinkSync(filePath);
            console.log(`Deleted old log file: ${file}`);
          }
        }
      }

    } catch (error) {
      console.error('Failed to clean old logs:', error);
    }
  }

  /**
   * Get available log services
   */
  public static getLogServices(): string[] {
    try {
      const database = db();
      const stmt = database.prepare('SELECT DISTINCT service FROM log_entries ORDER BY service');
      const rows = stmt.all() as { service: string }[];
      return rows.map(row => row.service);

    } catch (error) {
      console.error('Failed to get log services:', error);
      return [];
    }
  }

  /**
   * Get log statistics
   */
  public static getLogStats(): { total: number; byLevel: Record<LogLevel, number> } {
    try {
      const database = db();
      const totalStmt = database.prepare('SELECT COUNT(*) as count FROM log_entries');
      const total = (totalStmt.get() as { count: number }).count;

      const levelStmt = database.prepare('SELECT level, COUNT(*) as count FROM log_entries GROUP BY level');
      const levelRows = levelStmt.all() as { level: LogLevel; count: number }[];
      
      const byLevel: Record<LogLevel, number> = {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0
      };

      levelRows.forEach(row => {
        byLevel[row.level] = row.count;
      });

      return { total, byLevel };

    } catch (error) {
      console.error('Failed to get log stats:', error);
      return { 
        total: 0, 
        byLevel: { debug: 0, info: 0, warn: 0, error: 0 } 
      };
    }
  }
}