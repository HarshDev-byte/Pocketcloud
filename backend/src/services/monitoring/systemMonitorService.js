const { getDatabase, saveDatabase } = require('../../config/database');
const os = require('os');

class SystemMonitorService {
  constructor() {
    this.monitorInterval = 30000; // 30 seconds
    this.alertThresholds = {
      cpu: 80, // percent
      memory: 80, // percent
      disk: 90 // percent
    };
    this.alerts = [];
  }

  // Initialize system monitoring
  init(db) {
    this.db = db;
    this.createTables();
    this.startMonitoring();
  }

  // Create system_metrics and alerts tables
  createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS system_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        cpu_usage REAL,
        memory_usage REAL,
        disk_usage REAL,
        network_rx INTEGER,
        network_tx INTEGER,
        process_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        data TEXT,
        acknowledged BOOLEAN DEFAULT 0,
        acknowledged_by INTEGER,
        acknowledged_at DATETIME,
        resolved BOOLEAN DEFAULT 0,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (acknowledged_by) REFERENCES users(id)
      )
    `);
    
    this.db.run('CREATE INDEX IF NOT EXISTS idx_metrics_type ON system_metrics(metric_type)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_metrics_created ON system_metrics(created_at)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved)');
    saveDatabase();
  }

  // Get CPU usage
  getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    return {
      usage: usage.toFixed(2),
      cores: cpus.length,
      model: cpus[0].model
    };
  }

  // Get memory usage
  getMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usagePercent = (usedMem / totalMem) * 100;

    return {
      total: (totalMem / 1024 / 1024 / 1024).toFixed(2),
      used: (usedMem / 1024 / 1024 / 1024).toFixed(2),
      free: (freeMem / 1024 / 1024 / 1024).toFixed(2),
      usage: usagePercent.toFixed(2),
      unit: 'GB'
    };
  }

  // Get process memory usage
  getProcessMemory() {
    const memUsage = process.memoryUsage();
    
    return {
      heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
      rss: (memUsage.rss / 1024 / 1024).toFixed(2),
      external: (memUsage.external / 1024 / 1024).toFixed(2),
      unit: 'MB'
    };
  }

  // Get system info
  getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      nodeVersion: process.version,
      processUptime: process.uptime()
    };
  }

  // Get load average
  getLoadAverage() {
    const loadAvg = os.loadavg();
    
    return {
      '1min': loadAvg[0].toFixed(2),
      '5min': loadAvg[1].toFixed(2),
      '15min': loadAvg[2].toFixed(2)
    };
  }

  // Collect all metrics
  collectMetrics() {
    const cpu = this.getCpuUsage();
    const memory = this.getMemoryUsage();
    const processMemory = this.getProcessMemory();
    const loadAvg = this.getLoadAverage();
    const systemInfo = this.getSystemInfo();

    return {
      cpu,
      memory,
      processMemory,
      loadAvg,
      systemInfo,
      timestamp: new Date().toISOString()
    };
  }

  // Record metrics to database
  recordMetrics(metrics) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO system_metrics (
          metric_type, cpu_usage, memory_usage, process_count
        ) VALUES (?, ?, ?, ?)
      `);
      
      stmt.run([
        'system',
        parseFloat(metrics.cpu.usage),
        parseFloat(metrics.memory.usage),
        0 // process count placeholder
      ]);
      
      stmt.free();
      saveDatabase();
    } catch (error) {
      console.error('Error recording system metrics:', error);
    }
  }

  // Check thresholds and create alerts
  checkThresholds(metrics) {
    // CPU alert
    if (parseFloat(metrics.cpu.usage) > this.alertThresholds.cpu) {
      this.createAlert(
        'cpu',
        'warning',
        'High CPU Usage',
        `CPU usage is ${metrics.cpu.usage}% (threshold: ${this.alertThresholds.cpu}%)`,
        JSON.stringify(metrics.cpu)
      );
    }

    // Memory alert
    if (parseFloat(metrics.memory.usage) > this.alertThresholds.memory) {
      this.createAlert(
        'memory',
        'warning',
        'High Memory Usage',
        `Memory usage is ${metrics.memory.usage}% (threshold: ${this.alertThresholds.memory}%)`,
        JSON.stringify(metrics.memory)
      );
    }
  }

  // Create alert
  createAlert(type, severity, title, message, data = null) {
    try {
      // Check if similar alert exists and is not resolved
      const existingStmt = this.db.prepare(`
        SELECT id FROM alerts
        WHERE alert_type = ? AND resolved = 0
        AND created_at > datetime('now', '-5 minutes')
      `);
      const existing = existingStmt.get([type]);
      existingStmt.free();

      if (existing) {
        return; // Don't create duplicate alert
      }

      const stmt = this.db.prepare(`
        INSERT INTO alerts (alert_type, severity, title, message, data)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run([type, severity, title, message, data]);
      stmt.free();
      saveDatabase();
      
      console.warn(`⚠️ Alert created: ${title}`);
      
      // Add to memory cache
      this.alerts.push({
        type,
        severity,
        title,
        message,
        timestamp: Date.now()
      });
      
      // Keep only last 50 alerts in memory
      if (this.alerts.length > 50) {
        this.alerts.shift();
      }
    } catch (error) {
      console.error('Error creating alert:', error);
    }
  }

  // Get all alerts
  getAllAlerts(limit = 100, resolved = null) {
    let query = 'SELECT * FROM alerts';
    const params = [];

    if (resolved !== null) {
      query += ' WHERE resolved = ?';
      params.push(resolved ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(params);
    stmt.free();

    return rows;
  }

  // Get alert by ID
  getAlertById(id) {
    const stmt = this.db.prepare('SELECT * FROM alerts WHERE id = ?');
    const row = stmt.get([id]);
    stmt.free();
    return row;
  }

  // Acknowledge alert
  acknowledgeAlert(id, userId) {
    const stmt = this.db.prepare(`
      UPDATE alerts
      SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run([userId, id]);
    stmt.free();
    saveDatabase();
    
    return result.changes > 0;
  }

  // Resolve alert
  resolveAlert(id) {
    const stmt = this.db.prepare(`
      UPDATE alerts
      SET resolved = 1, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run([id]);
    stmt.free();
    saveDatabase();
    
    return result.changes > 0;
  }

  // Get alert statistics
  getAlertStats() {
    // Total alerts
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM alerts');
    const total = totalStmt.get([]).count;
    totalStmt.free();

    // Unresolved alerts
    const unresolvedStmt = this.db.prepare('SELECT COUNT(*) as count FROM alerts WHERE resolved = 0');
    const unresolved = unresolvedStmt.get([]).count;
    unresolvedStmt.free();

    // By severity
    const severityStmt = this.db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM alerts
      WHERE resolved = 0
      GROUP BY severity
    `);
    const bySeverity = severityStmt.all([]);
    severityStmt.free();

    // By type
    const typeStmt = this.db.prepare(`
      SELECT alert_type, COUNT(*) as count
      FROM alerts
      WHERE resolved = 0
      GROUP BY alert_type
    `);
    const byType = typeStmt.all([]);
    typeStmt.free();

    return {
      total,
      unresolved,
      resolved: total - unresolved,
      bySeverity,
      byType
    };
  }

  // Get historical metrics
  getHistoricalMetrics(hours = 24) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      SELECT * FROM system_metrics
      WHERE created_at > ?
      ORDER BY created_at DESC
    `);
    
    const rows = stmt.all([cutoff]);
    stmt.free();
    
    return rows;
  }

  // Start monitoring
  startMonitoring() {
    setInterval(() => {
      const metrics = this.collectMetrics();
      this.recordMetrics(metrics);
      this.checkThresholds(metrics);
    }, this.monitorInterval);
    
    console.log(`✓ System monitoring started (interval: ${this.monitorInterval / 1000}s)`);
  }

  // Set alert thresholds
  setThresholds(cpu, memory, disk) {
    this.alertThresholds = { cpu, memory, disk };
    console.log('✓ Alert thresholds updated:', this.alertThresholds);
  }

  // Cleanup old metrics
  async cleanupOldMetrics(days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      DELETE FROM system_metrics WHERE created_at < ?
    `);
    
    const result = stmt.run([cutoff]);
    stmt.free();
    saveDatabase();
    
    console.log(`🧹 Cleaned up ${result.changes} old system metrics`);
    return result.changes;
  }

  // Cleanup old alerts
  async cleanupOldAlerts(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      DELETE FROM alerts WHERE created_at < ? AND resolved = 1
    `);
    
    const result = stmt.run([cutoff]);
    stmt.free();
    saveDatabase();
    
    console.log(`🧹 Cleaned up ${result.changes} old alerts`);
    return result.changes;
  }
}

module.exports = new SystemMonitorService();
