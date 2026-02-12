const { getDatabase, saveDatabase } = require('../../config/database');

class ErrorTrackerService {
  constructor() {
    this.errorCache = [];
    this.errorRateWindow = 60000; // 1 minute
    this.alertThreshold = 10; // errors per minute
  }

  // Initialize error tracking
  init(db) {
    this.db = db;
    this.createTables();
  }

  // Create error_logs table
  createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_type TEXT NOT NULL,
        message TEXT NOT NULL,
        stack_trace TEXT,
        user_id INTEGER,
        request_url TEXT,
        request_method TEXT,
        status_code INTEGER,
        resolved BOOLEAN DEFAULT 0,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    this.db.run('CREATE INDEX IF NOT EXISTS idx_error_type ON error_logs(error_type)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_error_resolved ON error_logs(resolved)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_error_created ON error_logs(created_at)');
    saveDatabase();
  }

  // Middleware to catch errors
  errorHandlerMiddleware() {
    return (err, req, res, next) => {
      // Log error
      this.captureError(err, {
        userId: req.user?.id,
        requestUrl: req.originalUrl,
        requestMethod: req.method,
        statusCode: err.statusCode || 500
      });

      // Send response
      res.status(err.statusCode || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    };
  }

  // Capture error
  captureError(error, context = {}) {
    const errorData = {
      type: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack || '',
      userId: context.userId || null,
      requestUrl: context.requestUrl || null,
      requestMethod: context.requestMethod || null,
      statusCode: context.statusCode || 500,
      timestamp: Date.now()
    };

    // Add to cache
    this.errorCache.push(errorData);

    // Keep only last 100 errors in memory
    if (this.errorCache.length > 100) {
      this.errorCache.shift();
    }

    // Check error rate
    this.checkErrorRate();

    // Save to database
    this.saveError(errorData);

    // Log to console
    console.error(`❌ Error captured: ${errorData.type} - ${errorData.message}`);
  }

  // Save error to database
  saveError(errorData) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO error_logs (
          error_type, message, stack_trace, user_id,
          request_url, request_method, status_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run([
        errorData.type,
        errorData.message,
        errorData.stack,
        errorData.userId,
        errorData.requestUrl,
        errorData.requestMethod,
        errorData.statusCode
      ]);
      
      stmt.free();
      saveDatabase();
    } catch (error) {
      console.error('Error saving error log:', error);
    }
  }

  // Check error rate and alert if threshold exceeded
  checkErrorRate() {
    const now = Date.now();
    const recentErrors = this.errorCache.filter(
      e => now - e.timestamp < this.errorRateWindow
    );

    if (recentErrors.length >= this.alertThreshold) {
      console.warn(`⚠️ High error rate: ${recentErrors.length} errors in last minute`);
      // Could trigger alert service here
    }
  }

  // Get all errors
  getAllErrors(limit = 100, offset = 0, resolved = null) {
    let query = 'SELECT * FROM error_logs';
    const params = [];

    if (resolved !== null) {
      query += ' WHERE resolved = ?';
      params.push(resolved ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(params);
    stmt.free();

    return rows;
  }

  // Get error by ID
  getErrorById(id) {
    const stmt = this.db.prepare('SELECT * FROM error_logs WHERE id = ?');
    const row = stmt.get([id]);
    stmt.free();
    return row;
  }

  // Get error statistics
  getErrorStats() {
    // Total errors
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM error_logs');
    const total = totalStmt.get([]).count;
    totalStmt.free();

    // Unresolved errors
    const unresolvedStmt = this.db.prepare('SELECT COUNT(*) as count FROM error_logs WHERE resolved = 0');
    const unresolved = unresolvedStmt.get([]).count;
    unresolvedStmt.free();

    // Errors by type
    const byTypeStmt = this.db.prepare(`
      SELECT error_type, COUNT(*) as count
      FROM error_logs
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 10
    `);
    const byType = byTypeStmt.all([]);
    byTypeStmt.free();

    // Recent error rate (last hour)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM error_logs WHERE created_at > ?
    `);
    const recentCount = recentStmt.get([hourAgo]).count;
    recentStmt.free();

    return {
      total,
      unresolved,
      resolved: total - unresolved,
      byType,
      recentHour: recentCount,
      errorRate: (recentCount / 60).toFixed(2) // per minute
    };
  }

  // Get error trends
  getErrorTrends(days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        error_type
      FROM error_logs
      WHERE created_at > ?
      GROUP BY DATE(created_at), error_type
      ORDER BY date DESC
    `);
    
    const rows = stmt.all([cutoff]);
    stmt.free();
    
    return rows;
  }

  // Mark error as resolved
  resolveError(id) {
    const stmt = this.db.prepare(`
      UPDATE error_logs
      SET resolved = 1, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run([id]);
    stmt.free();
    saveDatabase();
    
    return result.changes > 0;
  }

  // Bulk resolve errors
  bulkResolveErrors(errorType) {
    const stmt = this.db.prepare(`
      UPDATE error_logs
      SET resolved = 1, resolved_at = CURRENT_TIMESTAMP
      WHERE error_type = ? AND resolved = 0
    `);
    
    const result = stmt.run([errorType]);
    stmt.free();
    saveDatabase();
    
    console.log(`✓ Resolved ${result.changes} errors of type: ${errorType}`);
    return result.changes;
  }

  // Get errors by endpoint
  getErrorsByEndpoint(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT 
        request_url,
        request_method,
        COUNT(*) as count,
        MAX(created_at) as last_error
      FROM error_logs
      WHERE request_url IS NOT NULL
      GROUP BY request_url, request_method
      ORDER BY count DESC
      LIMIT ?
    `);
    
    const rows = stmt.all([limit]);
    stmt.free();
    
    return rows;
  }

  // Cleanup old errors
  async cleanupOld(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      DELETE FROM error_logs WHERE created_at < ? AND resolved = 1
    `);
    
    const result = stmt.run([cutoff]);
    stmt.free();
    saveDatabase();
    
    console.log(`🧹 Cleaned up ${result.changes} old error logs`);
    return result.changes;
  }
}

module.exports = new ErrorTrackerService();
