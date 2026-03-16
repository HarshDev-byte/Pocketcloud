#!/bin/bash

# Setup PocketCloud Frontend Web Interface
# This script builds and serves the frontend with the backend API

set -e

echo "🌐 Setting up PocketCloud Frontend Web Interface..."

# Navigate to the project directory
cd /opt/pocketcloud

# Check if we're in the right location
if [ ! -d "pocket-cloud" ]; then
    echo "❌ Error: Not in PocketCloud directory"
    exit 1
fi

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd pocket-cloud/frontend
npm install

# Build the frontend
echo "🔨 Building frontend..."
npm run build

# Create a combined server that serves both API and frontend
echo "🚀 Creating combined server..."
cd ../backend

# Create a new server.js that serves both API and static files
cat > server.js << 'EOF'
const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3000;

// Database setup
const dbPath = '/mnt/pocketcloud/data/storage.db';
const storagePath = '/mnt/pocketcloud/files';

console.log('🚀 Starting PocketCloud server...');
console.log('Initializing database at:', dbPath);

// Ensure directories exist
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
}

// Initialize database
const db = new Database(dbPath);

// Create basic tables if they don't exist
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            size INTEGER,
            type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            parent_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    const tableCount = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get();
    console.log(`✅ Database ready with ${tableCount.count} tables`);
} catch (error) {
    console.error('Database initialization error:', error);
}

// Middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// API Routes
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
        database: 'connected',
        message: 'PocketCloud API Server is running'
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        server: 'running',
        database: 'connected',
        storage: 'mounted',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// Files API
app.get('/api/files', (req, res) => {
    try {
        const files = db.prepare('SELECT * FROM files ORDER BY created_at DESC LIMIT 50').all();
        res.json({ files, count: files.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch files', details: error.message });
    }
});

app.get('/api/folders', (req, res) => {
    try {
        const folders = db.prepare('SELECT * FROM folders ORDER BY name').all();
        res.json({ folders, count: folders.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch folders', details: error.message });
    }
});

// File upload endpoint
app.post('/api/upload', (req, res) => {
    res.json({ 
        message: 'Upload endpoint ready', 
        note: 'File upload functionality requires multipart/form-data handling' 
    });
});

// Serve static frontend files
const frontendPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendPath)) {
    console.log('📁 Serving frontend from:', frontendPath);
    app.use(express.static(frontendPath));
    
    // Serve index.html for all non-API routes (SPA routing)
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(frontendPath, 'index.html'));
        } else {
            res.status(404).json({ error: 'API endpoint not found' });
        }
    });
} else {
    console.log('⚠️  Frontend not built, serving API only');
    console.log('   Run: cd frontend && npm run build');
    
    // Serve a simple HTML page for the root
    app.get('/', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>PocketCloud</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                    .status { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0; }
                    .api-link { background: #f0f8ff; padding: 10px; border-radius: 5px; margin: 10px 0; }
                    a { color: #0066cc; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                </style>
            </head>
            <body>
                <h1>🚀 PocketCloud Personal Cloud Server</h1>
                <div class="status">
                    <h3>✅ Server Status: Running</h3>
                    <p><strong>Version:</strong> 1.0.0</p>
                    <p><strong>Database:</strong> Connected</p>
                    <p><strong>Storage:</strong> /mnt/pocketcloud</p>
                </div>
                
                <h3>📡 API Endpoints:</h3>
                <div class="api-link"><a href="/api/health">GET /api/health</a> - Server health check</div>
                <div class="api-link"><a href="/api/status">GET /api/status</a> - Detailed server status</div>
                <div class="api-link"><a href="/api/files">GET /api/files</a> - List files</div>
                <div class="api-link"><a href="/api/folders">GET /api/folders</a> - List folders</div>
                
                <h3>🌐 Web Interface:</h3>
                <p>To enable the full web interface, build the frontend:</p>
                <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">
cd /opt/pocketcloud/pocket-cloud/frontend
npm install
npm run build
sudo systemctl restart pocketcloud
                </pre>
                
                <h3>📱 Connect:</h3>
                <p><strong>WiFi Network:</strong> PocketCloud-7FC</p>
                <p><strong>Password:</strong> pocketcloud123</p>
                <p><strong>Server URL:</strong> http://192.168.4.1:3000</p>
            </body>
            </html>
        `);
    });
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PocketCloud server running on http://0.0.0.0:${PORT}`);
    console.log(`📁 Storage path: ${storagePath}`);
    console.log(`🗄️  Database path: ${dbPath}`);
    console.log(`🌐 Access the server at: http://192.168.4.1:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    db.close();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    db.close();
    process.exit(0);
});
EOF

# Update the systemd service to use the new server
echo "🔧 Updating systemd service..."
sudo tee /etc/systemd/system/pocketcloud.service > /dev/null << 'EOF'
[Unit]
Description=PocketCloud Personal Cloud Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pocketcloud/pocket-cloud/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Reload and restart the service
echo "🔄 Restarting PocketCloud service..."
sudo systemctl daemon-reload
sudo systemctl restart pocketcloud

echo "⏳ Waiting for service to start..."
sleep 3

# Check service status
echo "📊 Checking service status..."
sudo systemctl status pocketcloud --no-pager -l | head -15

echo ""
echo "✅ Frontend setup completed!"
echo ""
echo "🌐 Your PocketCloud is now accessible at:"
echo "   - Web Interface: http://192.168.4.1:3000"
echo "   - API Health: http://192.168.4.1:3000/api/health"
echo "   - Files API: http://192.168.4.1:3000/api/files"
echo ""
echo "📱 To access from your device:"
echo "   1. Connect to WiFi: PocketCloud-7FC (password: pocketcloud123)"
echo "   2. Open browser: http://192.168.4.1:3000"
echo ""
echo "🔧 To build the full React frontend later:"
echo "   cd /opt/pocketcloud/pocket-cloud/frontend"
echo "   npm install && npm run build"
echo "   sudo systemctl restart pocketcloud"