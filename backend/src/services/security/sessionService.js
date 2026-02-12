const crypto = require('crypto');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const { getDatabase, saveDatabase } = require('../../config/database');

class SessionService {
  /**
   * Generate device ID from user agent and IP
   */
  generateDeviceId(userAgent, ipAddress) {
    const hash = crypto.createHash('sha256');
    hash.update(userAgent + ipAddress);
    return hash.digest('hex');
  }

  /**
   * Parse user agent string
   */
  parseUserAgent(userAgent) {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    
    return {
      browser: `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`.trim(),
      os: `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim(),
      device: result.device.type || 'desktop'
    };
  }

  /**
   * Get location from IP address
   */
  getLocation(ipAddress) {
    try {
      const geo = geoip.lookup(ipAddress);
      if (geo) {
        return `${geo.city || 'Unknown'}, ${geo.country || 'Unknown'}`;
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
    return 'Unknown';
  }

  /**
   * Create new session
   */
  async createSession(userId, sessionId, req) {
    try {
      const db = getDatabase();
      
      const userAgent = req.headers['user-agent'] || '';
      const ipAddress = req.ip || req.connection.remoteAddress || '';
      const deviceId = this.generateDeviceId(userAgent, ipAddress);
      const { browser, os, device } = this.parseUserAgent(userAgent);
      const location = this.getLocation(ipAddress);
      
      // Calculate expiration (24 hours from now)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // Insert session
      db.run(
        `INSERT INTO sessions 
         (id, user_id, device_id, ip_address, user_agent, browser, os, location, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, userId, deviceId, ipAddress, userAgent, browser, os, location, expiresAt]
      );

      saveDatabase();

      return {
        id: sessionId,
        deviceId,
        browser,
        os,
        location,
        ipAddress
      };
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId) {
    try {
      const db = getDatabase();
      
      db.run(
        `UPDATE sessions 
         SET last_activity = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [sessionId]
      );

      saveDatabase();
    } catch (error) {
      console.error('Error updating session activity:', error);
    }
  }

  /**
   * Get all sessions for user
   */
  async getUserSessions(userId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT id, device_id, ip_address, browser, os, location, 
                last_activity, created_at, expires_at
         FROM sessions 
         WHERE user_id = ${userId} 
         AND datetime(expires_at) > datetime('now')
         ORDER BY last_activity DESC`
      )[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        id: row[0],
        deviceId: row[1],
        ipAddress: row[2],
        browser: row[3],
        os: row[4],
        location: row[5],
        lastActivity: row[6],
        createdAt: row[7],
        expiresAt: row[8]
      }));
    } catch (error) {
      console.error('Error getting user sessions:', error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT id, user_id, device_id, ip_address, browser, os, location,
                last_activity, created_at, expires_at
         FROM sessions 
         WHERE id = '${sessionId}'`
      )[0];

      if (!result || !result.values.length) {
        return null;
      }

      const row = result.values[0];
      return {
        id: row[0],
        userId: row[1],
        deviceId: row[2],
        ipAddress: row[3],
        browser: row[4],
        os: row[5],
        location: row[6],
        lastActivity: row[7],
        createdAt: row[8],
        expiresAt: row[9]
      };
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId, userId) {
    try {
      const db = getDatabase();
      
      // Verify session belongs to user
      const session = await this.getSession(sessionId);
      if (!session || session.userId !== userId) {
        throw new Error('Session not found or unauthorized');
      }

      db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error revoking session:', error);
      throw error;
    }
  }

  /**
   * Revoke all sessions except current
   */
  async revokeAllSessions(userId, currentSessionId) {
    try {
      const db = getDatabase();
      
      db.run(
        'DELETE FROM sessions WHERE user_id = ? AND id != ?',
        [userId, currentSessionId]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error revoking all sessions:', error);
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      const db = getDatabase();
      
      const result = db.run(
        `DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')`
      );

      saveDatabase();

      console.log(`Cleaned up ${result.changes || 0} expired sessions`);
      return result.changes || 0;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }

  /**
   * Trust device
   */
  async trustDevice(userId, deviceId, deviceName, req) {
    try {
      const db = getDatabase();
      
      const userAgent = req.headers['user-agent'] || '';
      const ipAddress = req.ip || req.connection.remoteAddress || '';
      const { browser, os, device } = this.parseUserAgent(userAgent);

      // Check if device already trusted
      const existing = db.exec(
        `SELECT id FROM trusted_devices 
         WHERE user_id = ${userId} AND device_id = '${deviceId}'`
      )[0];

      if (existing && existing.values.length > 0) {
        // Update existing
        db.run(
          `UPDATE trusted_devices 
           SET last_used = CURRENT_TIMESTAMP, ip_address = ?
           WHERE user_id = ? AND device_id = ?`,
          [ipAddress, userId, deviceId]
        );
      } else {
        // Insert new
        db.run(
          `INSERT INTO trusted_devices 
           (user_id, device_id, device_name, device_type, browser, os, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, deviceId, deviceName, device, browser, os, ipAddress]
        );
      }

      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error trusting device:', error);
      throw error;
    }
  }

  /**
   * Check if device is trusted
   */
  async isDeviceTrusted(userId, deviceId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT id FROM trusted_devices 
         WHERE user_id = ${userId} AND device_id = '${deviceId}'`
      )[0];

      return result && result.values.length > 0;
    } catch (error) {
      console.error('Error checking trusted device:', error);
      return false;
    }
  }

  /**
   * Get trusted devices
   */
  async getTrustedDevices(userId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT device_id, device_name, device_type, browser, os, 
                ip_address, last_used, created_at
         FROM trusted_devices 
         WHERE user_id = ${userId}
         ORDER BY last_used DESC`
      )[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        deviceId: row[0],
        deviceName: row[1],
        deviceType: row[2],
        browser: row[3],
        os: row[4],
        ipAddress: row[5],
        lastUsed: row[6],
        createdAt: row[7]
      }));
    } catch (error) {
      console.error('Error getting trusted devices:', error);
      throw error;
    }
  }

  /**
   * Remove trusted device
   */
  async removeTrustedDevice(userId, deviceId) {
    try {
      const db = getDatabase();
      
      db.run(
        'DELETE FROM trusted_devices WHERE user_id = ? AND device_id = ?',
        [userId, deviceId]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error removing trusted device:', error);
      throw error;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(userId) {
    try {
      const db = getDatabase();
      
      const activeSessions = db.exec(
        `SELECT COUNT(*) FROM sessions 
         WHERE user_id = ${userId} 
         AND datetime(expires_at) > datetime('now')`
      )[0];

      const trustedDevices = db.exec(
        `SELECT COUNT(*) FROM trusted_devices WHERE user_id = ${userId}`
      )[0];

      return {
        activeSessions: activeSessions?.values[0][0] || 0,
        trustedDevices: trustedDevices?.values[0][0] || 0
      };
    } catch (error) {
      console.error('Error getting session stats:', error);
      return { activeSessions: 0, trustedDevices: 0 };
    }
  }
}

module.exports = new SessionService();
