#!/bin/bash

# Continue WiFi Hotspot Fix for PocketCloud
# This script continues from where the original fix left off

set -e

echo "🔄 Continuing WiFi Hotspot fix..."

# The original script failed at dhcpcd restart, so let's continue from there
echo "⏳ Skipping dhcpcd restart (not available)..."

# Start hostapd and dnsmasq
echo "🚀 Starting WiFi hotspot services..."
sudo systemctl start hostapd
sleep 2
sudo systemctl start dnsmasq
sleep 2

# Enable services to start on boot
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq

echo "⏳ Waiting for services to stabilize..."
sleep 5

# Check service status
echo ""
echo "📊 Checking service status..."
echo "=== hostapd status ==="
sudo systemctl status hostapd --no-pager -l | head -15

echo ""
echo "=== dnsmasq status ==="
sudo systemctl status dnsmasq --no-pager -l | head -15

echo ""
echo "=== wlan0 interface ==="
ip addr show wlan0

echo ""
echo "=== WiFi interface mode ==="
iwconfig wlan0 2>/dev/null | grep Mode || echo "Could not determine mode"

echo ""
echo "=== Active WiFi networks ==="
sudo iw dev wlan0 scan 2>/dev/null | grep SSID | head -5 || echo "No scan results (normal for AP mode)"

echo ""
echo "✅ WiFi Hotspot fix completed!"
echo ""
echo "📶 Your PocketCloud hotspot should now be visible:"
echo "   - Network Name: PocketCloud-7FC"
echo "   - Password: pocketcloud123"
echo "   - Gateway IP: 192.168.4.1"
echo ""
echo "🌐 To access PocketCloud:"
echo "   1. Connect to WiFi: PocketCloud-7FC"
echo "   2. Open browser: http://192.168.4.1:3000"
echo ""
echo "🔧 To troubleshoot:"
echo "   - Check services: sudo systemctl status hostapd dnsmasq"
echo "   - View logs: sudo journalctl -u hostapd -f"
echo "   - Check interface: iwconfig wlan0"
echo "   - Check IP: ip addr show wlan0"
echo ""
echo "📱 Test from your phone/device:"
echo "   - Look for 'PocketCloud-7FC' in WiFi settings"
echo "   - Connect with password: pocketcloud123"
echo "   - Open browser to: http://192.168.4.1:3000"