const { getDatabase, saveDatabase } = require('../../config/database');
const fs = require('fs');
const path = require('path');

class HealthCheckService {
  constructor() {
    this.checks = new Map();
    this.checkInterval = 60000; // 1 minute
  }

  // Initialize health checks
  init(db) {
    this.db = db;
    this.createTables();
    this.registerDefaultChecks();
    this.startPeriodicChecks();
  }

  // Create health_checks table
  createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS health_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_name TEXT NOT NULL,
        status TEXT NOT NULL,
        response_time INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    this.db.run('CREATE INDEX IF NOT EXISTS idx_health_name ON health_checks(check_name)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_health_created ON health_checks(created_at)');
    saveDatabase();
  }

  // Register a health check
  registerCheck(name, checkFunction) {
    this.checks.set(name, checkFunction);
  }

  // Register default health checks
  registerDefaultChecks() {
    // Database check
    this.registerCheck('database', async () => {
      try {
        const stmt = this.db.prepare('SELECT 1');
        stmt.get([]);
        stmt.free();
        return { status: 'healthy', message: 'Database connection OK' };
      } catch (error) {
        return { status: 'unhealthy', message: error.message };
      }
    });

    // Storage check
    this.registerCheck('storage', async () => {
      try {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
          return { status: 'unhealthy', message: 'Upload directory not found' };
        }
        
        // Check write permissions
        const testFile = path.join(uploadDir, '.health_check');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        
        return { status: 'healthy', message: 'Storage accessible and writable' };
      } catch (error) {
        return { status: 'unhealthy', message: error.message };
      }
    });

    // Memory check
    this.registerCheck('memory', async () => {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      if (heapUsedPercent > 90) {
        return { 
          status: 'critical', 
          message: `Memory usage critical: ${heapUsedPercent.toFixed(2)}%`,
          heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB'
        };
      } else if (heapUsedPercent > 75) {
        return { 
          status: 'warning', 
          message: `Memory usage high: ${heapUsedPercent.toFixed(2)}%`,
          heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB'
        };
      }
      
      return { 
        status: 'healthy', 
        message: `Memory usage normal: ${heapUsedPercent.toFixed(2)}%`,
        heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB'
      };
    });

    // Disk space check
    this.registerCheck('disk', async () => {
      try {
        const dataDir = path.join(__dirname, '../data');
        const stats = fs.statSync(dataDir);
        
        // Note: Getting actual disk space requires platform-specific code
        // This is a simplified check
        return { 
          status: 'healthy', 
          message: 'Disk accessible',
          path: dataDir
        };
      } catch (error) {
        return { status: 'unhealthy', message: error.message };
      }
    });

    // Process check
    this.registerCheck('process', async () => {
      const uptime = process.uptime();
      const uptimeHours = (uptime / 3600).toFixed(2);
      
      return {
        status: 'healthy',
        message: `Process running for ${uptimeHours} hours`,
        uptime: uptime,
        pid: process.pid,
        nodeVersion: process.version
      };
    });
  }

  // Run a single health check
  async runCheck(name) {
    const checkFunction = this.checks.get(name);
    if (!checkFunction) {
      return { status: 'unknown', message: 'Check not found' };
    }

    const startTime = Date.now();
    try {
      const result = await checkFunction();
      const responseTime = Date.now() - startTime;
      
      // Record to database
      this.recordCheck(name, result.status, responseTime, JSON.stringify(result));
      
      return { ...result, responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result = { status: 'error', message: error.message };
      
      this.recordCheck(name, 'error', responseTime, JSON.stringify(result));
      
      return { ...result, responseTime };
    }
  }

  // Run all health checks
  async runAllChecks() {
    const results = {};
    
    for (const [name] of this.checks) {
      results[name] = await this.runCheck(name);
    }
    
    return results;
  }

  // Get overall health status
  async getHealthStatus() {
    const checks = await this.runAllChecks();
    
    // Determine overall status
    let overallStatus = 'healthy';
    const statuses = Object.values(checks).map(c => c.status);
    
    if (statuses.includes('unhealthy') || statuses.includes('error')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('critical')) {
      overallStatus = 'critical';
    } else if (statuses.includes('warning')) {
      overallStatus = 'warning';
    }
    
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks
    };
  }

  // Get detailed health report
  async getDetailedHealth() {
    const health = await this.getHealthStatus();
    
    // Add system info
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      ...health,
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: {
          heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
          heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
          rss: (memUsage.rss / 1024 / 1024).toFixed(2) + ' MB'
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      }
    };
  }

  // Record check result to database
  recordCheck(name, status, responseTime, details) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO health_checks (check_name, status, response_time, details)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run([name, status, responseTime, details]);
      stmt.free();
      saveDatabase();
    } catch (error) {
      console.error('Error recording health check:', error);
    }
  }

  // Get check history
  getCheckHistory(name, limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM health_checks
      WHERE check_name = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    const rows = stmt.all([name, limit]);
    stmt.free();
    
    return rows;
  }

  // Get all checks history
  getAllCheckHistory(hours = 24) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      SELECT * FROM health_checks
      WHERE created_at > ?
      ORDER BY created_at DESC
    `);
    
    const rows = stmt.all([cutoff]);
    stmt.free();
    
    return rows;
  }

  // Start periodic health checks
  startPeriodicChecks() {
    setInterval(async () => {
      await this.runAllChecks();
    }, this.checkInterval);
    
    console.log(`✓ Health checks running every ${this.checkInterval / 1000}s`);
  }

  // Cleanup old health check records
  async cleanupOld(days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      DELETE FROM health_checks WHERE created_at < ?
    `);
    
    const result = stmt.run([cutoff]);
    stmt.free();
    saveDatabase();
    
    console.log(`🧹 Cleaned up ${result.changes} old health check records`);
    return result.changes;
  }
}

module.exports = new HealthCheckService();
