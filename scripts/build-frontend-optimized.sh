#!/bin/bash

# Build PocketCloud Frontend with Raspberry Pi Optimizations
# This script builds the real React frontend with memory and CPU optimizations

set -e

echo "🚀 Building PocketCloud Frontend (Optimized for Raspberry Pi)..."

# Navigate to frontend directory
cd /opt/pocketcloud/pocket-cloud/frontend

# Check if we have enough memory
AVAILABLE_MEM=$(free -m | awk 'NR==2{printf "%.0f", $7}')
echo "📊 Available memory: ${AVAILABLE_MEM}MB"

if [ "$AVAILABLE_MEM" -lt 500 ]; then
    echo "⚠️  Low memory detected. Creating swap file..."
    
    # Create temporary swap file for build process
    sudo fallocate -l 1G /tmp/build-swap
    sudo chmod 600 /tmp/build-swap
    sudo mkswap /tmp/build-swap
    sudo swapon /tmp/build-swap
    
    echo "✅ Temporary swap created"
fi

# Set Node.js memory limits for Raspberry Pi
export NODE_OPTIONS="--max-old-space-size=1024"

# Install dependencies with optimizations
echo "📦 Installing dependencies..."
npm ci --production=false --silent

# Create optimized Vite config for Pi
echo "⚙️ Creating optimized build configuration..."
cat > vite.config.ts.pi << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    // Optimize for Raspberry Pi
    target: 'es2015',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['lucide-react'],
        },
      },
    },
    // Reduce memory usage
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  // Optimize dev server for Pi
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})
EOF

# Backup original config and use optimized version
if [ -f "vite.config.ts" ]; then
    mv vite.config.ts vite.config.ts.backup
fi
mv vite.config.ts.pi vite.config.ts

# Build with progress monitoring
echo "🔨 Building frontend (this may take 5-10 minutes on Pi)..."

# Run build with timeout and progress
timeout 900 npm run build 2>&1 | while IFS= read -r line; do
    echo "$line"
    # Show progress for long operations
    if [[ "$line" == *"transforming"* ]] || [[ "$line" == *"rendering chunks"* ]]; then
        echo "⏳ Still building... (this is normal on Raspberry Pi)"
    fi
done

BUILD_EXIT_CODE=${PIPESTATUS[0]}

if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo "✅ Frontend build completed successfully!"
else
    echo "❌ Build failed with exit code $BUILD_EXIT_CODE"
    
    # Restore original config
    if [ -f "vite.config.ts.backup" ]; then
        mv vite.config.ts.backup vite.config.ts
    fi
    
    # Clean up swap
    if [ -f "/tmp/build-swap" ]; then
        sudo swapoff /tmp/build-swap 2>/dev/null || true
        sudo rm -f /tmp/build-swap
    fi
    
    exit 1
fi

# Restore original config
if [ -f "vite.config.ts.backup" ]; then
    mv vite.config.ts.backup vite.config.ts
fi

# Verify build output
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "❌ Build output not found"
    exit 1
fi

echo "📊 Build statistics:"
echo "   - Build size: $(du -sh dist | cut -f1)"
echo "   - Files created: $(find dist -type f | wc -l)"

# Update backend to serve the built frontend
echo "🔧 Updating backend server..."
cd ../backend

# Create production server that serves the React app
cat > server.js << 'EOF'
const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const multer = require('multer');
const cors = require('cors');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const dbPath = '/mnt/pocketcloud/data/storage.db';
const storagePath = '/mnt/pocketcloud/files';

console.log('🚀 Starting PocketCloud Server...');
console.log('Database path:', dbPath);
console.log('Storage path:', storagePath);

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

// Create tables
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            size INTEGER,
            type TEXT,
            folder_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (folder_id) REFERENCES folders (id)
        );
        
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            parent_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES folders (id)
        );
        
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER,
            folder_id INTEGER,
            share_token TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            expires_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (file_id) REFERENCES files (id),
            FOREIGN KEY (folder_id) REFERENCES folders (id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id);
        CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
        CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(share_token);
    `);
    
    const tableCount = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get();
    console.log(`✅ Database initialized with ${tableCount.count} tables`);
} catch (error) {
    console.error('Database initialization error:', error);
}

// Configure multer for file uploads
const upload = multer({
    dest: storagePath,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit
    }
});

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Security headers
app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    next();
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
    const stats = fs.statSync(storagePath);
    res.json({
        server: 'running',
        database: 'connected',
        storage: 'mounted',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        storage_path: storagePath,
        timestamp: new Date().toISOString()
    });
});

// Files API
app.get('/api/files', (req, res) => {
    try {
        const folderId = req.query.folder_id || null;
        const files = db.prepare(`
            SELECT f.*, 
                   CASE WHEN f.type LIKE 'image/%' THEN 'image'
                        WHEN f.type LIKE 'video/%' THEN 'video'
                        WHEN f.type LIKE 'audio/%' THEN 'audio'
                        WHEN f.type LIKE 'text/%' OR f.type = 'application/pdf' THEN 'document'
                        ELSE 'file'
                   END as category
            FROM files f 
            WHERE f.folder_id ${folderId ? '= ?' : 'IS NULL'}
            ORDER BY f.created_at DESC
        `).all(folderId ? [folderId] : []);
        
        res.json({ files, count: files.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch files', details: error.message });
    }
});

app.get('/api/folders', (req, res) => {
    try {
        const parentId = req.query.parent_id || null;
        const folders = db.prepare(`
            SELECT * FROM folders 
            WHERE parent_id ${parentId ? '= ?' : 'IS NULL'}
            ORDER BY name ASC
        `).all(parentId ? [parentId] : []);
        
        res.json({ folders, count: folders.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch folders', details: error.message });
    }
});

// File upload
app.post('/api/upload', upload.array('files'), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        
        const folderId = req.body.folder_id || null;
        const uploadedFiles = [];
        
        for (const file of req.files) {
            const originalName = file.originalname;
            const finalPath = path.join(storagePath, `${Date.now()}_${originalName}`);
            
            // Move file to final location
            fs.renameSync(file.path, finalPath);
            
            // Save to database
            const stmt = db.prepare(`
                INSERT INTO files (name, path, size, type, folder_id) 
                VALUES (?, ?, ?, ?, ?)
            `);
            const result = stmt.run(originalName, finalPath, file.size, file.mimetype, folderId);
            
            uploadedFiles.push({
                id: result.lastInsertRowid,
                name: originalName,
                size: file.size,
                type: file.mimetype
            });
        }
        
        res.json({ 
            success: true, 
            files: uploadedFiles,
            message: `${uploadedFiles.length} file(s) uploaded successfully`
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed', details: error.message });
    }
});

// File download
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

// Create folder
app.post('/api/folders', (req, res) => {
    try {
        const { name, parent_id } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Folder name is required' });
        }
        
        const folderPath = parent_id ? 
            path.join(storagePath, 'folders', String(parent_id), name) :
            path.join(storagePath, 'folders', name);
        
        // Create physical folder
        fs.mkdirSync(folderPath, { recursive: true });
        
        // Save to database
        const stmt = db.prepare('INSERT INTO folders (name, path, parent_id) VALUES (?, ?, ?)');
        const result = stmt.run(name, folderPath, parent_id || null);
        
        res.json({
            success: true,
            folder: {
                id: result.lastInsertRowid,
                name,
                path: folderPath,
                parent_id: parent_id || null
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create folder', details: error.message });
    }
});

// Serve React frontend
const frontendPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendPath)) {
    console.log('📁 Serving React frontend from:', frontendPath);
    app.use(express.static(frontendPath));
    
    // Handle React Router (SPA routing)
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(frontendPath, 'index.html'));
        } else {
            res.status(404).json({ error: 'API endpoint not found' });
        }
    });
} else {
    console.log('⚠️  React frontend not found at:', frontendPath);
    app.get('/', (req, res) => {
        res.json({ 
            error: 'Frontend not built', 
            message: 'Run the build script to compile the React frontend' 
        });
    });
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PocketCloud server running on http://0.0.0.0:${PORT}`);
    console.log(`📁 Storage: ${storagePath}`);
    console.log(`🗄️  Database: ${dbPath}`);
    console.log(`🌐 Access: http://192.168.4.1:${PORT}`);
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

# Install additional backend dependencies
echo "📦 Installing backend dependencies..."
npm install cors compression

# Clean up temporary swap
if [ -f "/tmp/build-swap" ]; then
    echo "🧹 Cleaning up temporary swap..."
    sudo swapoff /tmp/build-swap 2>/dev/null || true
    sudo rm -f /tmp/build-swap
fi

# Update systemd service
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

# Restart service
echo "🔄 Restarting PocketCloud service..."
sudo systemctl daemon-reload
sudo systemctl restart pocketcloud

echo "⏳ Waiting for service to start..."
sleep 5

# Check service status
echo "📊 Service status:"
sudo systemctl status pocketcloud --no-pager -l | head -15

echo ""
echo "🎉 PocketCloud Frontend Build Complete!"
echo ""
echo "✅ Features now available:"
echo "   🎨 Modern React interface with TypeScript"
echo "   📱 Mobile-responsive design"
echo "   📁 Advanced file browser with drag & drop"
echo "   📤 Multi-file upload with progress"
echo "   🗂️  Folder management"
echo "   🔍 File search and filtering"
echo "   📊 Storage monitoring"
echo "   🌐 PWA features for mobile installation"
echo ""
echo "🌐 Access your PocketCloud at:"
echo "   http://192.168.4.1:3000"
echo ""
echo "📱 Connect from any device:"
echo "   1. WiFi: PocketCloud-7FC (password: pocketcloud123)"
echo "   2. Browser: http://192.168.4.1:3000"
echo "   3. Enjoy your personal cloud!"