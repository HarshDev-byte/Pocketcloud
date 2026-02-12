const { getDatabase, saveDatabase } = require('../../config/database');
const fs = require('fs-extra');
const path = require('path');

class AuditLogService {
  constructor() {
    this.logRetentionDays = 90; // Keep logs for 90 days
  }

  /**
   * Log an action
   */
  async log(userId, action, resourceType = null, resourceId = null, details = null, req = null) {
    try {
      const db = getDatabase();
      
      const ipAddress = req ? (req.ip || req.connection.remoteAddress) : null;
      const userAgent = req ? req.headers['user-agent'] : null;
      const severity = this.determineSeverity(action);

      db.run(
        `INSERT INTO audit_logs 
         (user_id, action, resource_type, resource_id, details, ip_address, user_agent, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, action, resourceType, resourceId, JSON.stringify(details), ipAddress, userAgent, severity]
      );

      saveDatabase();
    } catch (error) {
      console.error('Error logging audit entry:', error);
    }
  }

  /**
   * Determine severity based on action
   */
  determineSeverity(action) {
    const highSeverity = [
      'user.delete',
      'user.role.change',
      'file.delete.permanent',
      'settings.security.change',
      '2fa.disable',
      'session.revoke.all'
    ];

    const mediumSeverity = [
      'user.create',
      'user.update',
      'file.delete',
      'file.share',
      'settings.change',
      '2fa.enable',
      'password.change'
    ];

    if (highSeverity.some(s => action.includes(s))) {
      return 'high';
    } else if (mediumSeverity.some(s => action.includes(s))) {
      return 'medium';
    } else {
      return 'info';
    }
  }

  /**
   * Get audit logs
   */
  async getLogs(options = {}) {
    try {
      const {
        limit = 100,
        offset = 0,
        userId = null,
        action = null,
        resourceType = null,
        severity = null,
        startDate = null,
        endDate = null
      } = options;

      const db = getDatabase();
      
      let query = `SELECT id, user_id, action, resource_type, resource_id, details,
                          ip_address, user_agent, severity, created_at
                   FROM audit_logs WHERE 1=1`;
      
      if (userId) {
        query += ` AND user_id = ${userId}`;
      }
      
      if (action) {
        query += ` AND action LIKE '%${action}%'`;
      }
      
      if (resourceType) {
        query += ` AND resource_type = '${resourceType}'`;
      }
      
      if (severity) {
        query += ` AND severity = '${severity}'`;
      }
      
      if (startDate) {
        query += ` AND datetime(created_at) >= datetime('${startDate}')`;
      }
      
      if (endDate) {
        query += ` AND datetime(created_at) <= datetime('${endDate}')`;
      }
      
      query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const result = db.exec(query)[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        id: row[0],
        userId: row[1],
        action: row[2],
        resourceType: row[3],
        resourceId: row[4],
        details: JSON.parse(row[5] || '{}'),
        ipAddress: row[6],
        userAgent: row[7],
        severity: row[8],
        createdAt: row[9]
      }));
    } catch (error) {
      console.error('Error getting audit logs:', error);
      return [];
    }
  }

  /**
   * Get logs for specific user
   */
  async getUserLogs(userId, options = {}) {
    return this.getLogs({ ...options, userId });
  }

  /**
   * Get logs for specific resource
   */
  async getResourceLogs(resourceType, resourceId, options = {}) {
    return this.getLogs({ ...options, resourceType, resourceId });
  }

  /**
   * Search logs
   */
  async searchLogs(searchTerm, options = {}) {
    try {
      const { limit = 100, offset = 0 } = options;
      const db = getDatabase();
      
      const query = `SELECT id, user_id, action, resource_type, resource_id, details,
                            ip_address, user_agent, severity, created_at
                     FROM audit_logs 
                     WHERE action LIKE '%${searchTerm}%' 
                        OR details LIKE '%${searchTerm}%'
                        OR ip_address LIKE '%${searchTerm}%'
                     ORDER BY created_at DESC 
                     LIMIT ${limit} OFFSET ${offset}`;

      const result = db.exec(query)[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        id: row[0],
        userId: row[1],
        action: row[2],
        resourceType: row[3],
        resourceId: row[4],
        details: JSON.parse(row[5] || '{}'),
        ipAddress: row[6],
        userAgent: row[7],
        severity: row[8],
        createdAt: row[9]
      }));
    } catch (error) {
      console.error('Error searching audit logs:', error);
      return [];
    }
  }

  /**
   * Get audit log statistics
   */
  async getStats(options = {}) {
    try {
      const { startDate = null, endDate = null } = options;
      const db = getDatabase();
      
      let dateFilter = '';
      if (startDate) {
        dateFilter += ` AND datetime(created_at) >= datetime('${startDate}')`;
      }
      if (endDate) {
        dateFilter += ` AND datetime(created_at) <= datetime('${endDate}')`;
      }

      const totalLogs = db.exec(
        `SELECT COUNT(*) FROM audit_logs WHERE 1=1${dateFilter}`
      )[0];

      const logsBySeverity = db.exec(
        `SELECT severity, COUNT(*) as count 
         FROM audit_logs 
         WHERE 1=1${dateFilter}
         GROUP BY severity`
      )[0];

      const logsByAction = db.exec(
        `SELECT action, COUNT(*) as count 
         FROM audit_logs 
         WHERE 1=1${dateFilter}
         GROUP BY action 
         ORDER BY count DESC 
         LIMIT 10`
      )[0];

      const logsByUser = db.exec(
        `SELECT user_id, COUNT(*) as count 
         FROM audit_logs 
         WHERE 1=1${dateFilter}
         GROUP BY user_id 
         ORDER BY count DESC 
         LIMIT 10`
      )[0];

      return {
        totalLogs: totalLogs?.values[0][0] || 0,
        bySeverity: logsBySeverity?.values.map(row => ({
          severity: row[0],
          count: row[1]
        })) || [],
        byAction: logsByAction?.values.map(row => ({
          action: row[0],
          count: row[1]
        })) || [],
        byUser: logsByUser?.values.map(row => ({
          userId: row[0],
          count: row[1]
        })) || []
      };
    } catch (error) {
      console.error('Error getting audit log stats:', error);
      return {
        totalLogs: 0,
        bySeverity: [],
        byAction: [],
        byUser: []
      };
    }
  }

  /**
   * Export logs to CSV
   */
  async exportToCSV(options = {}) {
    try {
      const logs = await this.getLogs({ ...options, limit: 10000 });
      
      let csv = 'ID,User ID,Action,Resource Type,Resource ID,IP Address,Severity,Created At\n';
      
      for (const log of logs) {
        csv += `${log.id},${log.userId},"${log.action}","${log.resourceType || ''}",${log.resourceId || ''},"${log.ipAddress || ''}","${log.severity}","${log.createdAt}"\n`;
      }

      return csv;
    } catch (error) {
      console.error('Error exporting logs to CSV:', error);
      throw error;
    }
  }

  /**
   * Export logs to JSON
   */
  async exportToJSON(options = {}) {
    try {
      const logs = await this.getLogs({ ...options, limit: 10000 });
      return JSON.stringify(logs, null, 2);
    } catch (error) {
      console.error('Error exporting logs to JSON:', error);
      throw error;
    }
  }

  /**
   * Save export to file
   */
  async saveExport(format = 'csv', options = {}) {
    try {
      const exportDir = path.join(__dirname, '../exports');
      await fs.ensureDir(exportDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-logs-${timestamp}.${format}`;
      const filepath = path.join(exportDir, filename);

      let content;
      if (format === 'csv') {
        content = await this.exportToCSV(options);
      } else if (format === 'json') {
        content = await this.exportToJSON(options);
      } else {
        throw new Error('Unsupported format');
      }

      await fs.writeFile(filepath, content);

      return {
        filename,
        filepath,
        size: content.length
      };
    } catch (error) {
      console.error('Error saving export:', error);
      throw error;
    }
  }

  /**
   * Clean up old logs
   */
  async cleanupOldLogs() {
    try {
      const db = getDatabase();
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.logRetentionDays);
      const cutoffISO = cutoffDate.toISOString();

      const result = db.run(
        `DELETE FROM audit_logs 
         WHERE datetime(created_at) < datetime('${cutoffISO}')`
      );

      saveDatabase();

      console.log(`Cleaned up ${result.changes || 0} old audit logs`);
      return result.changes || 0;
    } catch (error) {
      console.error('Error cleaning up old logs:', error);
      return 0;
    }
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(userId, limit = 20) {
    return this.getLogs({ userId, limit, offset: 0 });
  }

  /**
   * Get activity timeline
   */
  async getActivityTimeline(userId, days = 7) {
    try {
      const db = getDatabase();
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startISO = startDate.toISOString();

      const result = db.exec(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM audit_logs
         WHERE user_id = ${userId}
         AND datetime(created_at) >= datetime('${startISO}')
         GROUP BY DATE(created_at)
         ORDER BY date ASC`
      )[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        date: row[0],
        count: row[1]
      }));
    } catch (error) {
      console.error('Error getting activity timeline:', error);
      return [];
    }
  }

  /**
   * Common logging helpers
   */
  async logLogin(userId, req, success = true) {
    await this.log(userId, success ? 'auth.login.success' : 'auth.login.failed', null, null, null, req);
  }

  async logLogout(userId, req) {
    await this.log(userId, 'auth.logout', null, null, null, req);
  }

  async logFileUpload(userId, fileId, filename, req) {
    await this.log(userId, 'file.upload', 'file', fileId, { filename }, req);
  }

  async logFileDownload(userId, fileId, filename, req) {
    await this.log(userId, 'file.download', 'file', fileId, { filename }, req);
  }

  async logFileDelete(userId, fileId, filename, req) {
    await this.log(userId, 'file.delete', 'file', fileId, { filename }, req);
  }

  async logFileShare(userId, fileId, sharedWith, req) {
    await this.log(userId, 'file.share', 'file', fileId, { sharedWith }, req);
  }

  async logSettingsChange(userId, setting, oldValue, newValue, req) {
    await this.log(userId, 'settings.change', 'settings', null, { setting, oldValue, newValue }, req);
  }

  async logPasswordChange(userId, req) {
    await this.log(userId, 'auth.password.change', null, null, null, req);
  }

  async log2FAEnable(userId, req) {
    await this.log(userId, 'auth.2fa.enable', null, null, null, req);
  }

  async log2FADisable(userId, req) {
    await this.log(userId, 'auth.2fa.disable', null, null, null, req);
  }
}

module.exports = new AuditLogService();
