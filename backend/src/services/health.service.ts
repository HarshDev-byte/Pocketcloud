import { db } from '../db/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { getDiskStatus } from '../utils/disk.utils';
import * as fs from 'fs';
import * as path from 'path';

interface CheckConfig {
  warn: number;
  critical: number;
  read: () => number;
  unit: string;
}

interface CheckResult {
  type: string;
  status: 'ok' | 'warn' | 'critical' | 'error';
  value: number | null;
  threshold?: number;
  unit?: string;
  error?: string;
  autoHealed?: boolean;
  healAction?: string;
}

interface HealthReport {
  overall: 'ok' | 'warn' | 'critical' | 'error';
  checks: CheckResult[];
  checkedAt: number;
}

interface HealResult {
  healed: boolean;
  action: string;
  freed?: number;
  newSize?: number;
}

export class HealthService {
  private static CHECKS: { [key: string]: CheckConfig } = {
    cpu_temp: {
      warn: 70,
      critical: 80,
      read: () => {
        try {
          const temp = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
          return parseInt(temp) / 1000;
        } catch {
          return 0; // Not available on non-Pi systems
        }
      },
      unit: '°C'
    },
    disk_usage: {
      warn: 85,
      critical: 95,
      read: () => getDiskStatus().percentUsed * 100,
      unit: '%'
    },
    memory_usage: {
      warn: 80,
      critical: 90,
      read: () => {
        try {
          const mem = fs.readFileSync('/proc/meminfo', 'utf8');
          const total = parseInt(mem.match(/MemTotal:\s+(\d+)/)?.[1] ?? '0');
          const available = parseInt(mem.match(/MemAvailable:\s+(\d+)/)?.[1] ?? '0');
          return total > 0 ? ((total - available) / total) * 100 : 0;
        } catch {
          return 0;
        }
      },
      unit: '%'
    },
    db_size: {
      warn: 512 * 1024 * 1024,   // 512MB
      critical: 1024 * 1024 * 1024,  // 1GB
      read: () => {
        try {
          return fs.statSync(process.env.DB_PATH || './data/pocketcloud.db').size;
        } catch {
          return 0;
        }
      },
      unit: 'bytes'
    },
    upload_temp_size: {
      warn: 5 * 1024 * 1024 * 1024,   // 5GB
      critical: 10 * 1024 * 1024 * 1024,  // 10GB
      read: () => {
        try {
          return this.getFolderSize(process.env.UPLOAD_TEMP_DIR || './uploads/temp');
        } catch {
          return 0;
        }
      },
      unit: 'bytes'
    },
    stalled_uploads: {
      warn: 5,
      critical: 20,
      read: () => {
        const result = db.prepare(`
          SELECT COUNT(*) as n FROM upload_sessions WHERE expires_at < ?
        `).get(Date.now()) as any;
        return result?.n || 0;
      },
      unit: 'count'
    },
    failed_media_jobs: {
      warn: 10,
      critical: 50,
      read: () => {
        try {
          const result = db.prepare(`
            SELECT COUNT(*) as n FROM media_queue WHERE status='failed'
          `).get() as any;
          return result?.n || 0;
        } catch {
          return 0; // Table might not exist
        }
      },
      unit: 'count'
    },
    orphaned_files: {
      warn: 100,
      critical: 500,
      read: () => {
        try {
          const result = db.prepare(`
            SELECT COUNT(*) as n FROM content_store WHERE ref_count <= 0
          `).get() as any;
          return result?.n || 0;
        } catch {
          return 0; // Table might not exist
        }
      },
      unit: 'count'
    }
  };

  // Run all health checks
  static async runAllChecks(): Promise<HealthReport> {
    const results: CheckResult[] = [];

    for (const [type, config] of Object.entries(this.CHECKS)) {
      try {
        const value = config.read();
        let status: 'ok' | 'warn' | 'critical' = 'ok';
        let threshold: number | undefined;

        if (value >= config.critical) {
          status = 'critical';
          threshold = config.critical;
        } else if (value >= config.warn) {
          status = 'warn';
          threshold = config.warn;
        }

        const result: CheckResult = {
          type,
          status,
          value,
          threshold,
          unit: config.unit
        };

        results.push(result);

        // Store in DB
        db.prepare(`
          INSERT INTO health_checks (id, check_type, status, value, threshold, checked_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(),
          type,
          status,
          String(value),
          threshold ? String(threshold) : null,
          Date.now()
        );

        // Auto-heal if applicable
        if (status !== 'ok') {
          const healResult = await this.attemptAutoHeal(type, status, value);
          if (healResult.healed) {
            result.autoHealed = true;
            result.healAction = healResult.action;

            // Update health check record
            db.prepare(`
              UPDATE health_checks 
              SET auto_healed = 1, heal_action = ? 
              WHERE check_type = ? AND checked_at = (
                SELECT MAX(checked_at) FROM health_checks WHERE check_type = ?
              )
            `).run(healResult.action, type, type);

            logger.info('Auto-heal successful', { 
              checkType: type, 
              action: healResult.action 
            });
          }
        }
      } catch (err: any) {
        logger.error('Health check failed', { type, error: err.message });
        results.push({
          type,
          status: 'error',
          value: null,
          error: err.message
        });
      }
    }

    // Determine overall status
    const overall = results.some(r => r.status === 'critical') ? 'critical'
      : results.some(r => r.status === 'warn') ? 'warn'
      : results.some(r => r.status === 'error') ? 'error'
      : 'ok';

    return {
      overall,
      checks: results,
      checkedAt: Date.now()
    };
  }

  // Attempt to auto-heal a problem
  static async attemptAutoHeal(checkType: string, severity: string, value: number): Promise<HealResult> {
    try {
      switch (checkType) {
        case 'stalled_uploads': {
          const { UploadService } = require('./upload.service');
          const cleaned = await UploadService.cleanStalledUploads();
          return {
            healed: true,
            action: `Cleaned ${cleaned.cleaned} stalled upload sessions`,
            freed: 0
          };
        }

        case 'failed_media_jobs': {
          const failedRecent = db.prepare(`
            SELECT * FROM media_queue 
            WHERE status='failed' AND created_at > ?
            LIMIT 10
          `).all(Date.now() - 86400000) as any[];

          for (const job of failedRecent) {
            db.prepare(`
              UPDATE media_queue 
              SET status='queued', attempts=0 
              WHERE id=?
            `).run(job.id);
          }

          return {
            healed: true,
            action: `Re-queued ${failedRecent.length} failed media jobs`
          };
        }

        case 'upload_temp_size': {
          if (severity === 'critical') {
            const { UploadService } = require('./upload.service');
            const result = await UploadService.cleanStalledUploads();
            return {
              healed: true,
              action: 'Cleaned temp upload directory',
              freed: 0
            };
          }
          return { healed: false, action: 'Monitoring only at warn level' };
        }

        case 'orphaned_files': {
          const orphans = db.prepare(`
            SELECT * FROM content_store WHERE ref_count <= 0 LIMIT 100
          `).all() as any[];

          let freedBytes = 0;
          for (const orphan of orphans) {
            try {
              if (fs.existsSync(orphan.storage_path)) {
                fs.unlinkSync(orphan.storage_path);
                freedBytes += orphan.size;
              }
            } catch (err) {
              logger.warn('Failed to delete orphaned file', { 
                path: orphan.storage_path 
              });
            }
            db.prepare(`DELETE FROM content_store WHERE checksum = ?`)
              .run(orphan.checksum);
          }

          return {
            healed: true,
            action: `Removed ${orphans.length} orphaned files`,
            freed: freedBytes
          };
        }

        case 'cpu_temp': {
          if (severity === 'critical') {
            try {
              const { MediaService } = require('./media.service');
              MediaService.pauseQueue();
              logger.warn('Auto-heal: paused media queue due to high CPU temp');
              return { healed: true, action: 'Paused media processing queue' };
            } catch {
              return { healed: false, action: 'Media service not available' };
            }
          }
          return { healed: false, action: 'Monitoring only' };
        }

        case 'db_size': {
          if (severity === 'warn') {
            const oldSize = fs.statSync(process.env.DB_PATH || './data/pocketcloud.db').size;
            db.prepare('VACUUM').run();
            const newSize = fs.statSync(process.env.DB_PATH || './data/pocketcloud.db').size;
            return {
              healed: true,
              action: 'Ran VACUUM on database',
              freed: oldSize - newSize,
              newSize
            };
          }
          return { healed: false, action: 'Critical level - manual intervention needed' };
        }

        default:
          return { healed: false, action: 'No auto-heal available for this check type' };
      }
    } catch (error: any) {
      logger.error('Auto-heal failed', { checkType, error: error.message });
      return { healed: false, action: `Auto-heal failed: ${error.message}` };
    }
  }

  // Get health check history for a specific check type
  static getHealthHistory(checkType: string, hours: number = 24): any[] {
    const since = Date.now() - (hours * 60 * 60 * 1000);
    
    return db.prepare(`
      SELECT check_type, status, value, threshold, checked_at
      FROM health_checks
      WHERE check_type = ? AND checked_at > ?
      ORDER BY checked_at ASC
    `).all(checkType, since) as any[];
  }

  // Get active incidents
  static getActiveIncidents(): any[] {
    return db.prepare(`
      SELECT * FROM health_incidents 
      WHERE status = 'active'
      ORDER BY started_at DESC
    `).all() as any[];
  }

  // Get all incidents (active and resolved)
  static getAllIncidents(limit: number = 50): any[] {
    return db.prepare(`
      SELECT * FROM health_incidents 
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit) as any[];
  }

  // Create or update incident
  static createOrUpdateIncident(checkType: string, severity: string, description: string): void {
    const existing = db.prepare(`
      SELECT * FROM health_incidents 
      WHERE check_type = ? AND status = 'active'
    `).get(checkType) as any;

    if (existing) {
      // Update existing incident
      db.prepare(`
        UPDATE health_incidents 
        SET severity = ?, description = ?
        WHERE id = ?
      `).run(severity, description, existing.id);
    } else {
      // Create new incident
      db.prepare(`
        INSERT INTO health_incidents (
          id, check_type, started_at, status, severity, description, auto_resolved
        ) VALUES (?, ?, ?, 'active', ?, ?, 0)
      `).run(uuidv4(), checkType, Date.now(), severity, description);

      logger.warn('Health incident created', { checkType, severity, description });
    }
  }

  // Resolve incident
  static resolveIncident(checkType: string, autoResolved: boolean = false, resolution?: string): void {
    const result = db.prepare(`
      UPDATE health_incidents 
      SET status = 'resolved', 
          resolved_at = ?, 
          auto_resolved = ?,
          resolution = ?
      WHERE check_type = ? AND status = 'active'
    `).run(Date.now(), autoResolved ? 1 : 0, resolution || 'Check returned to normal', checkType);

    if (result.changes > 0) {
      logger.info('Health incident resolved', { 
        checkType, 
        autoResolved, 
        resolution 
      });
    }
  }

  // Acknowledge incident (mark as seen by admin)
  static acknowledgeIncident(incidentId: string): void {
    db.prepare(`
      UPDATE health_incidents 
      SET status = 'acknowledged'
      WHERE id = ? AND status = 'active'
    `).run(incidentId);

    logger.info('Health incident acknowledged', { incidentId });
  }

  // Get folder size recursively
  private static getFolderSize(folderPath: string): number {
    if (!fs.existsSync(folderPath)) {
      return 0;
    }

    let totalSize = 0;
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          totalSize += this.getFolderSize(filePath);
        } else {
          totalSize += stats.size;
        }
      } catch (err) {
        // Skip files we can't access
      }
    }

    return totalSize;
  }

  // Format bytes to human-readable string
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  // Get simple status for public endpoint
  static getPublicStatus(): any {
    const disk = getDiskStatus();
    
    return {
      status: 'ok',
      version: process.env.APP_VERSION || '1.0.0',
      uptime: process.uptime(),
      storage: {
        freeBytes: disk.freeBytes,
        percentUsed: Math.round(disk.percentUsed * 100)
      }
    };
  }
}
