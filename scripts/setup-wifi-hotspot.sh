#!/bin/bash

# Setup WiFi Hotspot for PocketCloud
# This script configures the Raspberry Pi as a WiFi access point

set -e

echo "🌐 Setting up PocketCloud WiFi Hotspot..."

# Stop services first
echo "🛑 Stopping network services..."
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq

# Disconnect from current WiFi network
echo "📡 Disconnecting from current WiFi..."
sudo wpa_cli disconnect
sudo ip addr flush dev wlan0

# Configure wlan0 as access point with static IP
echo "🔧 Configuring wlan0 interface..."
sudo ip addr add 192.168.4.1/24 dev wlan0

# Enable IP forwarding
echo "🔀 Enabling IP forwarding..."
echo 'net.ipv4.ip_forward=1' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Configure iptables for NAT (if eth0 is available)
echo "🔥 Setting up NAT rules..."
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || echo "No eth0 interface found, skipping NAT"
sudo iptables -A FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || echo "No eth0 interface found"
sudo iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT 2>/dev/null || echo "No eth0 interface found"

# Save iptables rules
sudo sh -c "iptables-save > /etc/iptables.ipv4.nat"

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

# Create dhcpcd configuration to prevent conflicts
echo "⚙️ Configuring dhcpcd..."
sudo tee -a /etc/dhcpcd.conf > /dev/null << 'EOF'

# Static IP configuration for wlan0 (hotspot mode)
interface wlan0
static ip_address=192.168.4.1/24
nohook wpa_supplicant
EOF

# Create systemd service to restore iptables on boot
echo "🔄 Creating iptables restore service..."
sudo tee /etc/systemd/system/iptables-restore.service > /dev/null << 'EOF'
[Unit]
Description=Restore iptables rules
After=network.target

[Service]
Type=oneshot
ExecStart=/sbin/iptables-restore /etc/iptables.ipv4.nat
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

# Enable the iptables restore service
sudo systemctl enable iptables-restore

# Restart networking
echo "🔄 Restarting network services..."
sudo systemctl restart dhcpcd
sleep 2

# Start hostapd and dnsmasq
echo "🚀 Starting WiFi hotspot services..."
sudo systemctl start hostapd
sudo systemctl start dnsmasq

# Enable services to start on boot
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq

echo "⏳ Waiting for services to start..."
sleep 5

# Check service status
echo "📊 Checking service status..."
echo "=== hostapd status ==="
sudo systemctl status hostapd --no-pager | head -10

echo "=== dnsmasq status ==="
sudo systemctl status dnsmasq --no-pager | head -10

echo "=== wlan0 interface ==="
ip addr show wlan0

echo "=== WiFi networks visible ==="
sudo iwlist wlan0 scan | grep ESSID | head -5

echo ""
echo "✅ WiFi Hotspot setup completed!"
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