import { UploadService } from './upload.service';

/**
 * Cleanup service for maintenance tasks
 */
export class CleanupService {
  private static cleanupInterval: NodeJS.Timeout | null = null;
  private static readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Start periodic cleanup tasks
   */
  public static startCleanupTasks(): void {
    if (this.cleanupInterval) {
      return; // Already running
    }

    console.log('Starting cleanup service...');
    
    // Run initial cleanup
    this.runCleanup();
    
    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop cleanup tasks
   */
  public static stopCleanupTasks(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('Cleanup service stopped');
    }
  }

  /**
   * Run all cleanup tasks
   */
  private static runCleanup(): void {
    try {
      console.log('Running cleanup tasks...');
      
      // Clean stalled uploads
      const stalledUploads = UploadService.cleanStalledUploads();
      
      if (stalledUploads > 0) {
        console.log(`Cleanup completed: ${stalledUploads} stalled uploads removed`);
      }
      
    } catch (error) {
      console.error('Cleanup task error:', error);
    }
  }

  /**
   * Manual cleanup trigger
   */
  public static async manualCleanup(): Promise<{ stalledUploads: number }> {
    const stalledUploads = UploadService.cleanStalledUploads();
    return { stalledUploads };
  }
}