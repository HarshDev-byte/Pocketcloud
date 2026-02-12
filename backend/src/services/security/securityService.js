const { getDatabase, saveDatabase } = require('../../config/database');

class SecurityService {
  constructor() {
    this.loginAttempts = new Map(); // In-memory cache for rate limiting
    this.blockedIPs = new Set();
    
    // Configuration
    this.config = {
      maxLoginAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutes
      attemptWindow: 15 * 60 * 1000, // 15 minutes
      autoBlockThreshold: 10, // Auto-block after 10 failed attempts
      autoBlockDuration: 60 * 60 * 1000 // 1 hour
    };
  }

  /**
   * Record login attempt
   */
  async recordLoginAttempt(username, ipAddress, success, failureReason = null, userAgent = '') {
    try {
      const db = getDatabase();
      
      db.run(
        `INSERT INTO login_attempts 
         (username, ip_address, success, failure_reason, user_agent)
         VALUES (?, ?, ?, ?, ?)`,
        [username, ipAddress, success ? 1 : 0, failureReason, userAgent]
      );

      saveDatabase();

      // Update in-memory cache
      if (!success) {
        const key = `${ipAddress}:${username}`;
        const attempts = this.loginAttempts.get(key) || [];
        attempts.push(Date.now());
        this.loginAttempts.set(key, attempts);

        // Check if should auto-block
        await this.checkAutoBlock(ipAddress);
      }
    } catch (error) {
      console.error('Error recording login attempt:', error);
    }
  }

  /**
   * Check if IP/username should be rate limited
   */
  async checkRateLimit(username, ipAddress) {
    const key = `${ipAddress}:${username}`;
    const attempts = this.loginAttempts.get(key) || [];
    
    // Clean old attempts
    const now = Date.now();
    const recentAttempts = attempts.filter(
      time => now - time < this.config.attemptWindow
    );
    
    this.loginAttempts.set(key, recentAttempts);

    if (recentAttempts.length >= this.config.maxLoginAttempts) {
      const oldestAttempt = recentAttempts[0];
      const timeUntilUnlock = this.config.lockoutDuration - (now - oldestAttempt);
      
      return {
        allowed: false,
        reason: 'Too many login attempts',
        retryAfter: Math.ceil(timeUntilUnlock / 1000),
        attemptsRemaining: 0
      };
    }

    return {
      allowed: true,
      attemptsRemaining: this.config.maxLoginAttempts - recentAttempts.length
    };
  }

  /**
   * Check if IP should be auto-blocked
   */
  async checkAutoBlock(ipAddress) {
    try {
      const db = getDatabase();
      
      // Count failed attempts in last hour
      const result = db.exec(
        `SELECT COUNT(*) FROM login_attempts 
         WHERE ip_address = '${ipAddress}' 
         AND success = 0 
         AND datetime(created_at) > datetime('now', '-1 hour')`
      )[0];

      const failedAttempts = result?.values[0][0] || 0;

      if (failedAttempts >= this.config.autoBlockThreshold) {
        // Check if already blacklisted
        const existing = db.exec(
          `SELECT id FROM ip_blacklist WHERE ip_address = '${ipAddress}'`
        )[0];

        if (!existing || !existing.values.length) {
          // Add to blacklist
          const expiresAt = new Date(Date.now() + this.config.autoBlockDuration).toISOString();
          
          db.run(
            `INSERT INTO ip_blacklist 
             (ip_address, reason, auto_blocked, expires_at)
             VALUES (?, ?, 1, ?)`,
            [ipAddress, `Auto-blocked after ${failedAttempts} failed login attempts`, expiresAt]
          );

          saveDatabase();
          this.blockedIPs.add(ipAddress);

          console.log(`Auto-blocked IP: ${ipAddress}`);
        }
      }
    } catch (error) {
      console.error('Error checking auto-block:', error);
    }
  }

  /**
   * Check if IP is blacklisted
   */
  async isIPBlacklisted(ipAddress) {
    // Check in-memory cache first
    if (this.blockedIPs.has(ipAddress)) {
      return true;
    }

    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT id FROM ip_blacklist 
         WHERE ip_address = '${ipAddress}' 
         AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`
      )[0];

      const isBlocked = result && result.values.length > 0;
      
      if (isBlocked) {
        this.blockedIPs.add(ipAddress);
      }

      return isBlocked;
    } catch (error) {
      console.error('Error checking IP blacklist:', error);
      return false;
    }
  }

  /**
   * Check if IP is whitelisted
   */
  async isIPWhitelisted(ipAddress) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT id FROM ip_whitelist WHERE ip_address = '${ipAddress}'`
      )[0];

      return result && result.values.length > 0;
    } catch (error) {
      console.error('Error checking IP whitelist:', error);
      return false;
    }
  }

  /**
   * Add IP to whitelist
   */
  async addToWhitelist(ipAddress, description, createdBy) {
    try {
      const db = getDatabase();
      
      db.run(
        `INSERT INTO ip_whitelist (ip_address, description, created_by)
         VALUES (?, ?, ?)`,
        [ipAddress, description, createdBy]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        throw new Error('IP already whitelisted');
      }
      console.error('Error adding to whitelist:', error);
      throw error;
    }
  }

  /**
   * Remove IP from whitelist
   */
  async removeFromWhitelist(ipAddress) {
    try {
      const db = getDatabase();
      
      db.run('DELETE FROM ip_whitelist WHERE ip_address = ?', [ipAddress]);
      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error removing from whitelist:', error);
      throw error;
    }
  }

  /**
   * Get whitelist
   */
  async getWhitelist() {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT ip_address, description, created_at 
         FROM ip_whitelist 
         ORDER BY created_at DESC`
      )[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        ipAddress: row[0],
        description: row[1],
        createdAt: row[2]
      }));
    } catch (error) {
      console.error('Error getting whitelist:', error);
      return [];
    }
  }

  /**
   * Add IP to blacklist
   */
  async addToBlacklist(ipAddress, reason, createdBy, expiresAt = null) {
    try {
      const db = getDatabase();
      
      db.run(
        `INSERT INTO ip_blacklist (ip_address, reason, created_by, expires_at)
         VALUES (?, ?, ?, ?)`,
        [ipAddress, reason, createdBy, expiresAt]
      );

      saveDatabase();
      this.blockedIPs.add(ipAddress);

      return { success: true };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        throw new Error('IP already blacklisted');
      }
      console.error('Error adding to blacklist:', error);
      throw error;
    }
  }

  /**
   * Remove IP from blacklist
   */
  async removeFromBlacklist(ipAddress) {
    try {
      const db = getDatabase();
      
      db.run('DELETE FROM ip_blacklist WHERE ip_address = ?', [ipAddress]);
      saveDatabase();
      this.blockedIPs.delete(ipAddress);

      return { success: true };
    } catch (error) {
      console.error('Error removing from blacklist:', error);
      throw error;
    }
  }

  /**
   * Get blacklist
   */
  async getBlacklist() {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT ip_address, reason, auto_blocked, created_at, expires_at
         FROM ip_blacklist 
         WHERE expires_at IS NULL OR datetime(expires_at) > datetime('now')
         ORDER BY created_at DESC`
      )[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        ipAddress: row[0],
        reason: row[1],
        autoBlocked: row[2] === 1,
        createdAt: row[3],
        expiresAt: row[4]
      }));
    } catch (error) {
      console.error('Error getting blacklist:', error);
      return [];
    }
  }

  /**
   * Get login attempts
   */
  async getLoginAttempts(options = {}) {
    try {
      const { limit = 100, offset = 0, username = null, ipAddress = null } = options;
      const db = getDatabase();
      
      let query = `SELECT username, ip_address, success, failure_reason, created_at
                   FROM login_attempts WHERE 1=1`;
      
      if (username) {
        query += ` AND username = '${username}'`;
      }
      
      if (ipAddress) {
        query += ` AND ip_address = '${ipAddress}'`;
      }
      
      query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const result = db.exec(query)[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        username: row[0],
        ipAddress: row[1],
        success: row[2] === 1,
        failureReason: row[3],
        createdAt: row[4]
      }));
    } catch (error) {
      console.error('Error getting login attempts:', error);
      return [];
    }
  }

  /**
   * Log security event
   */
  async logSecurityEvent(eventType, severity, userId, ipAddress, details) {
    try {
      const db = getDatabase();
      
      db.run(
        `INSERT INTO security_events 
         (event_type, severity, user_id, ip_address, details)
         VALUES (?, ?, ?, ?, ?)`,
        [eventType, severity, userId, ipAddress, JSON.stringify(details)]
      );

      saveDatabase();
    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }

  /**
   * Get security events
   */
  async getSecurityEvents(options = {}) {
    try {
      const { limit = 100, offset = 0, severity = null, resolved = null } = options;
      const db = getDatabase();
      
      let query = `SELECT event_type, severity, user_id, ip_address, details, 
                          resolved, created_at
                   FROM security_events WHERE 1=1`;
      
      if (severity) {
        query += ` AND severity = '${severity}'`;
      }
      
      if (resolved !== null) {
        query += ` AND resolved = ${resolved ? 1 : 0}`;
      }
      
      query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const result = db.exec(query)[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        eventType: row[0],
        severity: row[1],
        userId: row[2],
        ipAddress: row[3],
        details: JSON.parse(row[4] || '{}'),
        resolved: row[5] === 1,
        createdAt: row[6]
      }));
    } catch (error) {
      console.error('Error getting security events:', error);
      return [];
    }
  }

  /**
   * Clean up expired blacklist entries
   */
  async cleanupExpiredBlacklist() {
    try {
      const db = getDatabase();
      
      const result = db.run(
        `DELETE FROM ip_blacklist 
         WHERE expires_at IS NOT NULL 
         AND datetime(expires_at) <= datetime('now')`
      );

      saveDatabase();

      // Clear in-memory cache
      this.blockedIPs.clear();

      console.log(`Cleaned up ${result.changes || 0} expired blacklist entries`);
      return result.changes || 0;
    } catch (error) {
      console.error('Error cleaning up blacklist:', error);
      return 0;
    }
  }

  /**
   * Get security statistics
   */
  async getSecurityStats() {
    try {
      const db = getDatabase();
      
      const totalAttempts = db.exec(
        `SELECT COUNT(*) FROM login_attempts 
         WHERE datetime(created_at) > datetime('now', '-24 hours')`
      )[0];

      const failedAttempts = db.exec(
        `SELECT COUNT(*) FROM login_attempts 
         WHERE success = 0 
         AND datetime(created_at) > datetime('now', '-24 hours')`
      )[0];

      const blockedIPs = db.exec(
        `SELECT COUNT(*) FROM ip_blacklist 
         WHERE expires_at IS NULL OR datetime(expires_at) > datetime('now')`
      )[0];

      const whitelistedIPs = db.exec(
        'SELECT COUNT(*) FROM ip_whitelist'
      )[0];

      const securityEvents = db.exec(
        `SELECT COUNT(*) FROM security_events 
         WHERE datetime(created_at) > datetime('now', '-24 hours')`
      )[0];

      return {
        totalLoginAttempts24h: totalAttempts?.values[0][0] || 0,
        failedLoginAttempts24h: failedAttempts?.values[0][0] || 0,
        blockedIPs: blockedIPs?.values[0][0] || 0,
        whitelistedIPs: whitelistedIPs?.values[0][0] || 0,
        securityEvents24h: securityEvents?.values[0][0] || 0
      };
    } catch (error) {
      console.error('Error getting security stats:', error);
      return {
        totalLoginAttempts24h: 0,
        failedLoginAttempts24h: 0,
        blockedIPs: 0,
        whitelistedIPs: 0,
        securityEvents24h: 0
      };
    }
  }
}

module.exports = new SecurityService();
