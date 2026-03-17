import { db } from '../db/client';
import { logger } from './logger';
import { Server } from 'http';
import { WebSocketServer } from 'ws';

export function setupGracefulShutdown(
  httpServer: Server,
  wss: WebSocketServer,
  getActiveUploadCount: () => number
): void {
  let isShuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal} — starting graceful shutdown`);

    // Step 1: Stop accepting new HTTP connections
    httpServer.close(() => {
      logger.info('HTTP server closed — no new connections accepted');
    });

    // Step 2: Notify all WebSocket clients
    wss.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        try {
          client.send(JSON.stringify({
            type: 'server:shutdown',
            message: 'Server restarting. Reconnect in 15 seconds.',
            retryAfter: 15
          }));
          client.close(1001, 'Server shutting down');
        } catch (error) {
          logger.warn('Failed to notify WebSocket client', { error });
        }
      }
    });

    // Step 3: Wait for in-progress uploads to finish (max 30 seconds)
    logger.info('Waiting for active uploads to complete...');
    const uploadWaitStart = Date.now();
    
    while (getActiveUploadCount() > 0) {
      if (Date.now() - uploadWaitStart > 30000) {
        logger.warn('Upload wait timeout — forcing shutdown with active uploads');
        
        // Mark active upload sessions as "interrupted" so clients can resume
        try {
          db.prepare(`
            UPDATE upload_sessions 
            SET status = 'interrupted' 
            WHERE status = 'active'
          `).run();
          logger.info('Marked active uploads as interrupted');
        } catch (error) {
          logger.error('Failed to mark uploads as interrupted', { error });
        }
        break;
      }
      
      await new Promise(r => setTimeout(r, 500));
    }

    logger.info(`All uploads completed or marked interrupted`);

    // Step 4: Flush all pending SQLite writes
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      logger.info('SQLite WAL checkpoint complete');
    } catch (err: any) {
      logger.error('WAL checkpoint failed', { error: err.message });
    }

    // Step 5: Close DB connection cleanly
    try {
      db.close();
      logger.info('Database connection closed');
    } catch (err: any) {
      logger.error('Error closing DB', { error: err.message });
    }

    // Step 6: Exit cleanly
    logger.info('Graceful shutdown complete');
    process.exit(0);
  }

  // Handle all shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors — log but don't crash
  process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION — server will continue', {
      error: err.message,
      stack: err.stack
    });
    // Don't call process.exit() — keep serving other users
    // The one bad request doesn't kill everyone else
  });

  process.on('unhandledRejection', (reason: any) => {
    logger.error('UNHANDLED PROMISE REJECTION', { 
      reason: reason?.message || String(reason),
      stack: reason?.stack
    });
    // Same — log and continue
  });

  logger.info('Graceful shutdown handlers registered');
}
