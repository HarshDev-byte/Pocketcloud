import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import database to trigger migrations
import './db/client';

// Import routes
import setupRouter from './routes/setup.routes';
import healthRouter from './routes/health.routes';
import captiveRouter from './routes/captive.routes';
import discoveryRouter from './routes/discovery.routes';
import uploadRouter from './routes/upload.routes';
import filesRouter from './routes/files.routes';
import authRouter from './routes/auth.routes';
import networkRouter from './routes/network.routes';
import trashRouter from './routes/trash.routes';
import versionsRouter from './routes/versions.routes';
import searchRouter from './routes/search.routes';
import shareRouter from './routes/share.routes';
import activityRouter from './routes/activity.routes';
import adminRouter from './routes/admin.routes';
import webdavRouter from './routes/webdav.routes';
import mediaRouter from './routes/media.routes';
import realtimeRouter from './routes/realtime.routes';
import encryptionRouter from './routes/encryption.routes';
import backupRouter from './routes/backup.routes';
import backupDeviceRouter from './routes/backup-device.routes';
import bulkRouter from './routes/bulk.routes';
import webhooksRouter from './routes/webhooks.routes';
import powerFeaturesRouter from './routes/power-features.routes';
import syncRouter from './routes/sync.routes';
import analyticsRouter from './routes/analytics.routes';
import pipelineRouter from './routes/pipeline.routes';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { requestLogger } from './middleware/requestlog.middleware';

// Import security and rate limiting middleware
import {
  helmetConfig,
  corsConfig,
  validateFileType,
  validateCommonInputs,
  validateRequestSize,
  securityHeaders,
  validateAdminIP
} from './middleware/security.middleware';

import {
  apiLimiter,
  loginLimiter,
  uploadInitLimiter,
  searchLimiter,
  shareLimiter,
  sharePasswordLimiter,
  downloadLimiter,
  adminLimiter,
  backupLimiter
} from './middleware/ratelimit.middleware';

// Import jobs
import { startCleanupJob } from './jobs/cleanup.job';
import { ActivityService, Actions } from './services/activity.service';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Security headers (helmet configuration)
app.use(helmetConfig);

// Additional security headers
app.use(securityHeaders);

// CORS configuration
app.use(corsConfig);

// Cookie parser (for session cookies)
app.use(cookieParser());

// Body parsing middleware with size limits
// Optimized compression for Pi 4B
app.use(compression({
  level: 1,          // Fastest compression (1 vs 9)
  // Level 1 on Pi is 3x faster than level 6
  // Still saves ~70% on JSON responses
  threshold: 1024,   // Only compress if > 1KB
  filter: (req, res) => {
    // Never compress already-compressed content
    const ct = res.getHeader('Content-Type') as string ?? '';
    if (ct.includes('video/') || 
        ct.includes('image/') || 
        ct.includes('audio/') || 
        ct.includes('application/zip') ||
        ct.includes('application/pcd-encrypted')) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Raw body parser for file uploads (with size validation)
app.use('/api/upload/:uploadId/chunk/:chunkIndex', 
  validateRequestSize(10 * 1024 * 1024), // 10MB max chunk size
  express.raw({ 
    type: 'application/octet-stream', 
    limit: '10mb' 
  })
);

// JSON body parser with size limits
app.use(express.json({ 
  limit: '1mb',  // Reduced from 10mb for security
  verify: (req, res, buf) => {
    // Additional validation can be added here
    if (buf.length === 0) return;
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '1mb' 
}));

// Input validation middleware
app.use(validateCommonInputs);

// Request logging middleware (logs all requests with timing)
app.use(requestLogger);

// Captive portal detection routes (MUST BE FIRST - before rate limiting)
app.use('/', captiveRouter);

// Apply global API rate limiting
app.use('/api', apiLimiter);

// API routes with specific rate limiting
app.use('/api/health', healthRouter);
app.use('/api/setup', setupRouter);

// Discovery endpoints (no rate limiting for device discovery)
app.use('/api', discoveryRouter);
app.use('/', discoveryRouter); // For .well-known

// Auth routes with login rate limiting
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRouter);

// Upload routes with upload rate limiting and file type validation
app.use('/api/upload/init', uploadInitLimiter, validateFileType);
app.use('/api/upload', uploadRouter);

// File routes with download rate limiting
app.use('/api/files/*/download', downloadLimiter);
app.use('/api/files', filesRouter);
app.use('/api/files', versionsRouter); // Mount versions routes under /api/files

app.use('/api/trash', trashRouter);

// Search routes with search rate limiting
app.use('/api/search', searchLimiter, searchRouter);

// Share routes with share creation and password rate limiting
app.use('/api/shares', shareLimiter);
app.use('/s/:token/verify-password', sharePasswordLimiter);

app.use('/api/activity', activityRouter);

// Admin routes with admin rate limiting and IP validation
app.use('/api/admin', validateAdminIP, adminLimiter);
app.use('/api/admin/analytics', analyticsRouter); // Mount admin analytics
app.use('/api/admin', activityRouter); // Mount admin activity routes
app.use('/api/admin', adminRouter); // Mount admin routes

// Backup routes with backup-specific rate limiting
app.use('/api/admin/backups', backupLimiter);
app.use('/api/admin', backupRouter); // Mount backup management routes

// Photo backup device routes
app.use('/api/backup', backupDeviceRouter);

// WebDAV server (no rate limiting for compatibility)
app.use('/webdav', webdavRouter);

// Media routes
app.use('/api/files', mediaRouter); // Mount media routes (thumbnails, HLS, EXIF)
app.use('/api/media', mediaRouter); // Mount media management routes

// Realtime routes
app.use('/api/realtime', realtimeRouter);

// Encryption routes
app.use('/api/encryption', encryptionRouter);

// Bulk operations and tagging routes
app.use('/api/bulk', bulkRouter);
app.use('/api', bulkRouter); // Mount tag routes at /api/tags and /api/files/:id/tags

// Webhooks routes
app.use('/api/webhooks', webhooksRouter);

// Power features routes (favorites, comments, recents, 2FA, guests, locks)
app.use('/api', powerFeaturesRouter);

// Sync routes (folder sync protocol for desktop clients)
app.use('/api/sync', syncRouter);

// Analytics routes (storage analytics and recommendations)
app.use('/api/analytics', analyticsRouter);

// Pipeline routes (file automation rules)
app.use('/api/pipeline', pipelineRouter);

// Public share routes (with password rate limiting applied above)
app.use('/', shareRouter);

app.use('/api/network', networkRouter);

// Serve frontend static files if they exist
const frontendPath = join(__dirname, '../../frontend/dist');
if (existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  
  // Catch-all handler for SPA routing
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(join(frontendPath, 'index.html'));
    } else {
      notFoundHandler(req, res);
    }
  });
} else {
  // No frontend built yet, just show API info
  app.get('/', (req, res) => {
    res.json({
      name: 'PocketCloud API',
      version: process.env.APP_VERSION || '1.0.0',
      status: 'running',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth',
        upload: '/api/upload',
        files: '/api/files',
        search: '/api/search',
        shares: '/api/shares',
        activity: '/api/activity',
        admin: '/api/admin',
        trash: '/api/trash',
        network: '/api/network'
      }
    });
  });
}

// 404 handler for unmatched API routes
app.use('/api/*', notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start cleanup job
startCleanupJob();

// Initialize media processing
import { MediaService } from './services/media.service';
MediaService.initialize();

// Initialize backup service
import { BackupService } from './services/backup.service';
BackupService.initialize().catch((error) => {
  logger.error('Failed to initialize backup service', { error: error.message });
  process.exit(1);
});

// Log system startup
ActivityService.log({
  action: Actions.SYSTEM_STARTUP,
  resourceType: 'system',
  details: {
    version: process.env.APP_VERSION || '1.0.0',
    nodeVersion: process.version,
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  }
});

// Graceful shutdown
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info('PocketCloud server started', {
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    piIp: process.env.PI_IP || '192.168.4.1'
  });
});

// Setup WebSocket server
import { setupWebSocket, wss } from './websocket';
setupWebSocket(server);

// Setup graceful shutdown with upload tracking
import { setupGracefulShutdown } from './utils/shutdown';
import { UploadService } from './services/upload.service';
setupGracefulShutdown(server, wss, () => UploadService.getActiveUploadCount());

// Disk space monitoring (check every 5 minutes)
import { getDiskStatus } from './utils/disk.utils';
import { RealtimeService, WS_EVENTS } from './services/realtime.service';
import { HealthService } from './services/health.service';

setInterval(async () => {
  try {
    // Run comprehensive health checks
    const report = await HealthService.runAllChecks();
    
    // Send to admins via WebSocket if any issues
    if (report.overall !== 'ok') {
      RealtimeService.sendToAdmins(WS_EVENTS.SYSTEM_ALERT, {
        type: 'health_check',
        overall: report.overall,
        checks: report.checks.filter(c => c.status !== 'ok'),
        timestamp: report.checkedAt
      });
    }

    // Auto-resolve incidents that cleared
    for (const check of report.checks) {
      if (check.status === 'ok') {
        HealthService.resolveIncident(check.type, true);
      } else {
        HealthService.createOrUpdateIncident(
          check.type,
          check.status,
          `${check.type} at ${check.value}${check.unit} (threshold: ${check.threshold})`
        );
      }
    }

    // Legacy disk warning (kept for backwards compatibility)
    const disk = getDiskStatus();
    if (disk.isWarning) {
      logger.warn('Disk space warning', {
        freeBytes: disk.freeBytes,
        percentUsed: Math.round(disk.percentUsed * 100)
      });
    }
  } catch (error: any) {
    logger.error('Health monitoring failed', { error: error.message });
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Run initial health check 30 seconds after startup
setTimeout(async () => {
  logger.info('Running initial health check...');
  try {
    const report = await HealthService.runAllChecks();
    logger.info('Initial health check complete', { overall: report.overall });
  } catch (error: any) {
    logger.error('Initial health check failed', { error: error.message });
  }
}, 30000);

export default app;