const { getDatabase, saveDatabase } = require('../../config/database');

class BandwidthMonitorService {
  constructor() {
    this.currentUsage = {
      upload: 0,
      download: 0,
      startTime: Date.now()
    };
    this.throttleEnabled = false;
    this.throttleLimit = 10 * 1024 * 1024; // 10 MB/s default
  }

  // Initialize bandwidth monitoring
  init(db) {
    this.db = db;
    this.createTables();
    this.startUsageTracking();
  }

  // Create bandwidth_usage table
  createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS bandwidth_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        file_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (file_id) REFERENCES files(id)
      )
    `);
    
    this.db.run('CREATE INDEX IF NOT EXISTS idx_bandwidth_user ON bandwidth_usage(user_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_bandwidth_type ON bandwidth_usage(type)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_bandwidth_created ON bandwidth_usage(created_at)');
    saveDatabase();
  }

  // Track upload
  trackUpload(userId, bytes, fileId = null) {
    this.currentUsage.upload += bytes;
    this.recordUsage(userId, 'upload', bytes, fileId);
  }

  // Track download
  trackDownload(userId, bytes, fileId = null) {
    this.currentUsage.download += bytes;
    this.recordUsage(userId, 'download', bytes, fileId);
  }

  // Record usage to database
  recordUsage(userId, type, bytes, fileId = null) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO bandwidth_usage (user_id, type, bytes, file_id)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run([userId, type, bytes, fileId]);
      stmt.free();
      saveDatabase();
    } catch (error) {
      console.error('Error recording bandwidth usage:', error);
    }
  }

  // Get current bandwidth usage
  getCurrentUsage() {
    const elapsed = (Date.now() - this.currentUsage.startTime) / 1000; // seconds
    
    return {
      upload: {
        total: this.currentUsage.upload,
        rate: (this.currentUsage.upload / elapsed).toFixed(2),
        unit: 'bytes/s'
      },
      download: {
        total: this.currentUsage.download,
        rate: (this.currentUsage.download / elapsed).toFixed(2),
        unit: 'bytes/s'
      },
      elapsed: elapsed.toFixed(0)
    };
  }

  // Get user bandwidth usage
  getUserUsage(userId, days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      SELECT 
        type,
        SUM(bytes) as total_bytes,
        COUNT(*) as count
      FROM bandwidth_usage
      WHERE user_id = ? AND created_at > ?
      GROUP BY type
    `);
    
    const rows = stmt.all([userId, cutoff]);
    stmt.free();
    
    const result = {
      upload: 0,
      download: 0,
      total: 0
    };
    
    rows.forEach(row => {
      result[row.type] = row.total_bytes;
      result.total += row.total_bytes;
    });
    
    return result;
  }

  // Get bandwidth statistics
  getBandwidthStats(days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    // Total bandwidth
    const totalStmt = this.db.prepare(`
      SELECT 
        type,
        SUM(bytes) as total_bytes,
        COUNT(*) as count
      FROM bandwidth_usage
      WHERE created_at > ?
      GROUP BY type
    `);
    const totals = totalStmt.all([cutoff]);
    totalStmt.free();
    
    // Peak usage (by hour)
    const peakStmt = this.db.prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:00:00', created_at) as hour,
        type,
        SUM(bytes) as bytes
      FROM bandwidth_usage
      WHERE created_at > ?
      GROUP BY hour, type
      ORDER BY bytes DESC
      LIMIT 10
    `);
    const peaks = peakStmt.all([cutoff]);
    peakStmt.free();
    
    // Top users
    const usersStmt = this.db.prepare(`
      SELECT 
        user_id,
        SUM(bytes) as total_bytes
      FROM bandwidth_usage
      WHERE created_at > ?
      GROUP BY user_id
      ORDER BY total_bytes DESC
      LIMIT 10
    `);
    const topUsers = usersStmt.all([cutoff]);
    usersStmt.free();
    
    return {
      totals,
      peaks,
      topUsers
    };
  }

  // Get bandwidth trends
  getBandwidthTrends(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      SELECT 
        DATE(created_at) as date,
        type,
        SUM(bytes) as bytes
      FROM bandwidth_usage
      WHERE created_at > ?
      GROUP BY date, type
      ORDER BY date DESC
    `);
    
    const rows = stmt.all([cutoff]);
    stmt.free();
    
    return rows;
  }

  // Get bandwidth by file type
  getBandwidthByFileType(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      SELECT 
        f.mimetype,
        b.type,
        SUM(b.bytes) as total_bytes,
        COUNT(*) as count
      FROM bandwidth_usage b
      JOIN files f ON b.file_id = f.id
      WHERE b.created_at > ? AND b.file_id IS NOT NULL
      GROUP BY f.mimetype, b.type
      ORDER BY total_bytes DESC
      LIMIT 20
    `);
    
    const rows = stmt.all([cutoff]);
    stmt.free();
    
    return rows;
  }

  // Enable bandwidth throttling
  enableThrottle(limitBytesPerSecond) {
    this.throttleEnabled = true;
    this.throttleLimit = limitBytesPerSecond;
    console.log(`✓ Bandwidth throttling enabled: ${(limitBytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`);
  }

  // Disable bandwidth throttling
  disableThrottle() {
    this.throttleEnabled = false;
    console.log('✓ Bandwidth throttling disabled');
  }

  // Check if throttle limit exceeded
  shouldThrottle() {
    if (!this.throttleEnabled) return false;
    
    const elapsed = (Date.now() - this.currentUsage.startTime) / 1000;
    const currentRate = (this.currentUsage.upload + this.currentUsage.download) / elapsed;
    
    return currentRate > this.throttleLimit;
  }

  // Reset current usage counters
  resetCurrentUsage() {
    this.currentUsage = {
      upload: 0,
      download: 0,
      startTime: Date.now()
    };
  }

  // Start periodic usage tracking
  startUsageTracking() {
    // Reset counters every hour
    setInterval(() => {
      this.resetCurrentUsage();
    }, 60 * 60 * 1000);
    
    console.log('✓ Bandwidth tracking started');
  }

  // Get usage report
  getUsageReport(userId = null, days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    let query = `
      SELECT 
        DATE(created_at) as date,
        type,
        SUM(bytes) as bytes,
        COUNT(*) as operations
      FROM bandwidth_usage
      WHERE created_at > ?
    `;
    
    const params = [cutoff];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    query += ' GROUP BY date, type ORDER BY date DESC';
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(params);
    stmt.free();
    
    return rows;
  }

  // Cleanup old bandwidth records
  async cleanupOld(days = 90) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      DELETE FROM bandwidth_usage WHERE created_at < ?
    `);
    
    const result = stmt.run([cutoff]);
    stmt.free();
    saveDatabase();
    
    console.log(`🧹 Cleaned up ${result.changes} old bandwidth records`);
    return result.changes;
  }
}

module.exports = new BandwidthMonitorService();
