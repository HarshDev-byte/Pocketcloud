/**
 * Windows-compatible PocketCloud Server
 * Adapted from the original Linux-based server.js
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs-extra');

// Use Windows-compatible config
const config = require('./src/config/windows-config');

// Import services and middleware
const { initDatabase } = require('./src/config/database');

const app = express();

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: config.SESSION_MAX_AGE
  }
}));

// Initialize storage directory
async function initializeStorage() {
  try {
    console.log('Initializing storage at:', config.STORAGE_ROOT);
    await fs.ensureDir(config.STORAGE_ROOT);
    
    // Test write access
    const testFile = path.join(config.STORAGE_ROOT, '.test-write');
    await fs.writeFile(testFile, 'test');
    await fs.remove(testFile);
    
    console.log('✓ Storage directory initialized and writable');
    return true;
  } catch (error) {
    console.error('✗ Storage initialization failed:', error.message);
    console.error('Please ensure the storage path is accessible and writable');
    return false;
  }
}

// Initialize database
async function initializeApp() {
  try {
    // Initialize storage first
    const storageOk = await initializeStorage();
    if (!storageOk) {
      process.exit(1);
    }
    
    // Initialize database
    console.log('Initializing database...');
    await initDatabase();
    console.log('✓ Database initialized');
    
    // Import and setup routes after database is ready
    const authRoutes = require('./src/routes/auth');
    const fileRoutes = require('./src/routes/files');
    const indexRoutes = require('./src/routes/index');
    const setupRoutes = require('./src/routes/setup');
    const securityRoutes = require('./src/routes/security');
    const supportRoutes = require('./src/routes/support');
    
    // Setup routes
    app.use('/auth', authRoutes);
    app.use('/files', fileRoutes);
    app.use('/setup', setupRoutes);
    app.use('/security', securityRoutes);
    app.use('/support', supportRoutes);
    app.use('/', indexRoutes);
    
    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error('Server error:', err);
      res.status(500).render('error', { 
        error: 'Internal server error',
        message: err.message 
      });
    });
    
    // 404 handler
    app.use((req, res) => {
      res.status(404).render('error', { 
        error: 'Page not found',
        message: 'The requested page could not be found.' 
      });
    });
    
    return true;
  } catch (error) {
    console.error('Failed to initialize application:', error);
    return false;
  }
}

// Start server
async function startServer() {
  const initialized = await initializeApp();
  if (!initialized) {
    console.error('Failed to initialize application');
    process.exit(1);
  }
  
  const server = app.listen(config.PORT, () => {
    console.log('');
    console.log('🌟 PocketCloud is running!');
    console.log('');
    console.log(`📁 Storage: ${config.STORAGE_ROOT}`);
    console.log(`🌐 Local access: http://localhost:${config.PORT}`);
    console.log(`🔒 Session secret: ${config.SESSION_SECRET.substring(0, 8)}...`);
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('');
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down PocketCloud...');
    server.close(() => {
      console.log('Server stopped');
      process.exit(0);
    });
  });
  
  process.on('SIGTERM', () => {
    console.log('\nShutting down PocketCloud...');
    server.close(() => {
      console.log('Server stopped');
      process.exit(0);
    });
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});