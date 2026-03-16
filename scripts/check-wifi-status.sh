#!/bin/bash

# Check WiFi Hotspot Status for PocketCloud
# This script diagnoses the current WiFi configuration

echo "🔍 PocketCloud WiFi Hotspot Diagnostic"
echo "======================================"

echo ""
echo "📡 wlan0 Interface Status:"
echo "-------------------------"
ip addr show wlan0 2>/dev/null || echo "❌ wlan0 interface not found"

echo ""
echo "📶 WiFi Interface Mode:"
echo "----------------------"
iwconfig wlan0 2>/dev/null | grep -E "(Mode|ESSID|Access Point)" || echo "❌ Could not get WiFi mode info"

echo ""
echo "🔧 Service Status:"
echo "-----------------"
echo "hostapd: $(systemctl is-active hostapd 2>/dev/null || echo 'inactive')"
echo "dnsmasq: $(systemctl is-active dnsmasq 2>/dev/null || echo 'inactive')"
echo "wpa_supplicant: $(systemctl is-active wpa_supplicant 2>/dev/null || echo 'inactive')"

echo ""
echo "🌐 Network Processes:"
echo "--------------------"
ps aux | grep -E "(hostapd|dnsmasq|wpa_supplicant)" | grep -v grep || echo "No relevant processes found"

echo ""
echo "📋 Current IP Configuration:"
echo "---------------------------"
echo "Expected: 192.168.4.1 (AP mode)"
echo "Current:"
ip addr show wlan0 2>/dev/null | grep "inet " || echo "No IP assigned"

echo ""
echo "🔍 WiFi Networks Visible:"
echo "-------------------------"
sudo iw dev wlan0 scan 2>/dev/null | grep SSID | head -10 || echo "No scan results (normal if in AP mode)"

echo ""
echo "📊 Expected Configuration:"
echo "-------------------------"
echo "✅ wlan0 should have IP: 192.168.4.1"
echo "✅ hostapd should be: active"
echo "✅ dnsmasq should be: active"
echo "✅ wpa_supplicant should be: inactive (for wlan0)"
echo "✅ WiFi mode should be: Master/AP"
echo ""
echo "🚀 If issues found, run: sudo bash scripts/fix-wifi-hotspot.sh"