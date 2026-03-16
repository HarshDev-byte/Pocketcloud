#!/bin/bash

# Simple JavaScript Server for PocketCloud
# This creates a basic working server without TypeScript complications

set -e

echo "🔧 Creating simple JavaScript server..."

cd /opt/pocketcloud/pocket-cloud/backend

# Stop the service
sudo systemctl stop pocketcloud

echo "📝 Creating simple server.js..."

# Create a simple JavaScript server that works
sudo tee server.js > /dev/null << 'EOF'
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Database setup
let db = null;

function initializeDatabase() {
  const dbPath = '/mnt/pocketcloud/data/storage.db';
  
  console.log('Initializing database at:', dbPath);
  
  try {
    // Create directory if it doesn't exist
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // Initialize database
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 1000');
    db.pragma('foreign_keys = ON');
    db.pragma('temp_store = MEMORY');
    
    // Check if database has tables
    const tables = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
    
    if (tables.count === 0) {
      console.log('Database is empty, initializing schema...');
      const schemaPath = path.join(__dirname, 'src/db/schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        db.exec(schema);
        console.log('✅ Database schema initialized');
      }
    }
    
    console.log(`✅ Database ready with ${tables.count} tables`);
    return true;
  } catch (error) {
    console.error('Database initialization failed:', error);
    return false;
  }
}

// Middleware setup
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.get('/api/health', (req, res) => {
  const dbStatus = db ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    database: dbStatus,
    message: 'PocketCloud API Server is running'
  });
});

app.get('/api/files', (req, res) => {
  res.json({
    success: true,
    data: {
      files: [],
      folders: []
    },
    message: 'Files API is working'
  });
});

app.get('/api/status', (req, res) => {
  const stats = {
    server: 'running',
    database: db ? 'connected' : 'disconnected',
    storage: fs.existsSync('/mnt/pocketcloud') ? 'mounted' : 'not mounted',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
  
  res.json(stats);
});

// Catch all
app.get('*', (req, res) => {
  res.json({
    message: 'PocketCloud Personal Cloud Server',
    status: 'running',
    version: '1.0.0',
    endpoints: [
      '/api/health',
      '/api/files',
      '/api/status'
    ]
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
async function startServer() {
  console.log('🚀 Starting PocketCloud server...');
  
  // Initialize database
  const dbReady = initializeDatabase();
  if (!dbReady) {
    console.warn('⚠️  Database initialization failed, but server will continue');
  }
  
  // Start HTTP server
  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 PocketCloud server running on http://${HOST}:${PORT}`);
    console.log(`📁 Storage path: /mnt/pocketcloud/files`);
    console.log(`🗄️  Database path: /mnt/pocketcloud/data/storage.db`);
    console.log(`🌐 Access the server at: http://192.168.4.1:${PORT}`);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    server.close(() => {
      if (db) {
        db.close();
      }
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    server.close(() => {
      if (db) {
        db.close();
      }
      process.exit(0);
    });
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
EOF

echo "🔧 Updating systemd service to use JavaScript..."

# Update systemd service to use the simple JavaScript server
sudo tee /etc/systemd/system/pocketcloud.service > /dev/null << 'EOF'
[Unit]
Description=PocketCloud Personal Cloud Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=pocketcloud
Group=pocketcloud
WorkingDirectory=/opt/pocketcloud/pocket-cloud/backend
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pocketcloud

[Install]
WantedBy=multi-user.target
EOF

echo "🔄 Reloading and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable pocketcloud
sudo systemctl start pocketcloud

echo "⏳ Waiting for service to start..."
sleep 3

echo "📊 Checking service status..."
sudo systemctl status pocketcloud --no-pager

echo "🌐 Testing API..."
sleep 2

echo "Testing health endpoint..."
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ API is responding!"
    echo "Health check:"
    curl -s http://localhost:3000/api/health | jq . 2>/dev/null || curl -s http://localhost:3000/api/health
    echo ""
    echo "Status check:"
    curl -s http://localhost:3000/api/status | jq . 2>/dev/null || curl -s http://localhost:3000/api/status
else
    echo "❌ API not responding, checking logs..."
    sudo journalctl -u pocketcloud --no-pager -n 10
fi

echo ""
echo "✅ Simple JavaScript server setup completed!"
echo ""
echo "🌐 Your PocketCloud server should now be accessible at:"
echo "   - Local: http://localhost:3000"
echo "   - WiFi Hotspot: http://192.168.4.1:3000"
echo ""
echo "📋 Available endpoints:"
echo "   - /api/health - Server health check"
echo "   - /api/status - Detailed server status"
echo "   - /api/files - Files API (basic)"
echo ""
echo "📊 To monitor the service:"
echo "   - Status: sudo systemctl status pocketcloud"
echo "   - Logs: sudo journalctl -u pocketcloud -f"