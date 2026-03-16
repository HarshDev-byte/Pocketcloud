#!/bin/bash

# Compile TypeScript and Run PocketCloud
# This script compiles TypeScript to JavaScript and runs it

set -e

echo "🔧 Compiling and running PocketCloud..."

cd /opt/pocketcloud/pocket-cloud/backend

# Install dependencies if needed
echo "📦 Installing dependencies..."
sudo npm install

# Create a simple build script
echo "🏗️ Building TypeScript..."
sudo npx tsc --outDir dist --rootDir src --module commonjs --target es2020 --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --resolveJsonModule

# Create database directory and initialize
echo "🗄️ Setting up database..."
sudo mkdir -p /mnt/pocketcloud/data
sudo mkdir -p /mnt/pocketcloud/files
sudo mkdir -p /mnt/pocketcloud/uploads
sudo mkdir -p /mnt/pocketcloud/trash
sudo mkdir -p /mnt/pocketcloud/cache
sudo mkdir -p /mnt/pocketcloud/backups

# Set ownership
sudo chown -R pocketcloud:pocketcloud /mnt/pocketcloud/

# Initialize database with Node.js directly
echo "🗃️ Initializing database..."
sudo -u pocketcloud node -e "
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Create database
const dbPath = '/mnt/pocketcloud/data/storage.db';
console.log('Creating database at:', dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');
db.pragma('foreign_keys = ON');
db.pragma('temp_store = MEMORY');

// Execute schema
const schema = fs.readFileSync('src/db/schema.sql', 'utf-8');
db.exec(schema);

const tables = db.prepare(\"SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'\").get();
console.log('✅ Database created with', tables.count, 'tables');
db.close();
"

# Update systemd service to use compiled JavaScript
echo "🔧 Updating systemd service..."
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
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pocketcloud

[Install]
WantedBy=multi-user.target
EOF

# Reload and start service
echo "🔄 Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable pocketcloud
sudo systemctl restart pocketcloud

# Wait and check status
sleep 3
echo "📊 Service status:"
sudo systemctl status pocketcloud --no-pager

echo "🌐 Testing API..."
sleep 2
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ API is responding!"
    curl -s http://localhost:3000/api/health | jq . 2>/dev/null || curl -s http://localhost:3000/api/health
else
    echo "❌ API not responding, checking logs..."
    sudo journalctl -u pocketcloud --no-pager -n 10
fi

echo "✅ Setup completed!"