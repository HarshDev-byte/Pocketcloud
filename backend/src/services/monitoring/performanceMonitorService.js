const { getDatabase, saveDatabase } = require('../../config/database');

class PerformanceMonitorService {
  constructor() {
    this.metrics = {
      requests: [],
      queries: [],
      memory: [],
      throughput: { count: 0, startTime: Date.now() }
    };
    this.slowQueryThreshold = 50; // ms
    this.slowRequestThreshold = 1000; // ms
  }

  // Initialize performance monitoring
  init(db) {
    this.db = db;
    this.createTables();
    this.startMemoryMonitoring();
  }

  // Create performance_metrics table
  createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    this.db.run('CREATE INDEX IF NOT EXISTS idx_perf_type ON performance_metrics(metric_type)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_perf_created ON performance_metrics(created_at)');
    saveDatabase();
  }

  // Middleware to track request timing
  requestTimingMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Track response
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.trackRequest(req.method, req.path, duration, res.statusCode);
      });
      
      next();
    };
  }

  // Track individual request
  trackRequest(method, path, duration, statusCode) {
    const metric = {
      method,
      path,
      duration,
      statusCode,
      timestamp: Date.now()
    };

    this.metrics.requests.push(metric);
    this.metrics.throughput.count++;

    // Keep only last 1000 requests in memory
    if (this.metrics.requests.length > 1000) {
      this.metrics.requests.shift();
    }

    // Log slow requests
    if (duration > this.slowRequestThreshold) {
      console.warn(`⚠️ Slow request: ${method} ${path} took ${duration}ms`);
      this.recordMetric('request', 'slow_request', duration, 'ms', JSON.stringify({ method, path, statusCode }));
    }

    // Record to database periodically
    if (this.metrics.requests.length % 100 === 0) {
      this.recordMetric('request', 'response_time', duration, 'ms', JSON.stringify({ method, path }));
    }
  }

  // Track database query performance
  trackQuery(query, duration, rowCount = 0) {
    const metric = {
      query: query.substring(0, 100), // First 100 chars
      duration,
      rowCount,
      timestamp: Date.now()
    };

    this.metrics.queries.push(metric);

    // Keep only last 500 queries in memory
    if (this.metrics.queries.length > 500) {
      this.metrics.queries.shift();
    }

    // Log slow queries
    if (duration > this.slowQueryThreshold) {
      console.warn(`⚠️ Slow query: ${query.substring(0, 50)}... took ${duration}ms`);
      this.recordMetric('query', 'slow_query', duration, 'ms', JSON.stringify({ query: query.substring(0, 100) }));
    }
  }

  // Start memory monitoring
  startMemoryMonitoring() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      
      this.metrics.memory.push({
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external,
        timestamp: Date.now()
      });

      // Keep only last 100 memory snapshots
      if (this.metrics.memory.length > 100) {
        this.metrics.memory.shift();
      }

      // Record to database every 10 snapshots
      if (this.metrics.memory.length % 10 === 0) {
        this.recordMetric('memory', 'heap_used', memUsage.heapUsed / 1024 / 1024, 'MB');
        this.recordMetric('memory', 'rss', memUsage.rss / 1024 / 1024, 'MB');
      }
    }, 30000); // Every 30 seconds
  }

  // Record metric to database
  recordMetric(type, name, value, unit = null, tags = null) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO performance_metrics (metric_type, metric_name, value, unit, tags)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run([type, name, value, unit, tags]);
      stmt.free();
      saveDatabase();
    } catch (error) {
      console.error('Error recording metric:', error);
    }
  }

  // Get response time metrics
  getResponseTimeMetrics() {
    const requests = this.metrics.requests;
    if (requests.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
    }

    const durations = requests.map(r => r.duration).sort((a, b) => a - b);
    const len = durations.length;

    return {
      p50: durations[Math.floor(len * 0.5)],
      p95: durations[Math.floor(len * 0.95)],
      p99: durations[Math.floor(len * 0.99)],
      avg: durations.reduce((a, b) => a + b, 0) / len,
      min: durations[0],
      max: durations[len - 1],
      count: len
    };
  }

  // Get query performance metrics
  getQueryMetrics() {
    const queries = this.metrics.queries;
    if (queries.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0, slowQueries: 0 };
    }

    const durations = queries.map(q => q.duration).sort((a, b) => a - b);
    const len = durations.length;
    const slowQueries = queries.filter(q => q.duration > this.slowQueryThreshold).length;

    return {
      p50: durations[Math.floor(len * 0.5)],
      p95: durations[Math.floor(len * 0.95)],
      p99: durations[Math.floor(len * 0.99)],
      avg: durations.reduce((a, b) => a + b, 0) / len,
      slowQueries,
      count: len
    };
  }

  // Get memory metrics
  getMemoryMetrics() {
    const memory = this.metrics.memory;
    if (memory.length === 0) {
      return { heapUsed: 0, heapTotal: 0, rss: 0, external: 0 };
    }

    const latest = memory[memory.length - 1];
    return {
      heapUsed: (latest.heapUsed / 1024 / 1024).toFixed(2),
      heapTotal: (latest.heapTotal / 1024 / 1024).toFixed(2),
      rss: (latest.rss / 1024 / 1024).toFixed(2),
      external: (latest.external / 1024 / 1024).toFixed(2),
      unit: 'MB'
    };
  }

  // Get throughput metrics
  getThroughputMetrics() {
    const elapsed = (Date.now() - this.metrics.throughput.startTime) / 1000; // seconds
    const requestsPerSecond = this.metrics.throughput.count / elapsed;

    return {
      totalRequests: this.metrics.throughput.count,
      requestsPerSecond: requestsPerSecond.toFixed(2),
      uptime: elapsed.toFixed(0)
    };
  }

  // Get all metrics
  getAllMetrics() {
    return {
      responseTime: this.getResponseTimeMetrics(),
      queries: this.getQueryMetrics(),
      memory: this.getMemoryMetrics(),
      throughput: this.getThroughputMetrics()
    };
  }

  // Get historical metrics from database
  getHistoricalMetrics(type, hours = 24) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      SELECT metric_name, value, unit, created_at
      FROM performance_metrics
      WHERE metric_type = ? AND created_at > ?
      ORDER BY created_at DESC
      LIMIT 1000
    `);
    
    const rows = stmt.all([type, cutoff]);
    stmt.free();
    
    return rows;
  }

  // Cleanup old metrics
  async cleanupOld(days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare(`
      DELETE FROM performance_metrics WHERE created_at < ?
    `);
    
    const result = stmt.run([cutoff]);
    stmt.free();
    saveDatabase();
    
    console.log(`🧹 Cleaned up ${result.changes} old performance metrics`);
    return result.changes;
  }
}

module.exports = new PerformanceMonitorService();
