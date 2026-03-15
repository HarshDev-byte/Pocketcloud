import { db } from '../db';
import { LoggerService } from './logger.service';

export interface AuditLogEntry {
  id?: number;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  ip_address: string;
  user_agent: string;
  result: 'success' | 'fail' | 'detected';
  metadata?: any;
  created_at: number;
}

export interface AuditQuery {
  userId?: string;
  action?: string;
  resourceType?: string;
  result?: 'success' | 'fail' | 'detected';
  startTime?: number;
  endTime?: number;
  ipAddress?: string;
  limit?: number;
  offset?: number;
}

export class AuditService {
  private static readonly MAX_AUDIT_LOGS = 50000; // Keep last 50k audit logs

  /**
   * Initialize audit service and create audit_log table if needed
   */
  public static initialize(): void {
    try {
      // Create audit_log table
      const createTableStmt = db.prepare(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          action TEXT NOT NULL,
          resource_type TEXT NOT NULL,
          resource_id TEXT,
          ip_address TEXT NOT NULL,
          user_agent TEXT NOT NULL,
          result TEXT NOT NULL CHECK (result IN ('success', 'fail', 'detected')),
          metadata TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      createTableStmt.run();

      // Create indexes for performance
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)',
        'CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_audit_ip_address ON audit_log(ip_address)',
        'CREATE INDEX IF NOT EXISTS idx_audit_result ON audit_log(result)'
      ];

      indexes.forEach(indexSql => {
        db.prepare(indexSql).run();
      });

      console.log('Audit service initialized');
    } catch (error) {
      console.error('Failed to initialize audit service:', error);
    }
  }

  /**
   * Log a security-relevant event
   */
  public static logSecurityEvent(
    userId: string | null,
    action: string,
    resourceType: string,
    ipAddress: string,
    userAgent: string,
    result: 'success' | 'fail' | 'detected' = 'success',
    metadata?: any,
    resourceId?: string
  ): void {
    try {
      const entry: AuditLogEntry = {
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId || null,
        ip_address: ipAddress,
        user_agent: userAgent,
        result,
        metadata: metadata ? JSON.stringify(metadata) : null,
        created_at: Date.now()
      };

      const insertStmt = db.prepare(`
        INSERT INTO audit_log (
          user_id, action, resource_type, resource_id, 
          ip_address, user_agent, result, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        entry.user_id,
        entry.action,
        entry.resource_type,
        entry.resource_id,
        entry.ip_address,
        entry.user_agent,
        entry.result,
        entry.metadata,
        entry.created_at
      );

      // Also log to application logs for immediate visibility
      const logLevel = result === 'fail' ? 'warn' : 'info';
      LoggerService.log(
        logLevel,
        'audit',
        `${action} ${result} - ${resourceType}${resourceId ? ` (${resourceId})` : ''} from ${ipAddress}`,
        userId || undefined,
        metadata
      );

    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Fallback to application log
      LoggerService.error('audit', `Failed to log audit event: ${action}`, userId || undefined, { error: error.message });
    }
  }

  /**
   * Query audit logs with filtering
   */
  public static queryAuditLogs(query: AuditQuery = {}): AuditLogEntry[] {
    try {
      let sql = `
        SELECT 
          a.*,
          u.username
        FROM audit_log a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (query.userId) {
        sql += ' AND a.user_id = ?';
        params.push(query.userId);
      }

      if (query.action) {
        sql += ' AND a.action = ?';
        params.push(query.action);
      }

      if (query.resourceType) {
        sql += ' AND a.resource_type = ?';
        params.push(query.resourceType);
      }

      if (query.result) {
        sql += ' AND a.result = ?';
        params.push(query.result);
      }

      if (query.ipAddress) {
        sql += ' AND a.ip_address = ?';
        params.push(query.ipAddress);
      }

      if (query.startTime) {
        sql += ' AND a.created_at >= ?';
        params.push(query.startTime);
      }

      if (query.endTime) {
        sql += ' AND a.created_at <= ?';
        params.push(query.endTime);
      }

      sql += ' ORDER BY a.created_at DESC';

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
      }

      if (query.offset) {
        sql += ' OFFSET ?';
        params.push(query.offset);
      }

      const stmt = db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        result: row.result,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        created_at: row.created_at,
        username: row.username // Added from JOIN
      }));

    } catch (error) {
      console.error('Failed to query audit logs:', error);
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  public static getAuditStats(): {
    total: number;
    byAction: Record<string, number>;
    byResult: Record<string, number>;
    recentFailures: number;
  } {
    try {
      // Total count
      const totalStmt = db.prepare('SELECT COUNT(*) as count FROM audit_log');
      const total = (totalStmt.get() as { count: number }).count;

      // By action
      const actionStmt = db.prepare(`
        SELECT action, COUNT(*) as count 
        FROM audit_log 
        GROUP BY action 
        ORDER BY count DESC 
        LIMIT 10
      `);
      const actionRows = actionStmt.all() as { action: string; count: number }[];
      const byAction: Record<string, number> = {};
      actionRows.forEach(row => {
        byAction[row.action] = row.count;
      });

      // By result
      const resultStmt = db.prepare(`
        SELECT result, COUNT(*) as count 
        FROM audit_log 
        GROUP BY result
      `);
      const resultRows = resultStmt.all() as { result: string; count: number }[];
      const byResult: Record<string, number> = {};
      resultRows.forEach(row => {
        byResult[row.result] = row.count;
      });

      // Recent failures (last 24 hours)
      const recentFailuresStmt = db.prepare(`
        SELECT COUNT(*) as count 
        FROM audit_log 
        WHERE result = 'fail' AND created_at > ?
      `);
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const recentFailures = (recentFailuresStmt.get(oneDayAgo) as { count: number }).count;

      return {
        total,
        byAction,
        byResult,
        recentFailures
      };

    } catch (error) {
      console.error('Failed to get audit stats:', error);
      return {
        total: 0,
        byAction: {},
        byResult: {},
        recentFailures: 0
      };
    }
  }

  /**
   * Clean old audit logs to prevent database bloat
   */
  public static cleanOldAuditLogs(): number {
    try {
      // Keep only the most recent logs
      const deleteStmt = db.prepare(`
        DELETE FROM audit_log 
        WHERE id NOT IN (
          SELECT id FROM audit_log 
          ORDER BY created_at DESC 
          LIMIT ?
        )
      `);
      
      const result = deleteStmt.run(this.MAX_AUDIT_LOGS);
      
      if (result.changes > 0) {
        LoggerService.info('audit', `Cleaned ${result.changes} old audit log entries`);
      }
      
      return result.changes;

    } catch (error) {
      console.error('Failed to clean old audit logs:', error);
      return 0;
    }
  }

  /**
   * Get security alerts (recent suspicious activity)
   */
  public static getSecurityAlerts(): AuditLogEntry[] {
    try {
      const alertActions = [
        'rate_limit_exceeded',
        'cors_violation',
        'ip_security_violation',
        'suspicious_request',
        'login_fail',
        'path_traversal_attempt',
        'file_type_violation'
      ];

      const placeholders = alertActions.map(() => '?').join(',');
      const sql = `
        SELECT * FROM audit_log 
        WHERE action IN (${placeholders}) 
        AND created_at > ? 
        ORDER BY created_at DESC 
        LIMIT 50
      `;

      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const params = [...alertActions, oneDayAgo];

      const stmt = db.prepare(sql);
      const rows = stmt.all(...params) as any[];

      return rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        result: row.result,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        created_at: row.created_at
      }));

    } catch (error) {
      console.error('Failed to get security alerts:', error);
      return [];
    }
  }

  /**
   * Check for brute force attacks
   */
  public static checkBruteForceAttacks(ipAddress: string, timeWindowMs: number = 300000): {
    isAttack: boolean;
    attemptCount: number;
    lastAttempt: number;
  } {
    try {
      const stmt = db.prepare(`
        SELECT COUNT(*) as count, MAX(created_at) as last_attempt
        FROM audit_log 
        WHERE ip_address = ? 
        AND action = 'login_fail' 
        AND created_at > ?
      `);

      const windowStart = Date.now() - timeWindowMs;
      const result = stmt.get(ipAddress, windowStart) as { count: number; last_attempt: number };

      return {
        isAttack: result.count >= 5, // 5 failed attempts in time window
        attemptCount: result.count,
        lastAttempt: result.last_attempt || 0
      };

    } catch (error) {
      console.error('Failed to check brute force attacks:', error);
      return {
        isAttack: false,
        attemptCount: 0,
        lastAttempt: 0
      };
    }
  }

  /**
   * Convenience methods for common audit events
   */
  public static logLogin(userId: string, ipAddress: string, userAgent: string, success: boolean): void {
    this.logSecurityEvent(
      userId,
      success ? 'login_success' : 'login_fail',
      'authentication',
      ipAddress,
      userAgent,
      success ? 'success' : 'fail'
    );
  }

  public static logLogout(userId: string, ipAddress: string, userAgent: string): void {
    this.logSecurityEvent(userId, 'logout', 'authentication', ipAddress, userAgent, 'success');
  }

  public static logFileAccess(userId: string, fileId: string, action: string, ipAddress: string, userAgent: string): void {
    this.logSecurityEvent(userId, action, 'file', ipAddress, userAgent, 'success', null, fileId);
  }

  public static logAdminAction(userId: string, action: string, ipAddress: string, userAgent: string, metadata?: any): void {
    this.logSecurityEvent(userId, `admin_${action}`, 'admin', ipAddress, userAgent, 'success', metadata);
  }

  public static logPasswordChange(userId: string, ipAddress: string, userAgent: string): void {
    this.logSecurityEvent(userId, 'password_change', 'authentication', ipAddress, userAgent, 'success');
  }

  public static logQuotaExceeded(userId: string, ipAddress: string, userAgent: string, metadata: any): void {
    this.logSecurityEvent(userId, 'quota_exceeded', 'storage', ipAddress, userAgent, 'fail', metadata);
  }
}