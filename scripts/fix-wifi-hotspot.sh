#!/bin/bash

# Fix WiFi Hotspot for PocketCloud
# This script forces wlan0 to disconnect from current WiFi and act as access point

set -e

echo "🔧 Fixing PocketCloud WiFi Hotspot..."

# Stop all network services
echo "🛑 Stopping all network services..."
sudo systemctl stop hostapd 2>/dev/null || true
sudo systemctl stop dnsmasq 2>/dev/null || true
sudo systemctl stop wpa_supplicant 2>/dev/null || true

# Kill any wpa_supplicant processes
echo "💀 Killing wpa_supplicant processes..."
sudo pkill wpa_supplicant 2>/dev/null || true
sleep 2

# Bring down wlan0 interface
echo "📡 Bringing down wlan0 interface..."
sudo ip link set wlan0 down
sleep 2

# Flush all IP addresses from wlan0
echo "🧹 Flushing IP addresses from wlan0..."
sudo ip addr flush dev wlan0

# Remove any existing wpa_supplicant configuration for wlan0
echo "🗑️ Removing wpa_supplicant configuration..."
sudo rm -f /var/run/wpa_supplicant/wlan0 2>/dev/null || true

# Bring wlan0 back up
echo "🔄 Bringing wlan0 back up..."
sudo ip link set wlan0 up
sleep 2

# Set wlan0 to AP mode
echo "📶 Setting wlan0 to AP mode..."
sudo iw dev wlan0 set type __ap 2>/dev/null || echo "Already in AP mode or not supported"

# Configure static IP for wlan0
echo "🌐 Setting static IP for wlan0..."
sudo ip addr add 192.168.4.1/24 dev wlan0

# Update dhcpcd.conf to prevent interference
echo "⚙️ Updating dhcpcd configuration..."
sudo cp /etc/dhcpcd.conf /etc/dhcpcd.conf.backup 2>/dev/null || true

# Remove any existing wlan0 configuration from dhcpcd.conf
sudo sed -i '/^interface wlan0/,/^$/d' /etc/dhcpcd.conf

# Add new wlan0 configuration
sudo tee -a /etc/dhcpcd.conf > /dev/null << 'EOF'

# Static IP configuration for wlan0 (hotspot mode)
interface wlan0
static ip_address=192.168.4.1/24
nohook wpa_supplicant
EOF

# Update hostapd configuration
echo "📶 Updating hostapd configuration..."
sudo tee /etc/hostapd/hostapd.conf > /dev/null << 'EOF'
interface=wlan0
driver=nl80211
ssid=PocketCloud-7FC
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=pocketcloud123
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

# Update dnsmasq configuration
echo "🌐 Updating dnsmasq configuration..."
sudo tee /etc/dnsmasq.conf > /dev/null << 'EOF'
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
address=/#/192.168.4.1
EOF

# Disable wpa_supplicant for wlan0
echo "🚫 Disabling wpa_supplicant for wlan0..."
sudo systemctl disable wpa_supplicant@wlan0 2>/dev/null || true

# Enable IP forwarding
echo "🔀 Enabling IP forwarding..."
echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/99-pocketcloud.conf > /dev/null
sudo sysctl -p /etc/sysctl.d/99-pocketcloud.conf

# Configure iptables for NAT (if eth0 is available)
echo "🔥 Setting up NAT rules..."
sudo iptables -F
sudo iptables -t nat -F
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || echo "No eth0 interface found, skipping NAT"
sudo iptables -A FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || echo "No eth0 interface found"
sudo iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT 2>/dev/null || echo "No eth0 interface found"

# Save iptables rules
sudo mkdir -p /etc/iptables
sudo sh -c "iptables-save > /etc/iptables/rules.v4"

# Create systemd service to restore iptables on boot
echo "🔄 Creating iptables restore service..."
sudo tee /etc/systemd/system/iptables-restore.service > /dev/null << 'EOF'
[Unit]
Description=Restore iptables rules
After=network.target

[Service]
Type=oneshot
ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

# Enable the iptables restore service
sudo systemctl enable iptables-restore

# Restart dhcpcd to apply new configuration
echo "🔄 Restarting dhcpcd..."
sudo systemctl restart dhcpcd
sleep 3

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