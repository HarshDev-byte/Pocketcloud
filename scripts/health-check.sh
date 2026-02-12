#!/bin/bash

# 🏥 PocketCloud Health Check
# Checks system health and reports status

echo "🏥 PocketCloud Health Check"
echo "=========================="
echo ""

# Check if server is running
echo "🔍 Checking server status..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Server is running"
    
    # Get health status
    HEALTH=$(curl -s http://localhost:3000/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    if [ "$HEALTH" = "healthy" ]; then
        echo "✅ System is healthy"
    else
        echo "⚠️ System has issues"
    fi
else
    echo "❌ Server is not running"
    echo ""
    echo "🚀 Start with: ./scripts/start-server.sh"
    exit 1
fi

# Check Node.js
echo ""
echo "🔍 System information..."
echo "Node.js: $(node -v)"
echo "Platform: $(uname -s)"
echo "Architecture: $(uname -m)"

# Check storage
echo ""
echo "🔍 Storage information..."
if [ -d "/mnt/pocketcloud" ]; then
    echo "✅ Storage mount point exists"
    if mountpoint -q /mnt/pocketcloud 2>/dev/null; then
        echo "✅ External storage mounted"
        df -h /mnt/pocketcloud | tail -1
    else
        echo "⚠️ External storage not mounted"
    fi
else
    echo "⚠️ Storage mount point not found"
fi

# Check backend directory
echo ""
echo "🔍 Backend status..."
if [ -f "backend/server.js" ]; then
    echo "✅ Backend files present"
else
    echo "❌ Backend files missing"
fi

if [ -f "backend/package.json" ]; then
    echo "✅ Package configuration present"
else
    echo "❌ Package configuration missing"
fi

echo ""
echo "✅ Health check complete!"