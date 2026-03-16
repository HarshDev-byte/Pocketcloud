# PocketCloud Backend Troubleshooting Guide

## Current Issues Fixed

### 1. Database Initialization Error
**Problem**: `Database not initialized. Call initializeDatabase() first.`

**Root Cause**: The UploadService was trying to access the database before it was initialized.

**Fix Applied**:
- Modified UploadService constructor to defer database access
- Fixed database client to properly create directories
- Updated migration system to handle empty databases

### 2. Route Handler Undefined Error
**Problem**: `Route.get() requires a callback function but got a [object Undefined]`

**Root Cause**: Dynamic import of `fs` module was causing issues in files.routes.ts

**Fix Applied**:
- Removed problematic dynamic import
- Used the already imported `fs` from the top of the file

## Quick Fix Commands

### Option 1: Run the automated fix script
```bash
# Run the comprehensive fix script
sudo bash /opt/pocketcloud/scripts/fix-backend-issues.sh
```

### Option 2: Manual steps

1. **Install missing dependencies**:
```bash
cd /opt/pocketcloud/pocket-cloud/backend
sudo npm install tsx -g
sudo npm install
```

2. **Initialize database manually**:
```bash
sudo bash /opt/pocketcloud/scripts/init-database.sh
```

3. **Update systemd service**:
```bash
sudo systemctl stop pocketcloud

# Update service file to use tsx
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

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start pocketcloud
```

4. **Test the backend**:
```bash
# Check service status
sudo systemctl status pocketcloud

# Test API endpoint
curl http://localhost:3000/api/health

# View logs
sudo journalctl -u pocketcloud -f
```

## Verification Steps

### 1. Check Database
```bash
# Verify database exists and has tables
sudo -u pocketcloud sqlite3 /mnt/pocketcloud/data/storage.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"
```

### 2. Check Service Status
```bash
sudo systemctl status pocketcloud --no-pager
```

### 3. Check API Health
```bash
curl -s http://localhost:3000/api/health | jq .
```

### 4. Check WiFi Hotspot
```bash
# Should show PocketCloud-7FC network
iwconfig wlan0
```

### 5. Test Web Interface
Open browser and navigate to: `http://192.168.4.1:3000`

## Common Issues and Solutions

### Issue: "tsx: command not found"
```bash
sudo npm install -g tsx
```

### Issue: "Permission denied" on database
```bash
sudo chown -R pocketcloud:pocketcloud /mnt/pocketcloud/
```

### Issue: "Port 3000 already in use"
```bash
# Check what's using port 3000
sudo lsof -i :3000

# Kill the process if needed
sudo pkill -f "node.*3000"
```

### Issue: Database locked
```bash
# Stop the service first
sudo systemctl stop pocketcloud

# Remove WAL files if corrupted
sudo rm -f /mnt/pocketcloud/data/storage.db-wal
sudo rm -f /mnt/pocketcloud/data/storage.db-shm

# Restart service
sudo systemctl start pocketcloud
```

## System Status Check

Run this command to get a complete system status:

```bash
echo "=== PocketCloud System Status ==="
echo "1. Service Status:"
sudo systemctl status pocketcloud --no-pager | head -10

echo -e "\n2. Database Status:"
if [ -f /mnt/pocketcloud/data/storage.db ]; then
    echo "✅ Database file exists"
    sudo -u pocketcloud sqlite3 /mnt/pocketcloud/data/storage.db "SELECT COUNT(*) as tables FROM sqlite_master WHERE type='table';"
else
    echo "❌ Database file missing"
fi

echo -e "\n3. API Status:"
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ API responding"
    curl -s http://localhost:3000/api/health | jq .status
else
    echo "❌ API not responding"
fi

echo -e "\n4. WiFi Hotspot:"
if iwconfig wlan0 2>/dev/null | grep -q "PocketCloud"; then
    echo "✅ Hotspot active"
else
    echo "❌ Hotspot not active"
fi

echo -e "\n5. Storage:"
df -h /mnt/pocketcloud | tail -1

echo -e "\n6. Recent Logs:"
sudo journalctl -u pocketcloud --no-pager -n 5
```

## Next Steps After Fix

1. **Create admin user** (if needed):
   - Access web interface at `http://192.168.4.1:3000`
   - Complete setup wizard

2. **Test file upload**:
   - Upload a test file through web interface
   - Verify it appears in `/mnt/pocketcloud/files/`

3. **Test client connections**:
   - Connect device to `PocketCloud-7FC` WiFi
   - Access `http://192.168.4.1:3000` in browser

## Support

If issues persist:
1. Check logs: `sudo journalctl -u pocketcloud -f`
2. Verify all dependencies are installed
3. Ensure USB storage is properly mounted
4. Check network configuration