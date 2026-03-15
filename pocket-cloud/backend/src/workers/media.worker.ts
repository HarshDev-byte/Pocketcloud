import PQueue from 'p-queue';
import { EventEmitter } from 'events';
import { MediaService } from '../services/media.service';

export interface MediaJob {
  fileId: string;
  priority: number;
  retries: number;
  createdAt: number;
}

export class MediaWorker extends EventEmitter {
  private queue: PQueue;
  private jobs = new Map<string, MediaJob>();
  private processing = new Set<string>();
  private readonly MAX_RETRIES = 2;
  private readonly PROCESSING_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  // Priority levels
  private static readonly PRIORITY = {
    THUMBNAIL: 1,
    HLS: 2,
    METADATA: 3
  };

  constructor() {
    super();
    
    // Configure queue for Pi constraints
    this.queue = new PQueue({
      concurrency: 1, // Pi can't handle parallel ffmpeg
      timeout: this.PROCESSING_TIMEOUT,
      throwOnTimeout: true
    });

    // Monitor queue events
    this.queue.on('active', () => {
      this.emit('queue:active', { 
        size: this.queue.size, 
        pending: this.queue.pending 
      });
    });

    this.queue.on('idle', () => {
      this.emit('queue:idle');
    });

    this.queue.on('error', (error) => {
      console.error('Queue error:', error);
      this.emit('queue:error', error);
    });

    // Initialize media directories
    MediaService.initializeDirectories();
  }

  /**
   * Add file to processing queue
   */
  public addJob(fileId: string, mimeType: string): void {
    if (this.jobs.has(fileId) || this.processing.has(fileId)) {
      console.log(`File ${fileId} already in queue or processing`);
      return;
    }

    const priority = this.getPriority(mimeType);
    const job: MediaJob = {
      fileId,
      priority,
      retries: 0,
      createdAt: Date.now()
    };

    this.jobs.set(fileId, job);
    
    // Add to queue with priority
    this.queue.add(
      () => this.processJob(job),
      { priority }
    );

    console.log(`Added media job for file ${fileId} with priority ${priority}`);
    this.emit('job:queued', { fileId, priority });
  }

  /**
   * Process a single job
   */
  private async processJob(job: MediaJob): Promise<void> {
    const { fileId } = job;
    
    try {
      this.processing.add(fileId);
      this.jobs.delete(fileId);
      
      console.log(`Starting media processing for file: ${fileId}`);
      this.emit('media:processing', { fileId });

      // Set timeout for the job
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Processing timeout'));
        }, this.PROCESSING_TIMEOUT);
      });

      // Race between processing and timeout
      await Promise.race([
        MediaService.processFile(fileId),
        timeoutPromise
      ]);

      console.log(`Media processing completed for file: ${fileId}`);
      this.emit('media:ready', { fileId });

    } catch (error) {
      console.error(`Media processing failed for file ${fileId}:`, error);
      
      // Handle retry logic
      if (job.retries < this.MAX_RETRIES) {
        job.retries++;
        const delay = Math.pow(2, job.retries) * 1000; // Exponential backoff
        
        console.log(`Retrying media processing for file ${fileId} in ${delay}ms (attempt ${job.retries + 1})`);
        
        setTimeout(() => {
          this.jobs.set(fileId, job);
          this.queue.add(() => this.processJob(job), { priority: job.priority });
        }, delay);
        
        this.emit('media:retry', { fileId, attempt: job.retries + 1, delay });
      } else {
        console.error(`Media processing failed permanently for file ${fileId}`);
        this.emit('media:failed', { 
          fileId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    } finally {
      this.processing.delete(fileId);
    }
  }

  /**
   * Get priority based on mime type
   */
  private getPriority(mimeType: string): number {
    if (mimeType.startsWith('image/')) {
      return MediaWorker.PRIORITY.THUMBNAIL;
    } else if (mimeType.startsWith('video/')) {
      return MediaWorker.PRIORITY.HLS;
    } else {
      return MediaWorker.PRIORITY.METADATA;
    }
  }

  /**
   * Get queue statistics
   */
  public getStats(): {
    queueSize: number;
    pending: number;
    processing: number;
    totalJobs: number;
  } {
    return {
      queueSize: this.queue.size,
      pending: this.queue.pending,
      processing: this.processing.size,
      totalJobs: this.jobs.size + this.processing.size
    };
  }

  /**
   * Get current jobs
   */
  public getJobs(): MediaJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove job from queue
   */
  public removeJob(fileId: string): boolean {
    if (this.processing.has(fileId)) {
      console.log(`Cannot remove job ${fileId}: currently processing`);
      return false;
    }

    if (this.jobs.has(fileId)) {
      this.jobs.delete(fileId);
      console.log(`Removed job ${fileId} from queue`);
      return true;
    }

    return false;
  }

  /**
   * Clear all pending jobs
   */
  public clearQueue(): void {
    this.queue.clear();
    this.jobs.clear();
    console.log('Media processing queue cleared');
    this.emit('queue:cleared');
  }

  /**
   * Pause queue processing
   */
  public pause(): void {
    this.queue.pause();
    console.log('Media processing queue paused');
    this.emit('queue:paused');
  }

  /**
   * Resume queue processing
   */
  public resume(): void {
    this.queue.start();
    console.log('Media processing queue resumed');
    this.emit('queue:resumed');
  }

  /**
   * Check if queue is paused
   */
  public isPaused(): boolean {
    return this.queue.isPaused;
  }

  /**
   * Get memory usage estimate
   */
  public getMemoryUsage(): number {
    // Estimate memory usage based on queue size and processing
    const baseMemory = 50 * 1024 * 1024; // 50MB base
    const queueMemory = this.queue.size * 1024 * 1024; // 1MB per queued job
    const processingMemory = this.processing.size * 100 * 1024 * 1024; // 100MB per processing job
    
    return baseMemory + queueMemory + processingMemory;
  }

  /**
   * Check if memory usage is within limits
   */
  public isMemoryWithinLimits(): boolean {
    const maxMemory = 256 * 1024 * 1024; // 256MB limit
    return this.getMemoryUsage() < maxMemory;
  }

  /**
   * Shutdown worker gracefully
   */
  public async shutdown(): Promise<void> {
    console.log('Shutting down media worker...');
    
    // Pause new jobs
    this.pause();
    
    // Wait for current jobs to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.processing.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Clear remaining jobs
    this.clearQueue();
    
    console.log('Media worker shutdown complete');
    this.emit('worker:shutdown');
  }
}

// Singleton instance
export const mediaWorker = new MediaWorker();