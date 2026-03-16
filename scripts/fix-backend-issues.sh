#!/bin/bash

# Fix PocketCloud Backend Issues
# This script addresses the database initialization and route handler problems

set -e

echo "🔧 Fixing PocketCloud Backend Issues..."

# Navigate to backend directory
cd /opt/pocketcloud/pocket-cloud/backend

echo "📦 Installing missing dependencies..."
# Install tsx globally if not already installed
if ! command -v tsx &> /dev/null; then
    sudo npm install -g tsx
fi

# Ensure all dependencies are installed
sudo npm install

echo "🗄️ Setting up database directories..."
# Create database directory
sudo mkdir -p /mnt/pocketcloud/data
sudo mkdir -p /mnt/pocketcloud/backups
sudo mkdir -p /mnt/pocketcloud/uploads
sudo mkdir -p /mnt/pocketcloud/trash
sudo mkdir -p /mnt/pocketcloud/cache

# Set proper ownership
sudo chown -R pocketcloud:pocketcloud /mnt/pocketcloud/

echo "🔑 Creating .env file..."
# Copy .env file if it doesn't exist
if [ ! -f .env ]; then
    sudo cp .env.example .env
    sudo chown pocketcloud:pocketcloud .env
fi

echo "🗃️ Initializing database..."
# Run database migration as pocketcloud user
sudo -u pocketcloud tsx src/db/migrate.ts

echo "🔧 Updating systemd service..."
# Update the systemd service to use tsx instead of node
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
ExecStart=/usr/local/bin/tsx src/index.ts
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pocketcloud

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/mnt/pocketcloud /var/log/pocketcloud
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

echo "🔄 Reloading systemd and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable pocketcloud
sudo systemctl start pocketcloud

echo "⏳ Waiting for service to start..."
sleep 5

echo "📊 Checking service status..."
sudo systemctl status pocketcloud --no-pager

echo "📋 Checking service logs..."
sudo journalctl -u pocketcloud --no-pager -n 20

echo "🌐 Testing backend API..."
# Test the health endpoint
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ Backend API is responding!"
    curl -s http://localhost:3000/api/health | jq .
else
    echo "❌ Backend API is not responding"
    echo "📋 Recent logs:"
    sudo journalctl -u pocketcloud --no-pager -n 10
fi

echo ""
echo "🎉 Backend fix script completed!"
echo ""
echo "📝 Next steps:"
echo "1. Check if the service is running: sudo systemctl status pocketcloud"
echo "2. View logs: sudo journalctl -u pocketcloud -f"
echo "3. Test API: curl http://localhost:3000/api/health"
echo "4. Access web interface: http://192.168.4.1:3000"