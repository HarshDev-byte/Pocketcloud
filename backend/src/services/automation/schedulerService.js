const cron = require('node-cron');
const { getDatabase, saveDatabase } = require('../../config/database');

class SchedulerService {
  constructor() {
    this.jobs = new Map(); // taskId -> cron job
    this.taskTypes = ['backup', 'cleanup', 'duplicate_scan', 'thumbnail_gen', 'custom'];
  }

  /**
   * Initialize scheduler - load and start all enabled tasks
   */
  async initialize() {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        'SELECT * FROM scheduled_tasks WHERE enabled = 1'
      )[0];

      if (result && result.values.length > 0) {
        for (const row of result.values) {
          const task = this.formatTask(row);
          await this.startTask(task);
        }
      }

      console.log(`✓ Scheduler initialized with ${this.jobs.size} tasks`);
    } catch (error) {
      console.error('Error initializing scheduler:', error);
    }
  }

  /**
   * Create scheduled task
   */
  async createTask(userId, name, type, schedule, config = {}) {
    try {
      // Validate cron expression
      if (!cron.validate(schedule)) {
        throw new Error('Invalid cron schedule');
      }

      const db = getDatabase();
      
      db.run(
        `INSERT INTO scheduled_tasks (user_id, name, type, schedule, config)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, name, type, schedule, JSON.stringify(config)]
      );

      saveDatabase();

      const result = db.exec(
        `SELECT * FROM scheduled_tasks 
         ORDER BY id DESC LIMIT 1`
      )[0];

      if (result && result.values.length > 0) {
        const task = this.formatTask(result.values[0]);
        await this.startTask(task);
        return task;
      }
    } catch (error) {
      console.error('Error creating scheduled task:', error);
      throw error;
    }
  }

  /**
   * Get all tasks
   */
  async getAllTasks(userId = null) {
    try {
      const db = getDatabase();
      
      let query = 'SELECT * FROM scheduled_tasks';
      if (userId) {
        query += ` WHERE user_id = ${userId} OR user_id IS NULL`;
      }
      query += ' ORDER BY created_at DESC';

      const result = db.exec(query)[0];

      if (!result || !result.values.length) {
        return [];
      }

      return result.values.map(row => this.formatTask(row));
    } catch (error) {
      console.error('Error getting tasks:', error);
      return [];
    }
  }

  /**
   * Get task by ID
   */
  async getTask(taskId) {
    try {
      const db = getDatabase();
      
      const result = db.exec(
        `SELECT * FROM scheduled_tasks WHERE id = ${taskId}`
      )[0];

      if (!result || !result.values.length) {
        return null;
      }

      return this.formatTask(result.values[0]);
    } catch (error) {
      console.error('Error getting task:', error);
      return null;
    }
  }

  /**
   * Update task
   */
  async updateTask(taskId, updates) {
    try {
      const db = getDatabase();
      
      const { name, schedule, config, enabled } = updates;
      
      const sets = [];
      const values = [];
      
      if (name !== undefined) {
        sets.push('name = ?');
        values.push(name);
      }
      if (schedule !== undefined) {
        if (!cron.validate(schedule)) {
          throw new Error('Invalid cron schedule');
        }
        sets.push('schedule = ?');
        values.push(schedule);
      }
      if (config !== undefined) {
        sets.push('config = ?');
        values.push(JSON.stringify(config));
      }
      if (enabled !== undefined) {
        sets.push('enabled = ?');
        values.push(enabled ? 1 : 0);
      }
      
      values.push(taskId);
      
      db.run(
        `UPDATE scheduled_tasks 
         SET ${sets.join(', ')}
         WHERE id = ?`,
        values
      );

      saveDatabase();

      // Restart task if it was running
      if (this.jobs.has(taskId)) {
        this.stopTask(taskId);
      }

      const task = await this.getTask(taskId);
      if (task && task.enabled) {
        await this.startTask(task);
      }

      return task;
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  /**
   * Delete task
   */
  async deleteTask(taskId) {
    try {
      this.stopTask(taskId);

      const db = getDatabase();
      db.run('DELETE FROM scheduled_tasks WHERE id = ?', [taskId]);
      saveDatabase();

      return { success: true };
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  }

  /**
   * Start task
   */
  async startTask(task) {
    try {
      if (this.jobs.has(task.id)) {
        console.log(`Task ${task.id} already running`);
        return;
      }

      const job = cron.schedule(task.schedule, async () => {
        console.log(`Running scheduled task: ${task.name}`);
        await this.executeTask(task);
      });

      this.jobs.set(task.id, job);
      console.log(`Started task: ${task.name} (${task.schedule})`);
    } catch (error) {
      console.error('Error starting task:', error);
    }
  }

  /**
   * Stop task
   */
  stopTask(taskId) {
    try {
      const job = this.jobs.get(taskId);
      if (job) {
        job.stop();
        this.jobs.delete(taskId);
        console.log(`Stopped task: ${taskId}`);
      }
    } catch (error) {
      console.error('Error stopping task:', error);
    }
  }

  /**
   * Execute task
   */
  async executeTask(task) {
    try {
      const startTime = Date.now();
      
      let result;
      switch (task.type) {
        case 'backup':
          result = await this.executeBackupTask(task);
          break;
        case 'cleanup':
          result = await this.executeCleanupTask(task);
          break;
        case 'duplicate_scan':
          result = await this.executeDuplicateScanTask(task);
          break;
        case 'thumbnail_gen':
          result = await this.executeThumbnailGenTask(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      const duration = Date.now() - startTime;

      // Update last run
      const db = getDatabase();
      db.run(
        'UPDATE scheduled_tasks SET last_run = CURRENT_TIMESTAMP WHERE id = ?',
        [task.id]
      );
      saveDatabase();

      console.log(`Task ${task.name} completed in ${duration}ms`);
      return result;
    } catch (error) {
      console.error(`Error executing task ${task.name}:`, error);
      throw error;
    }
  }

  /**
   * Execute backup task
   */
  async executeBackupTask(task) {
    const backupService = require('../core/cloudBackupService');
    
    if (task.userId) {
      return await backupService.createBackup(task.userId, task.config);
    } else {
      // System-wide backup
      return { message: 'System backup not implemented' };
    }
  }

  /**
   * Execute cleanup task
   */
  async executeCleanupTask(task) {
    const results = {};

    if (task.config.cleanTrash) {
      const trashService = require('../core/trashService');
      results.trash = await trashService.emptyTrash(task.userId);
    }

    if (task.config.cleanTemp) {
      // Clean temp files
      results.temp = { cleaned: 0 };
    }

    if (task.config.cleanOldLogs) {
      const auditLogService = require('../security/auditLogService');
      results.logs = await auditLogService.cleanupOld(90);
    }

    return results;
  }

  /**
   * Execute duplicate scan task
   */
  async executeDuplicateScanTask(task) {
    const duplicateService = require('../core/duplicateService');
    
    if (task.userId) {
      const duplicates = await duplicateService.findDuplicates(task.userId);
      
      if (task.config.autoDelete && duplicates.length > 0) {
        await duplicateService.deleteDuplicates(task.userId, task.config.keep || 'oldest');
      }

      return { found: duplicates.length };
    }

    return { found: 0 };
  }

  /**
   * Execute thumbnail generation task
   */
  async executeThumbnailGenTask(task) {
    const thumbnailService = require('../media/thumbnailService');
    const db = getDatabase();
    
    // Get files without thumbnails
    let query = `SELECT id FROM files 
                 WHERE status = 'active' 
                 AND thumbnail_medium IS NULL`;
    
    if (task.userId) {
      query += ` AND user_id = ${task.userId}`;
    }
    
    query += ' LIMIT 100';

    const result = db.exec(query)[0];
    
    if (!result || !result.values.length) {
      return { generated: 0 };
    }

    let generated = 0;
    for (const row of result.values) {
      const fileId = row[0];
      try {
        await thumbnailService.generateThumbnail(fileId, 'medium');
        generated++;
      } catch (error) {
        console.error(`Error generating thumbnail for file ${fileId}:`, error);
      }
    }

    return { generated };
  }

  /**
   * Run task manually
   */
  async runTaskNow(taskId) {
    const task = await this.getTask(taskId);
    
    if (!task) {
      throw new Error('Task not found');
    }

    return await this.executeTask(task);
  }

  /**
   * Format task from database row
   */
  formatTask(row) {
    return {
      id: row[0],
      userId: row[1],
      name: row[2],
      type: row[3],
      schedule: row[4],
      config: JSON.parse(row[5] || '{}'),
      enabled: row[6] === 1,
      lastRun: row[7],
      nextRun: row[8],
      createdAt: row[9]
    };
  }

  /**
   * Get scheduler statistics
   */
  getStats() {
    return {
      totalJobs: this.jobs.size,
      runningJobs: Array.from(this.jobs.keys())
    };
  }
}

module.exports = new SchedulerService();
