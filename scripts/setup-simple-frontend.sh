#!/bin/bash

# Setup Simple PocketCloud Frontend (No React Build Required)
# This script creates a lightweight HTML interface without complex builds

set -e

echo "🌐 Setting up Simple PocketCloud Frontend..."

# Navigate to the backend directory
cd /opt/pocketcloud/pocket-cloud/backend

# Create a simple server.js that serves HTML interface
echo "🚀 Creating simple web server..."
cat > server.js << 'EOF'
const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const multer = require('multer');

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

// Configure multer for file uploads
const upload = multer({
    dest: storagePath,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    }
});

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
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const originalName = req.file.originalname;
        const newPath = path.join(storagePath, originalName);
        
        // Move file to final location
        fs.renameSync(req.file.path, newPath);
        
        // Save to database
        const stmt = db.prepare('INSERT INTO files (name, path, size, type) VALUES (?, ?, ?, ?)');
        const result = stmt.run(originalName, newPath, req.file.size, req.file.mimetype);
        
        res.json({ 
            success: true, 
            file: {
                id: result.lastInsertRowid,
                name: originalName,
                size: req.file.size,
                type: req.file.mimetype
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Upload failed', details: error.message });
    }
});

// File download endpoint
app.get('/api/download/:id', (req, res) => {
    try {
        const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        if (fs.existsSync(file.path)) {
            res.download(file.path, file.name);
        } else {
            res.status(404).json({ error: 'File not found on disk' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Download failed', details: error.message });
    }
});

// Main web interface
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>PocketCloud Personal Cloud</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    max-width: 1200px; margin: 0 auto; padding: 20px; 
                    background: #f5f7fa; color: #333;
                }
                .header { 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; text-align: center;
                }
                .status { 
                    background: white; padding: 20px; border-radius: 10px; margin: 20px 0; 
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .upload-area { 
                    background: white; padding: 30px; border-radius: 10px; margin: 20px 0;
                    border: 2px dashed #ddd; text-align: center; cursor: pointer;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .upload-area:hover { border-color: #667eea; background: #f8f9ff; }
                .files-list { 
                    background: white; padding: 20px; border-radius: 10px; margin: 20px 0;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .file-item { 
                    padding: 15px; border-bottom: 1px solid #eee; display: flex; 
                    justify-content: space-between; align-items: center;
                }
                .file-item:last-child { border-bottom: none; }
                .btn { 
                    background: #667eea; color: white; padding: 10px 20px; 
                    border: none; border-radius: 5px; cursor: pointer; text-decoration: none;
                    display: inline-block; margin: 5px;
                }
                .btn:hover { background: #5a6fd8; }
                .btn-small { padding: 5px 10px; font-size: 12px; }
                .api-links { 
                    background: white; padding: 20px; border-radius: 10px; margin: 20px 0;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .api-link { 
                    background: #f8f9ff; padding: 10px; border-radius: 5px; margin: 10px 0; 
                    border-left: 4px solid #667eea;
                }
                .progress { 
                    width: 100%; height: 20px; background: #eee; border-radius: 10px; 
                    overflow: hidden; margin: 10px 0;
                }
                .progress-bar { 
                    height: 100%; background: #667eea; width: 0%; transition: width 0.3s;
                }
                @media (max-width: 768px) {
                    body { padding: 10px; }
                    .file-item { flex-direction: column; align-items: flex-start; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🚀 PocketCloud Personal Cloud</h1>
                <p>Your personal file storage and sharing solution</p>
            </div>
            
            <div class="status">
                <h3>📊 Server Status</h3>
                <div id="status-info">Loading...</div>
            </div>
            
            <div class="upload-area" onclick="document.getElementById('fileInput').click()">
                <h3>📤 Upload Files</h3>
                <p>Click here or drag files to upload</p>
                <input type="file" id="fileInput" multiple style="display: none;">
                <div id="uploadProgress" style="display: none;">
                    <div class="progress">
                        <div class="progress-bar" id="progressBar"></div>
                    </div>
                    <p id="uploadStatus">Uploading...</p>
                </div>
            </div>
            
            <div class="files-list">
                <h3>📁 Your Files</h3>
                <div id="files-list">Loading files...</div>
                <button class="btn" onclick="loadFiles()">🔄 Refresh</button>
            </div>
            
            <div class="api-links">
                <h3>🔗 API Endpoints</h3>
                <div class="api-link"><a href="/api/health" target="_blank">GET /api/health</a> - Server health check</div>
                <div class="api-link"><a href="/api/status" target="_blank">GET /api/status</a> - Detailed server status</div>
                <div class="api-link"><a href="/api/files" target="_blank">GET /api/files</a> - List files (JSON)</div>
                <div class="api-link"><a href="/api/folders" target="_blank">GET /api/folders</a> - List folders (JSON)</div>
            </div>

            <script>
                // Load server status
                async function loadStatus() {
                    try {
                        const response = await fetch('/api/status');
                        const data = await response.json();
                        document.getElementById('status-info').innerHTML = \`
                            <p><strong>Status:</strong> \${data.server}</p>
                            <p><strong>Database:</strong> \${data.database}</p>
                            <p><strong>Storage:</strong> \${data.storage}</p>
                            <p><strong>Uptime:</strong> \${Math.floor(data.uptime)} seconds</p>
                            <p><strong>Memory:</strong> \${Math.round(data.memory.rss / 1024 / 1024)} MB</p>
                        \`;
                    } catch (error) {
                        document.getElementById('status-info').innerHTML = '<p style="color: red;">Failed to load status</p>';
                    }
                }

                // Load files list
                async function loadFiles() {
                    try {
                        const response = await fetch('/api/files');
                        const data = await response.json();
                        const filesList = document.getElementById('files-list');
                        
                        if (data.files.length === 0) {
                            filesList.innerHTML = '<p>No files uploaded yet. Upload some files to get started!</p>';
                            return;
                        }
                        
                        filesList.innerHTML = data.files.map(file => \`
                            <div class="file-item">
                                <div>
                                    <strong>\${file.name}</strong><br>
                                    <small>\${file.size ? Math.round(file.size / 1024) + ' KB' : 'Unknown size'} • \${new Date(file.created_at).toLocaleString()}</small>
                                </div>
                                <a href="/api/download/\${file.id}" class="btn btn-small">📥 Download</a>
                            </div>
                        \`).join('');
                    } catch (error) {
                        document.getElementById('files-list').innerHTML = '<p style="color: red;">Failed to load files</p>';
                    }
                }

                // File upload handling
                document.getElementById('fileInput').addEventListener('change', function(e) {
                    const files = e.target.files;
                    if (files.length > 0) {
                        uploadFiles(files);
                    }
                });

                // Drag and drop
                const uploadArea = document.querySelector('.upload-area');
                uploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploadArea.style.borderColor = '#667eea';
                    uploadArea.style.background = '#f8f9ff';
                });

                uploadArea.addEventListener('dragleave', (e) => {
                    e.preventDefault();
                    uploadArea.style.borderColor = '#ddd';
                    uploadArea.style.background = 'white';
                });

                uploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    uploadArea.style.borderColor = '#ddd';
                    uploadArea.style.background = 'white';
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                        uploadFiles(files);
                    }
                });

                // Upload files function
                async function uploadFiles(files) {
                    const progressDiv = document.getElementById('uploadProgress');
                    const progressBar = document.getElementById('progressBar');
                    const statusText = document.getElementById('uploadStatus');
                    
                    progressDiv.style.display = 'block';
                    
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const formData = new FormData();
                        formData.append('file', file);
                        
                        statusText.textContent = \`Uploading \${file.name} (\${i + 1}/\${files.length})...\`;
                        progressBar.style.width = \`\${((i + 1) / files.length) * 100}%\`;
                        
                        try {
                            const response = await fetch('/api/upload', {
                                method: 'POST',
                                body: formData
                            });
                            
                            if (!response.ok) {
                                throw new Error('Upload failed');
                            }
                        } catch (error) {
                            alert(\`Failed to upload \${file.name}: \${error.message}\`);
                        }
                    }
                    
                    statusText.textContent = 'Upload complete!';
                    setTimeout(() => {
                        progressDiv.style.display = 'none';
                        progressBar.style.width = '0%';
                        loadFiles(); // Refresh file list
                    }, 2000);
                }

                // Load initial data
                loadStatus();
                loadFiles();
                
                // Auto-refresh status every 30 seconds
                setInterval(loadStatus, 30000);
            </script>
        </body>
        </html>
    `);
});

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

# Install required dependencies
echo "📦 Installing required Node.js packages..."
npm install express better-sqlite3 multer

# Update the systemd service
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
sleep 5

# Check service status
echo "📊 Checking service status..."
sudo systemctl status pocketcloud --no-pager -l | head -15

echo ""
echo "✅ Simple Frontend setup completed!"
echo ""
echo "🌐 Your PocketCloud Web Interface is now ready:"
echo "   - Full Web UI: http://192.168.4.1:3000"
echo "   - File Upload: Drag & drop or click to upload"
echo "   - File Download: Click download buttons"
echo "   - API Access: Available at /api/* endpoints"
echo ""
echo "📱 Features:"
echo "   ✅ File upload with drag & drop"
echo "   ✅ File download and management"
echo "   ✅ Server status monitoring"
echo "   ✅ Mobile-responsive design"
echo "   ✅ Real-time progress indicators"
echo ""
echo "🔗 Connect from any device:"
echo "   1. Connect to WiFi: PocketCloud-7FC (password: pocketcloud123)"
echo "   2. Open browser: http://192.168.4.1:3000"
echo "   3. Start uploading and managing files!"