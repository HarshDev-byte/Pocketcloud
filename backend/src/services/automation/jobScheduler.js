/**
 * Job Scheduler Service
 * Handles background tasks and scheduled jobs
 */

const trashService = require('../core/trashService');
const thumbnailService = require('../media/thumbnailService');
const duplicateService = require('../core/duplicateService');

class JobScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }
  
  /**
   * Start the job scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('Job scheduler already running');
      return;
    }
    
    this.isRunning = true;
    console.log('✓ Job scheduler started');
    
    // Auto-cleanup trash every hour
    this.scheduleJob('trash-cleanup', 60 * 60 * 1000, async () => {
      console.log('Running trash auto-cleanup...');
      const result = await trashService.autoCleanup();
      if (result.success && result.count > 0) {
        console.log(`✓ Cleaned up ${result.count} old files from trash`);
      }
    });
    
    // Initialize thumbnail service
    thumbnailService.init().catch(err => {
      console.error('Thumbnail service init error:', err);
    });
    
    console.log('✓ Background jobs scheduled');
  }
  
  /**
   * Stop the job scheduler
   */
  stop() {
    this.jobs.forEach((job) => {
      if (job.interval) {
        clearInterval(job.interval);
      }
    });
    this.jobs.clear();
    this.isRunning = false;
    console.log('✓ Job scheduler stopped');
  }
  
  /**
   * Schedule a recurring job
   */
  scheduleJob(name, intervalMs, callback) {
    if (this.jobs.has(name)) {
      console.log(`Job ${name} already scheduled`);
      return;
    }
    
    // Run immediately
    callback().catch(err => {
      console.error(`Job ${name} error:`, err);
    });
    
    // Then schedule recurring
    const interval = setInterval(() => {
      callback().catch(err => {
        console.error(`Job ${name} error:`, err);
      });
    }, intervalMs);
    
    this.jobs.set(name, { interval, callback });
    console.log(`✓ Scheduled job: ${name} (every ${intervalMs}ms)`);
  }
  
  /**
   * Run a job immediately
   */
  async runJob(name) {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job ${name} not found`);
    }
    
    return await job.callback();
  }
  
  /**
   * Get job status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobs: Array.from(this.jobs.keys())
    };
  }
}

module.exports = new JobScheduler();
