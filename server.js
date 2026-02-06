const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDatabase } = require('./config/database');
const config = require('./config/config');
const { requireSetup } = require('./middleware/setup');
const { handleStorageError } = require('./middleware/storageError');
const { startupCleanup } = require('./scripts/startup-cleanup');
const { getHealth } = require('./services/healthService');
const usbMountService = require('./services/usbMountService');
const { storageMonitor } = require('./services/failureDetection');
const { enforceProductBoundaries } = require('./services/productBoundaries');

const app = express();

// Middleware - Basic setup only
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // Set to true when using HTTPS
    maxAge: config.SESSION_MAX_AGE
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Health endpoint (no auth required, before all other routes)
app.get('/health', async (req, res) => {
  const health = await getHealth();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// Apply setup check to all routes
app.use(requireSetup);

// Setup route (exempt from requireSetup via middleware logic)
app.use('/setup', require('./routes/setup'));

// Landing page route only
app.get('/', (req, res) => {
  // If logged in, redirect to dashboard
  if (req.session.userId) {
    return res.redirect('/files');
  }
  res.render('landing', { title: 'PocketCloud' });
});

// Auth routes (Phase 2)
app.use('/auth', require('./routes/auth'));

// Files routes (Phase 3)
app.use('/files', require('./routes/files'));

// Security routes (Phase 12)
app.use('/security', require('./routes/security'));

// Support routes (Phase 14)
app.use('/support', require('./routes/support'));

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

// Storage error handler (before general error handler)
app.use(handleStorageError);

// Error handler
app.use((err, req, res, next) => {
  // Log error internally for debugging
  console.error('Server error:', err.message);
  
  // Send user-friendly error (no stack traces)
  res.status(500).render('error', { 
    message: 'Something went wrong. Please try again.' 
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Critical startup checks - fail fast if any fail
    console.log('Starting PocketCloud...');
    
    // Check 0: Product boundaries and environment validation
    try {
      const boundaries = await enforceProductBoundaries();
      
      if (!boundaries.supported) {
        console.error('FATAL: Unsupported environment detected');
        console.error('');
        console.error('Critical Issues:');
        boundaries.criticalIssues.forEach(issue => {
          console.error(`  ✗ ${issue.message}`);
          console.error(`    Action: ${issue.action}`);
          if (issue.reason) {
            console.error(`    Reason: ${issue.reason}`);
          }
        });
        console.error('');
        console.error('PocketCloud requires:');
        console.error('  • Linux (Raspberry Pi OS, Debian, or Ubuntu)');
        console.error('  • External USB storage mounted at /mnt/pocketcloud');
        console.error('  • ext4 filesystem (recommended)');
        console.error('');
        console.error('See documentation for supported environments.');
        process.exit(1);
      }
      
      if (boundaries.warnings.length > 0) {
        console.warn('Environment warnings:');
        boundaries.warnings.forEach(warning => {
          console.warn(`  ⚠ ${warning.message}`);
          console.warn(`    Recommendation: ${warning.action}`);
        });
        console.warn('');
      }
      
      console.log('✓ Product boundaries validated');
    } catch (error) {
      console.error('FATAL: Product boundary validation failed:', error.message);
      process.exit(1);
    }
    
    // Check 1: Database initialization
    try {
      await initDatabase();
      console.log('✓ Database initialized');
    } catch (error) {
      console.error('FATAL: Database initialization failed:', error.message);
      process.exit(1);
    }
    
    // Check 2: USB Storage verification (CRITICAL - must be external USB at canonical mount)
    try {
      const mountStatus = usbMountService.getMountStatus();
      if (!mountStatus.mounted) {
        console.error('FATAL: External USB storage not available');
        console.error('Reason:', mountStatus.reason);
        console.error('Action:', mountStatus.action);
        console.error('');
        console.error('Expected:');
        console.error(`• USB drive mounted at ${usbMountService.MOUNT_POINT}`);
        console.error('• ext4 filesystem (recommended)');
        console.error('');
        console.error('Fix:');
        console.error('1. Plug in USB drive');
        console.error('2. Run: sudo mount -a');
        console.error('3. Restart PocketCloud');
        process.exit(1);
      }
      console.log('✓ External USB storage verified');
      console.log(`  Device: ${mountStatus.device}`);
      console.log(`  Mount: ${mountStatus.mountPoint}`);
      console.log(`  Filesystem: ${mountStatus.fstype}`);
      if (mountStatus.uuid) {
        console.log(`  UUID: ${mountStatus.uuid}`);
      }
      if (mountStatus.warnings && mountStatus.warnings.length > 0) {
        mountStatus.warnings.forEach(warning => {
          console.warn(`  Warning: ${warning}`);
        });
      }
    } catch (error) {
      console.error('FATAL: USB storage verification failed:', error.message);
      console.error('');
      console.error('PocketCloud requires external USB storage at /mnt/pocketcloud');
      console.error('SD card storage is not supported for data safety.');
      process.exit(1);
    }
    
    // Check 3: Port availability
    const net = require('net');
    const portCheck = new Promise((resolve, reject) => {
      const tester = net.createServer()
        .once('error', err => {
          if (err.code === 'EADDRINUSE') {
            reject(new Error(`Port ${config.PORT} already in use`));
          } else {
            reject(err);
          }
        })
        .once('listening', () => {
          tester.close();
          resolve();
        })
        .listen(config.PORT, '0.0.0.0');
    });
    
    try {
      await portCheck;
      console.log('✓ Port available');
    } catch (error) {
      console.error('FATAL: Port check failed:', error.message);
      console.error(`Change port with: PORT=8080 npm start`);
      process.exit(1);
    }
    
    // Non-critical: Startup cleanup (don't fail if this fails)
    try {
      await startupCleanup();
    } catch (error) {
      console.warn('Warning: Startup cleanup failed:', error.message);
    }
    
    const server = app.listen(config.PORT, '0.0.0.0', () => {
      console.log('');
      console.log('='.repeat(50));
      console.log('✓ PocketCloud server started');
      console.log('='.repeat(50));
      console.log(`Local:   http://localhost:${config.PORT}`);
      console.log(`Network: http://<your-ip>:${config.PORT}`);
      console.log(`Storage: ${config.STORAGE_ROOT}`);
      console.log(`Max upload: ${(config.MAX_UPLOAD_SIZE / (1024 * 1024)).toFixed(0)}MB`);
      console.log('='.repeat(50));
      console.log('');
      console.log('Press Ctrl+C to stop');
      
      // Start storage monitoring for failure detection
      storageMonitor.startMonitoring();
    });
    
    // Graceful shutdown on SIGTERM (systemd stop/restart)
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down gracefully');
      storageMonitor.stopMonitoring();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
      
      // Force shutdown after 30 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    });
    
    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log('\nReceived SIGINT, shutting down gracefully');
      storageMonitor.stopMonitoring();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
      
      // Force shutdown after 30 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    });
    
  } catch (error) {
    console.error('');
    console.error('='.repeat(50));
    console.error('FATAL: Failed to start PocketCloud');
    console.error('='.repeat(50));
    console.error('Reason:', error.message);
    console.error('');
    console.error('Check logs above for details');
    console.error('='.repeat(50));
    process.exit(1);
  }
}

startServer();
