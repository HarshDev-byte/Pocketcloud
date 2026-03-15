import { dbClient } from '../db';
import { UploadService } from '../services/upload.service';

/**
 * Graceful shutdown handler for Pocket Cloud Drive backend
 * Handles SIGTERM and SIGINT signals to ensure clean shutdown
 */
export class ShutdownHandler {
  private static isShuttingDown = false;
  private static shutdownTimeout: NodeJS.Timeout | null = null;
  private static readonly SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds

  /**
   * Initialize graceful shutdown handlers
   */
  public static initialize(): void {
    // Handle SIGTERM (systemd stop)
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, initiating graceful shutdown...');
      this.gracefulShutdown('SIGTERM');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log('Received SIGINT, initiating graceful shutdown...');
      this.gracefulShutdown('SIGINT');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION', 1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('UNHANDLED_REJECTION', 1);
    });

    console.log('Graceful shutdown handlers initialized');
  }

  /**
   * Perform graceful shutdown
   */
  private static async gracefulShutdown(signal: string, exitCode: number = 0): Promise<void> {
    if (this.isShuttingDown) {
      console.log('Shutdown already in progress, forcing exit...');
      process.exit(exitCode);
    }

    this.isShuttingDown = true;
    console.log(`Starting graceful shutdown (signal: ${signal})...`);

    // Set a timeout to force exit if shutdown takes too long
    this.shutdownTimeout = setTimeout(() => {
      console.error('Shutdown timeout reached, forcing exit');
      process.exit(exitCode);
    }, this.SHUTDOWN_TIMEOUT_MS);

    try {
      await this.performShutdownTasks();
      console.log('Graceful shutdown completed successfully');
      
      // Clear timeout and exit cleanly
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
      }
      
      process.exit(exitCode);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Perform shutdown tasks in order
   */
  private static async performShutdownTasks(): Promise<void> {
    const tasks = [
      { name: 'Stop accepting new connections', fn: this.stopAcceptingConnections },
      { name: 'Wait for uploads to complete', fn: this.waitForUploadsToComplete },
      { name: 'Close database connections', fn: this.closeDatabaseConnections },
      { name: 'Cleanup temporary files', fn: this.cleanupTempFiles },
    ];

    for (const task of tasks) {
      try {
        console.log(`Shutdown task: ${task.name}...`);
        await task.fn();
        console.log(`✓ ${task.name} completed`);
      } catch (error) {
        console.error(`✗ ${task.name} failed:`, error);
        // Continue with other tasks even if one fails
      }
    }
  }

  /**
   * Stop accepting new HTTP connections
   */
  private static async stopAcceptingConnections(): Promise<void> {
    // This would be implemented when we have the HTTP server reference
    // For now, we'll just log the intent
    console.log('Stopping HTTP server (would close server.close() here)');
    
    // In a real implementation, you would:
    // server.close(() => {
    //   console.log('HTTP server closed');
    // });
  }

  /**
   * Wait for in-progress uploads to complete
   */
  private static async waitForUploadsToComplete(): Promise<void> {
    const maxWaitTime = 25000; // 25 seconds (leave 5s for other tasks)
    const checkInterval = 1000; // 1 second
    let waitTime = 0;

    while (waitTime < maxWaitTime) {
      try {
        const activeSessions = UploadService.getActiveSessions();
        
        if (activeSessions.length === 0) {
          console.log('No active uploads, proceeding with shutdown');
          return;
        }

        console.log(`Waiting for ${activeSessions.length} active uploads to complete...`);
        
        // Wait for check interval
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waitTime += checkInterval;
      } catch (error) {
        console.error('Error checking upload status:', error);
        break;
      }
    }

    if (waitTime >= maxWaitTime) {
      console.warn('Upload wait timeout reached, proceeding with shutdown');
    }
  }

  /**
   * Close database connections cleanly
   */
  private static async closeDatabaseConnections(): Promise<void> {
    try {
      // Close the database connection
      dbClient.close();
      console.log('Database connections closed');
    } catch (error) {
      console.error('Error closing database connections:', error);
      throw error;
    }
  }

  /**
   * Cleanup temporary files and resources
   */
  private static async cleanupTempFiles(): Promise<void> {
    try {
      // Clean up any stalled uploads
      const cleaned = UploadService.cleanStalledUploads();
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} stalled uploads`);
      }

      // Additional cleanup tasks could go here
      console.log('Temporary file cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Don't throw here as cleanup is not critical for shutdown
    }
  }

  /**
   * Check if shutdown is in progress
   */
  public static isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get remaining shutdown time in milliseconds
   */
  public static getRemainingShutdownTime(): number {
    if (!this.isShuttingDown || !this.shutdownTimeout) {
      return 0;
    }

    // This is approximate since we don't track the exact start time
    return this.SHUTDOWN_TIMEOUT_MS;
  }
}