/**
 * PocketCloud Backend Server
 * Express.js server with all middleware, routes, and WebSocket support
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';

// Import modules using eval to avoid TypeScript module resolution issues
const http = eval('require')('http');
const path = eval('require')('path');

// Import database
import { initializeDatabase, closeDatabase } from './db/client.js';
import { initializeSchema, runMigrations, needsMigration } from './db/migrate.js';

// Import middleware
import { errorHandler } from './middleware/error.middleware.js';
import { requireAuth } from './middleware/auth.middleware.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import filesRoutes from './routes/files.routes.js';
import foldersRoutes from './routes/folders.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import networkRoutes from './routes/network.routes.js';
import trashRoutes from './routes/trash.routes.js';
import adminRoutes from './routes/admin.routes.js';

// Load environment variables
config();

// Access global variables using eval to avoid TypeScript issues
const process = eval('process');
const __dirname = eval('__dirname');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Initialize database connection and run migrations
 */
async function initializeDatabase_(): Promise<void> {
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'storage.db');
  const schemaPath = path.join(__dirname, 'db', 'schema.sql');
  const migrationsDir = path.join(__dirname, 'db', 'migrations');
  
  console.log('Initializing database...');
  console.log('Database path:', dbPath);
  
  try {
    // Initialize database connection
    initializeDatabase(dbPath);
    
    // Check if database is empty (no tables)
    const database = eval('require')('better-sqlite3')(dbPath);
    const tables = database.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
    const isEmpty = tables.count === 0;
    
    if (isEmpty) {
      console.log('Database is empty, initializing schema...');
      initializeSchema(schemaPath);
    }
    
    // Run any pending migrations
    if (needsMigration(migrationsDir)) {
      console.log('Running database migrations...');
      runMigrations(migrationsDir);
    }
    
    console.log('✓ Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

/**
 * Configure Express middleware
 */
function setupMiddleware(): void {
  // TODO: Configure security middleware
  // TODO: Set up CORS for frontend access
  // TODO: Configure compression and rate limiting
  // TODO: Set up request parsing middleware
  
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for development
    crossOriginEmbedderPolicy: false,
  }));
  
  // CORS configuration
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }) as any);
  
  // Compression
  if (process.env.ENABLE_COMPRESSION === 'true') {
    app.use(compression({
      level: parseInt(process.env.COMPRESSION_LEVEL || '6', 10),
    }));
  }
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);
  
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Request logging in development
  if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }
}

/**
 * Configure API routes
 */
function setupRoutes(): void {
  // TODO: Mount all API routes with proper prefixes
  // TODO: Set up health check endpoint
  // TODO: Configure static file serving
  // TODO: Set up WebSocket endpoints
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
    });
  });
  
  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/files', requireAuth, filesRoutes);
  app.use('/api/folders', requireAuth, foldersRoutes);
  app.use('/api/upload', requireAuth, uploadRoutes);
  app.use('/api/network', requireAuth, networkRoutes);
  app.use('/api/trash', requireAuth, trashRoutes);
  app.use('/api/admin', requireAuth, adminRoutes);
  
  // Serve static files (frontend build)
  const staticPath = process.env.STATIC_PATH || path.join(__dirname, '../../frontend/dist');
  app.use(express.static(staticPath));
  
  // Catch-all handler for SPA routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

/**
 * Set up WebSocket server for real-time features
 */
function setupWebSocket(server: any): WebSocketServer {
  // TODO: Create WebSocket server
  // TODO: Handle client connections and authentication
  // TODO: Set up real-time file sync
  // TODO: Implement heartbeat mechanism
  
  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
  });
  
  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    
    // TODO: Authenticate WebSocket connection
    // TODO: Set up message handlers
    // TODO: Join user to appropriate rooms
    
    ws.on('message', (data) => {
      // TODO: Handle incoming WebSocket messages
      console.log('WebSocket message received:', data.toString());
    });
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      // TODO: Clean up client state
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to PocketCloud',
    }));
  });
  
  // Heartbeat mechanism
  const heartbeatInterval = parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10);
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    });
  }, heartbeatInterval);
  
  return wss;
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(server: any, wss: WebSocketServer): void {
  // TODO: Handle SIGTERM and SIGINT signals
  // TODO: Close database connections
  // TODO: Close WebSocket connections
  // TODO: Stop HTTP server gracefully
  
  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    
    // Close WebSocket server
    wss.close(() => {
      console.log('WebSocket server closed');
    });
    
    // Close HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      
      // Close database connection
      closeDatabase();
      console.log('Database connection closed');
      
      process.exit(0);
    });
    
    // Force exit after timeout
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('UNHANDLED_REJECTION');
  });
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    // Initialize database
    await initializeDatabase_();
    
    // Set up middleware
    setupMiddleware();
    
    // Set up routes
    setupRoutes();
    
    // Add error handler (must be last)
    app.use(errorHandler);
    
    // Create HTTP server
    const server = http.createServer(app);
    
    // Set up WebSocket
    const wss = setupWebSocket(server);
    
    // Set up graceful shutdown
    setupGracefulShutdown(server, wss);
    
    // Start listening
    server.listen(PORT, HOST, () => {
      console.log(`🚀 PocketCloud server running on http://${HOST}:${PORT}`);
      console.log(`📁 Storage path: ${process.env.STORAGE_PATH || '/mnt/pocketcloud/files'}`);
      console.log(`🗄️  Database path: ${process.env.DATABASE_PATH || './data/storage.db'}`);
      console.log(`🌐 WebSocket server running on ws://${HOST}:${PORT}/ws`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Running in development mode');
      }
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();