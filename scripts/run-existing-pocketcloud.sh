#!/bin/bash

# Run the EXISTING PocketCloud TypeScript Backend and React Frontend
# This script uses all the work we've already built together

set -e

echo "🚀 Starting the EXISTING PocketCloud System..."
echo "   Using the TypeScript backend and React frontend we built together"

# Navigate to the project directory
cd /opt/pocketcloud/pocket-cloud

# Check if we have the existing codebase
if [ ! -f "backend/src/index.ts" ]; then
    echo "❌ Error: Existing TypeScript backend not found"
    echo "   Expected: backend/src/index.ts"
    exit 1
fi

if [ ! -f "frontend/src/main.tsx" ]; then
    echo "❌ Error: Existing React frontend not found"
    echo "   Expected: frontend/src/main.tsx"
    exit 1
fi

echo "✅ Found existing PocketCloud codebase"

# Set up environment variables for the existing backend
echo "⚙️ Setting up environment..."
cd backend

# Create .env file with proper paths
cat > .env << 'EOF'
# PocketCloud Environment Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database Configuration
DATABASE_PATH=/mnt/pocketcloud/data/storage.db

# Storage Configuration
STORAGE_PATH=/mnt/pocketcloud/files

# Security Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
BCRYPT_ROUNDS=12

# CORS Configuration
CORS_ORIGIN=*

# Performance Configuration
ENABLE_COMPRESSION=true
COMPRESSION_LEVEL=6

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# WebSocket Configuration
WS_HEARTBEAT_INTERVAL=30000

# Static Files
STATIC_PATH=../frontend/dist
EOF

# Install backend dependencies if needed
echo "📦 Installing backend dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "   Dependencies already installed"
fi

# Build the existing TypeScript backend
echo "🔨 Building TypeScript backend..."
if [ ! -d "dist" ]; then
    echo "   Creating dist directory and copying source files..."
    mkdir -p dist
    # Copy TypeScript files and compile them with tsx
    npx tsx --build src/index.ts --outDir dist 2>/dev/null || {
        echo "   Using tsx to run TypeScript directly..."
        # Create a simple wrapper that uses tsx
        cat > dist/index.js << 'EOF'
// PocketCloud Backend - TypeScript Runtime Wrapper
const { spawn } = require('child_process');
const path = require('path');

// Run the TypeScript source directly with tsx
const tsxPath = path.join(__dirname, '../node_modules/.bin/tsx');
const srcPath = path.join(__dirname, '../src/index.ts');

console.log('🚀 Starting PocketCloud TypeScript backend...');
const child = spawn('node', [tsxPath, srcPath], {
    stdio: 'inherit',
    env: process.env
});

child.on('error', (error) => {
    console.error('Failed to start backend:', error);
    process.exit(1);
});

child.on('exit', (code) => {
    process.exit(code);
});
EOF
    }
else
    echo "   Backend already built"
fi

echo "✅ Backend ready"

# Build the existing React frontend
echo "🎨 Building React frontend..."
cd ../frontend

# Install frontend dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
else
    echo "   Frontend dependencies already installed"
fi

# Build the React app
echo "🔨 Building React frontend..."
npm run build

# Check if build was successful
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "❌ Frontend build failed"
    exit 1
fi

echo "✅ Frontend built successfully"

# Go back to backend directory
cd ../backend

# Create systemd service for the EXISTING backend
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/pocketcloud.service > /dev/null << EOF
[Unit]
Description=PocketCloud Personal Cloud Server (TypeScript)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pocketcloud/pocket-cloud/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start the service
echo "🔄 Starting PocketCloud service..."
sudo systemctl daemon-reload
sudo systemctl stop pocketcloud 2>/dev/null || true
sudo systemctl start pocketcloud
sudo systemctl enable pocketcloud

echo "⏳ Waiting for service to start..."
sleep 5

# Check service status
echo "📊 Checking service status..."
if sudo systemctl is-active --quiet pocketcloud; then
    echo "✅ PocketCloud service is running"
else
    echo "❌ Service failed to start. Checking logs..."
    sudo journalctl -u pocketcloud --no-pager -n 20
    exit 1
fi

# Show service logs
echo ""
echo "📋 Recent service logs:"
sudo journalctl -u pocketcloud --no-pager -n 10

# Test the API
echo ""
echo "🧪 Testing API endpoints..."
sleep 2

# Test health endpoint
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ Health endpoint responding"
else
    echo "❌ Health endpoint not responding"
fi

# Show final status
echo ""
echo "🎉 PocketCloud is now running with your EXISTING codebase!"
echo ""
echo "✨ Features available:"
echo "   🎨 Professional React frontend with TypeScript"
echo "   🔧 Full TypeScript backend with Express.js"
echo "   📁 Advanced file management system"
echo "   🔒 Authentication and authorization"
echo "   📤 Multi-file upload with progress tracking"
echo "   🗂️  Folder management and organization"
echo "   🔍 File search and filtering"
echo "   📱 Mobile-responsive design"
echo "   🌐 WebSocket real-time updates"
echo "   🗄️  SQLite database with migrations"
echo "   🛡️  Security middleware and rate limiting"
echo "   📊 Admin dashboard and system monitoring"
echo ""
echo "🌐 Access your PocketCloud at:"
echo "   http://192.168.4.1:3000"
echo ""
echo "📱 Connect from any device:"
echo "   1. WiFi: PocketCloud-7FC (password: pocketcloud123)"
echo "   2. Browser: http://192.168.4.1:3000"
echo "   3. Enjoy your professional personal cloud!"
echo ""
echo "🔧 Service management:"
echo "   Status: sudo systemctl status pocketcloud"
echo "   Logs: sudo journalctl -u pocketcloud -f"
echo "   Restart: sudo systemctl restart pocketcloud"