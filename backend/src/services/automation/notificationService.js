const { getDatabase, saveDatabase } = require('../../config/database');
const webpush = require('web-push');

class NotificationService {
  constructor() {
    // Configure web push (set VAPID keys in environment)
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        'mailto:' + (process.env.ADMIN_EMAIL || 'admin@pocketcloud.local'),
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    }
  }

  /**
   * Create notification
   */
  async create(userId, type, title, message, data = null) {
    try {
      const db = getDatabase();
      
      db.run(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, type, title, message, JSON.stringify(data)]
      );

      saveDatabase();

      // Get the created notification
      const result = db.exec(
        `SELECT id, user_id, type, title, message, data, read, created_at
         FROM notifications 
         WHERE user_id = ${userId}
         ORDER BY id DESC LIMIT 1`
      )[0];

      if (result && result.values.length > 0) {
        const row = result.values[0];
        const notification = {
          id: row[0],
          userId: row[1],
          type: row[2],
          title: row[3],
          message: row[4],
          data: JSON.parse(row[5] || '{}'),
          read: row[6] === 1,
          createdAt: row[7]
        };

        // Send real-time notification
        this.sendRealtime(userId, notification);

        // Send push notification if enabled
        await this.sendPush(userId, notification);

        return notification;
      }
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Send real-time notification via WebSocket
   */
  sendRealtime(userId, notification) {
    try {
      const websocketService = require('./websocketService');
      websocketService.emitToUser(userId, 'notification:new', notification);
    } catch (error) {
      console.error('Error sending real-time notification:', error);
    }
  }

  /**
   * Send push notification
   */
  async sendPush(userId, notification) {
    try {
      const subscriptions = await this.getUserSubscriptions(userId);
      
      const payload = JSON.stringify({
        title: notification.title,
        body: notification.message,
        icon: '/icon.png',
        badge: '/badge.png',
        data: notification.data
      });

      const promises = subscriptions.map(sub => {
        return webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: JSON.parse(sub.keys)
          },
          payload
        ).catch(error => {
          console.error('Push notification error:', error);
          // Remove invalid subscription
          if (error.statusCode === 410) {
            this.removeSubscription(sub.id);
          }
        });
      });

      await Promise.all(promises);
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const { limit = 50, offset = 0, unreadOnly = false } = options;
      const db = getDatabase();
      
      let query = `SELECT id, type, title, message, data, read, read_at, created_at
                   FROM notifications 
                   WHERE user_id = ${userId}`;
      
      if (unreadOnly) {
        query += ' AND read = 0';
      }
      
      query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const result = db.exec(query)[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        id: row[0],
        type: row[1],
        title: row[2],
        message: row[3],
        data: JSON.parse(row[4] || '{}'),
        read: row[5] === 1,
        readAt: row[6],
        createdAt: row[7]
      }));
    } catch (error) {
      console.error('Error getting notifications:', error);
      return [];
    }
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT COUNT(*) FROM notifications 
         WHERE user_id = ${userId} AND read = 0`
      )[0];

      return result?.values[0][0] || 0;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    try {
      const db = getDatabase();
      
      db.run(
        `UPDATE notifications 
         SET read = 1, read_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [notificationId, userId]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId) {
    try {
      const db = getDatabase();
      
      db.run(
        `UPDATE notifications 
         SET read = 1, read_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND read = 0`,
        [userId]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error marking all as read:', error);
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async delete(notificationId, userId) {
    try {
      const db = getDatabase();
      
      db.run(
        'DELETE FROM notifications WHERE id = ? AND user_id = ?',
        [notificationId, userId]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Delete all notifications
   */
  async deleteAll(userId) {
    try {
      const db = getDatabase();
      
      db.run('DELETE FROM notifications WHERE user_id = ?', [userId]);
      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error deleting all notifications:', error);
      throw error;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(userId, subscription) {
    try {
      const db = getDatabase();
      
      db.run(
        `INSERT INTO push_subscriptions (user_id, endpoint, keys)
         VALUES (?, ?, ?)`,
        [userId, subscription.endpoint, JSON.stringify(subscription.keys)]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        // Subscription already exists
        return { success: true };
      }
      console.error('Error subscribing to push:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(userId, endpoint) {
    try {
      const db = getDatabase();
      
      db.run(
        'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
        [userId, endpoint]
      );

      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      throw error;
    }
  }

  /**
   * Get user subscriptions
   */
  async getUserSubscriptions(userId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = ${userId}`
      )[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => ({
        id: row[0],
        endpoint: row[1],
        keys: row[2]
      }));
    } catch (error) {
      console.error('Error getting subscriptions:', error);
      return [];
    }
  }

  /**
   * Remove subscription
   */
  async removeSubscription(subscriptionId) {
    try {
      const db = getDatabase();
      
      db.run('DELETE FROM push_subscriptions WHERE id = ?', [subscriptionId]);
      saveDatabase();
    } catch (error) {
      console.error('Error removing subscription:', error);
    }
  }

  /**
   * Notification helpers for common events
   */
  async notifyFileUploaded(userId, filename) {
    return this.create(
      userId,
      'file.uploaded',
      'File Uploaded',
      `${filename} has been uploaded successfully`,
      { filename }
    );
  }

  async notifyFileShared(userId, filename, sharedBy) {
    return this.create(
      userId,
      'file.shared',
      'File Shared',
      `${sharedBy} shared ${filename} with you`,
      { filename, sharedBy }
    );
  }

  async notifyCommentMention(userId, filename, mentionedBy) {
    return this.create(
      userId,
      'comment.mention',
      'You were mentioned',
      `${mentionedBy} mentioned you in a comment on ${filename}`,
      { filename, mentionedBy }
    );
  }

  async notifyStorageFull(userId, percentage) {
    return this.create(
      userId,
      'storage.full',
      'Storage Almost Full',
      `Your storage is ${percentage}% full`,
      { percentage }
    );
  }

  async notifySecurityAlert(userId, alertType, details) {
    return this.create(
      userId,
      'security.alert',
      'Security Alert',
      `Security event detected: ${alertType}`,
      { alertType, details }
    );
  }

  async notifyBackupComplete(userId, fileCount) {
    return this.create(
      userId,
      'backup.complete',
      'Backup Complete',
      `Successfully backed up ${fileCount} files`,
      { fileCount }
    );
  }

  /**
   * Clean old notifications
   */
  async cleanupOld(days = 30) {
    try {
      const db = getDatabase();
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffISO = cutoffDate.toISOString();

      const result = db.run(
        `DELETE FROM notifications 
         WHERE read = 1 
         AND datetime(created_at) < datetime('${cutoffISO}')`
      );

      saveDatabase();

      console.log(`Cleaned up ${result.changes || 0} old notifications`);
      return result.changes || 0;
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
      return 0;
    }
  }
}

module.exports = new NotificationService();
