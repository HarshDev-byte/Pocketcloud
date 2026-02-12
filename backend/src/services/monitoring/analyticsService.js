const { getDatabase, saveDatabase } = require('../../config/database');
const websocketService = require('./websocketService');

class AnalyticsService {
  constructor() {
    this.realtimeMetrics = {
      uploads: 0,
      downloads: 0,
      activeUsers: 0,
      storageUsed: 0,
      bandwidth: {
        upload: 0,
        download: 0
      }
    };

    // Reset bandwidth counters every minute
    setInterval(() => {
      this.realtimeMetrics.bandwidth = { upload: 0, download: 0 };
    }, 60000);
  }

  /**
   * Track event
   */
  async trackEvent(eventType, userId = null, data = null) {
    try {
      const db = getDatabase();
      
      db.run(
        `INSERT INTO analytics_events (event_type, user_id, data)
         VALUES (?, ?, ?)`,
        [eventType, userId, JSON.stringify(data)]
      );

      saveDatabase();
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }

  /**
   * Track file upload
   */
  async trackUpload(userId, fileSize) {
    this.realtimeMetrics.uploads++;
    this.realtimeMetrics.bandwidth.upload += fileSize;
    
    await this.trackEvent('file.upload', userId, { size: fileSize });
    this.broadcastMetrics();
  }

  /**
   * Track file download
   */
  async trackDownload(userId, fileSize) {
    this.realtimeMetrics.downloads++;
    this.realtimeMetrics.bandwidth.download += fileSize;
    
    await this.trackEvent('file.download', userId, { size: fileSize });
    this.broadcastMetrics();
  }

  /**
   * Update active users count
   */
  updateActiveUsers() {
    this.realtimeMetrics.activeUsers = websocketService.getOnlineUserCount();
    this.broadcastMetrics();
  }

  /**
   * Update storage used
   */
  async updateStorageUsed(userId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT SUM(size) FROM files 
         WHERE user_id = ${userId} AND status = 'active'`
      )[0];

      const storageUsed = result?.values[0][0] || 0;
      this.realtimeMetrics.storageUsed = storageUsed;
      
      this.broadcastMetrics();
      
      return storageUsed;
    } catch (error) {
      console.error('Error updating storage used:', error);
      return 0;
    }
  }

  /**
   * Broadcast metrics to all connected clients
   */
  broadcastMetrics() {
    websocketService.broadcastToAll('dashboard:update', {
      metrics: this.realtimeMetrics,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(userId) {
    try {
      const db = getDatabase();
      
      // File counts
      const fileCount = db.exec(
        `SELECT COUNT(*) FROM files 
         WHERE user_id = ${userId} AND status = 'active'`
      )[0];

      // Storage used
      const storageUsed = db.exec(
        `SELECT SUM(size) FROM files 
         WHERE user_id = ${userId} AND status = 'active'`
      )[0];

      // Recent uploads (last 24 hours)
      const recentUploads = db.exec(
        `SELECT COUNT(*) FROM files 
         WHERE user_id = ${userId} 
         AND datetime(uploaded_at) > datetime('now', '-24 hours')`
      )[0];

      // File type distribution
      const fileTypes = db.exec(
        `SELECT mimetype, COUNT(*) as count 
         FROM files 
         WHERE user_id = ${userId} AND status = 'active'
         GROUP BY mimetype 
         ORDER BY count DESC 
         LIMIT 10`
      )[0];

      return {
        totalFiles: fileCount?.values[0][0] || 0,
        storageUsed: storageUsed?.values[0][0] || 0,
        recentUploads24h: recentUploads?.values[0][0] || 0,
        activeUsers: this.realtimeMetrics.activeUsers,
        fileTypes: fileTypes?.values.map(row => ({
          type: row[0],
          count: row[1]
        })) || [],
        realtime: this.realtimeMetrics
      };
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      return null;
    }
  }

  /**
   * Get storage analytics
   */
  async getStorageAnalytics(userId) {
    try {
      const db = getDatabase();
      
      // Storage by file type
      const byType = db.exec(
        `SELECT mimetype, SUM(size) as total_size, COUNT(*) as count
         FROM files 
         WHERE user_id = ${userId} AND status = 'active'
         GROUP BY mimetype 
         ORDER BY total_size DESC`
      )[0];

      // Storage over time (last 30 days)
      const overTime = db.exec(
        `SELECT DATE(uploaded_at) as date, SUM(size) as size
         FROM files 
         WHERE user_id = ${userId} 
         AND datetime(uploaded_at) > datetime('now', '-30 days')
         GROUP BY DATE(uploaded_at)
         ORDER BY date ASC`
      )[0];

      // Largest files
      const largestFiles = db.exec(
        `SELECT id, filename, size, uploaded_at
         FROM files 
         WHERE user_id = ${userId} AND status = 'active'
         ORDER BY size DESC 
         LIMIT 10`
      )[0];

      return {
        byType: byType?.values.map(row => ({
          type: row[0],
          size: row[1],
          count: row[2]
        })) || [],
        overTime: overTime?.values.map(row => ({
          date: row[0],
          size: row[1]
        })) || [],
        largestFiles: largestFiles?.values.map(row => ({
          id: row[0],
          filename: row[1],
          size: row[2],
          uploadedAt: row[3]
        })) || []
      };
    } catch (error) {
      console.error('Error getting storage analytics:', error);
      return null;
    }
  }

  /**
   * Get activity analytics
   */
  async getActivityAnalytics(userId, days = 7) {
    try {
      const db = getDatabase();
      
      // Activity by day
      const byDay = db.exec(
        `SELECT DATE(created_at) as date, event_type, COUNT(*) as count
         FROM analytics_events 
         WHERE user_id = ${userId}
         AND datetime(created_at) > datetime('now', '-${days} days')
         GROUP BY DATE(created_at), event_type
         ORDER BY date ASC`
      )[0];

      // Activity by hour (today)
      const byHour = db.exec(
        `SELECT strftime('%H', created_at) as hour, COUNT(*) as count
         FROM analytics_events 
         WHERE user_id = ${userId}
         AND DATE(created_at) = DATE('now')
         GROUP BY hour
         ORDER BY hour ASC`
      )[0];

      // Most active days
      const mostActive = db.exec(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM analytics_events 
         WHERE user_id = ${userId}
         AND datetime(created_at) > datetime('now', '-30 days')
         GROUP BY DATE(created_at)
         ORDER BY count DESC
         LIMIT 5`
      )[0];

      return {
        byDay: byDay?.values.map(row => ({
          date: row[0],
          eventType: row[1],
          count: row[2]
        })) || [],
        byHour: byHour?.values.map(row => ({
          hour: row[0],
          count: row[1]
        })) || [],
        mostActive: mostActive?.values.map(row => ({
          date: row[0],
          count: row[1]
        })) || []
      };
    } catch (error) {
      console.error('Error getting activity analytics:', error);
      return null;
    }
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(userId) {
    try {
      const db = getDatabase();
      
      // Total events
      const totalEvents = db.exec(
        `SELECT COUNT(*) FROM analytics_events WHERE user_id = ${userId}`
      )[0];

      // Events by type
      const byType = db.exec(
        `SELECT event_type, COUNT(*) as count
         FROM analytics_events 
         WHERE user_id = ${userId}
         GROUP BY event_type
         ORDER BY count DESC`
      )[0];

      // Recent activity
      const recentActivity = db.exec(
        `SELECT event_type, data, created_at
         FROM analytics_events 
         WHERE user_id = ${userId}
         ORDER BY created_at DESC
         LIMIT 20`
      )[0];

      return {
        totalEvents: totalEvents?.values[0][0] || 0,
        byType: byType?.values.map(row => ({
          type: row[0],
          count: row[1]
        })) || [],
        recentActivity: recentActivity?.values.map(row => ({
          type: row[0],
          data: JSON.parse(row[1] || '{}'),
          createdAt: row[2]
        })) || []
      };
    } catch (error) {
      console.error('Error getting user analytics:', error);
      return null;
    }
  }

  /**
   * Get system-wide analytics (admin only)
   */
  async getSystemAnalytics() {
    try {
      const db = getDatabase();
      
      // Total users
      const totalUsers = db.exec('SELECT COUNT(*) FROM users')[0];

      // Total files
      const totalFiles = db.exec(
        'SELECT COUNT(*) FROM files WHERE status = "active"'
      )[0];

      // Total storage
      const totalStorage = db.exec(
        'SELECT SUM(size) FROM files WHERE status = "active"'
      )[0];

      // Active users (last 24 hours)
      const activeUsers = db.exec(
        `SELECT COUNT(DISTINCT user_id) FROM analytics_events 
         WHERE datetime(created_at) > datetime('now', '-24 hours')`
      )[0];

      // Events by type (last 24 hours)
      const eventsByType = db.exec(
        `SELECT event_type, COUNT(*) as count
         FROM analytics_events 
         WHERE datetime(created_at) > datetime('now', '-24 hours')
         GROUP BY event_type
         ORDER BY count DESC`
      )[0];

      return {
        totalUsers: totalUsers?.values[0][0] || 0,
        totalFiles: totalFiles?.values[0][0] || 0,
        totalStorage: totalStorage?.values[0][0] || 0,
        activeUsers24h: activeUsers?.values[0][0] || 0,
        eventsByType24h: eventsByType?.values.map(row => ({
          type: row[0],
          count: row[1]
        })) || [],
        realtime: this.realtimeMetrics
      };
    } catch (error) {
      console.error('Error getting system analytics:', error);
      return null;
    }
  }

  /**
   * Clean old analytics events
   */
  async cleanupOld(days = 90) {
    try {
      const db = getDatabase();
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffISO = cutoffDate.toISOString();

      const result = db.run(
        `DELETE FROM analytics_events 
         WHERE datetime(created_at) < datetime('${cutoffISO}')`
      );

      saveDatabase();

      console.log(`Cleaned up ${result.changes || 0} old analytics events`);
      return result.changes || 0;
    } catch (error) {
      console.error('Error cleaning up analytics:', error);
      return 0;
    }
  }
}

module.exports = new AnalyticsService();
