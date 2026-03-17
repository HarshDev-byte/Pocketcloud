#!/bin/bash
set -euo pipefail

# PocketCloud Network Setup Script
# Configures Raspberry Pi as a WiFi hotspot with static IP and DHCP

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_green() { echo -e "${GREEN}✓ $1${NC}"; }
echo_red() { echo -e "${RED}✗ $1${NC}"; }
echo_yellow() { echo -e "${YELLOW}⚠ $1${NC}"; }

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PocketCloud Network Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# STEP 1 — Install packages
echo_yellow "Step 1: Installing required packages..."
# Update package list quietly
sudo apt-get update -qq
# Install hostapd (WiFi access point daemon), dnsmasq (DHCP/DNS server), avahi-daemon (mDNS), iptables (firewall)
sudo apt-get install -y hostapd dnsmasq avahi-daemon iptables
# Stop services before configuration (|| true prevents script exit if services aren't running)
sudo systemctl stop hostapd dnsmasq || true
# Unmask hostapd in case it was previously masked
sudo systemctl unmask hostapd
echo_green "Packages installed"

# STEP 2 — Static IP for wlan0
echo_yellow "Step 2: Configuring static IP for wlan0..."
# Check if static IP configuration already exists in dhcpcd.conf
if grep -q "static ip_address=192.168.4.1" /etc/dhcpcd.conf; then
    echo_yellow "Static IP already configured in /etc/dhcpcd.conf"
else
    # Append static IP configuration to dhcpcd.conf
    # This assigns 192.168.4.1/24 to wlan0 and disables wpa_supplicant hook
    echo "" | sudo tee -a /etc/dhcpcd.conf > /dev/null
    echo "# PocketCloud static IP configuration" | sudo tee -a /etc/dhcpcd.conf > /dev/null
    echo "interface wlan0" | sudo tee -a /etc/dhcpcd.conf > /dev/null
    echo "static ip_address=192.168.4.1/24" | sudo tee -a /etc/dhcpcd.conf > /dev/null
    echo "nohook wpa_supplicant" | sudo tee -a /etc/dhcpcd.conf > /dev/null
    echo_green "Static IP configured"
fi

# STEP 3 — dnsmasq config
echo_yellow "Step 3: Configuring dnsmasq (DHCP + DNS)..."
# Backup original dnsmasq configuration if backup doesn't exist
if [ ! -f /etc/dnsmasq.conf.bak ]; then
    sudo cp /etc/dnsmasq.conf /etc/dnsmasq.conf.bak
    echo_yellow "Original dnsmasq.conf backed up"
fi
# Write new dnsmasq configuration
# interface=wlan0: Listen only on wlan0
# bind-dynamic: Bind to interfaces dynamically
# domain-needed: Don't forward plain names
# bogus-priv: Don't forward reverse lookups for private IP ranges
# dhcp-range: Assign IPs from 192.168.4.2 to 192.168.4.20 with 24h lease
# dhcp-option=3: Set gateway to 192.168.4.1
# dhcp-option=6: Set DNS server to 192.168.4.1
# address=/#/: Catch-all DNS to redirect everything to Pi
sudo tee /etc/dnsmasq.conf > /dev/null << 'EOF'
# PocketCloud DHCP + DNS
interface=wlan0
bind-dynamic
domain-needed
bogus-priv
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
dhcp-option=3,192.168.4.1
dhcp-option=6,192.168.4.1
address=/#/192.168.4.1
log-queries
log-dhcp
EOF
echo_green "dnsmasq configured"

# STEP 4 — hostapd config
echo_yellow "Step 4: Configuring hostapd (WiFi access point)..."
# Generate unique 4-character suffix from Pi's CPU serial number
SUFFIX=$(cat /proc/cpuinfo | grep Serial | tail -c 5 | tr -d '\n' | tr '[:lower:]' '[:upper:]')
SSID="PocketCloud-${SUFFIX}"
# Write hostapd configuration
# interface=wlan0: Use wlan0 for AP
# driver=nl80211: Standard Linux wireless driver
# ssid: Network name with unique suffix
# hw_mode=g: Use 2.4GHz band
# channel=6: WiFi channel 6
# wmm_enabled=1: Enable WiFi Multimedia extensions
# macaddr_acl=0: Accept all MAC addresses
# auth_algs=1: Use open system authentication
# ignore_broadcast_ssid=0: Broadcast SSID
# wpa=2: Use WPA2
# wpa_passphrase: Network password
# wpa_key_mgmt=WPA-PSK: Use pre-shared key
# wpa_pairwise=TKIP: TKIP encryption for WPA
# rsn_pairwise=CCMP: CCMP encryption for WPA2
# ieee80211n=1: Enable 802.11n (WiFi 4)
# ieee80211ac=0: Disable 802.11ac (WiFi 5) - not supported on Pi 4B's 2.4GHz
sudo tee /etc/hostapd/hostapd.conf > /dev/null << EOF
interface=wlan0
driver=nl80211
ssid=${SSID}
hw_mode=g
channel=6
wmm_enabled=1
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=pocketcloud123
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
ieee80211n=1
ieee80211ac=0
EOF
# Tell hostapd where to find its configuration file
sudo tee /etc/default/hostapd > /dev/null << 'EOF'
DAEMON_CONF="/etc/hostapd/hostapd.conf"
EOF
echo_green "hostapd configured with SSID: ${SSID}"

# STEP 5 — Enable IP forwarding
echo_yellow "Step 5: Enabling IP forwarding..."
# Uncomment net.ipv4.ip_forward=1 in sysctl.conf to enable routing
sudo sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/' /etc/sysctl.conf
# Apply sysctl changes immediately
sudo sysctl -p > /dev/null
echo_green "IP forwarding enabled"

# STEP 5.5 — Configure NAT for internet sharing via ethernet
echo_yellow "Step 5.5: Configuring NAT for internet sharing..."
# Flush existing iptables NAT rules to start clean
sudo iptables -t nat -F
# Enable NAT (Network Address Translation) from wlan0 to eth0
# This allows WiFi clients to access internet through ethernet connection
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
# Allow forwarding from eth0 to wlan0 (internet to WiFi clients)
sudo iptables -A FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT
# Allow forwarding from wlan0 to eth0 (WiFi clients to internet)
sudo iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT
# Save iptables rules so they persist after reboot
sudo sh -c "iptables-save > /etc/iptables.ipv4.nat"
# Create restore script that runs on boot
if ! grep -q "iptables-restore" /etc/rc.local; then
    sudo sed -i 's/^exit 0/iptables-restore < \/etc\/iptables.ipv4.nat\nexit 0/' /etc/rc.local
fi
echo_green "NAT configured - internet will be shared when ethernet is connected"

# STEP 6 — Enable services
echo_yellow "Step 6: Enabling services to start on boot..."
# Enable hostapd to start automatically on boot
sudo systemctl enable hostapd > /dev/null 2>&1
# Enable dnsmasq to start automatically on boot
sudo systemctl enable dnsmasq > /dev/null 2>&1
# Enable avahi-daemon for mDNS/Bonjour discovery
sudo systemctl enable avahi-daemon > /dev/null 2>&1
echo_green "Services enabled"

# STEP 7 — Apply static IP right now (no reboot needed)
echo_yellow "Step 7: Applying network configuration..."
# Flush any existing IP addresses on wlan0
sudo ip addr flush dev wlan0 || true
# Assign static IP to wlan0 immediately
sudo ip addr add 192.168.4.1/24 dev wlan0 || true
# Restart hostapd to start the access point
sudo systemctl restart hostapd
# Restart dnsmasq to start DHCP/DNS services
sudo systemctl restart dnsmasq
echo_green "Network configuration applied"

# STEP 8 — Save generated config to file
echo_yellow "Step 8: Saving configuration..."
# Get ethernet IP if connected
ETH_IP=$(ip -4 addr show eth0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || echo "Not connected")
# Create configuration file with network details for reference
sudo tee /opt/pocketcloud-network.conf > /dev/null << EOF
SSID=${SSID}
PASSWORD=pocketcloud123
GATEWAY=192.168.4.1
ETHERNET_IP=${ETH_IP}
INTERNET_SHARING=enabled
GENERATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
echo_green "Configuration saved to /opt/pocketcloud-network.conf"

# STEP 9 — Print success box
echo ""
ETH_IP=$(ip -4 addr show eth0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || echo "Not connected")
echo "╔══════════════════════════════════════════════════╗"
echo "║  WiFi Hotspot Ready!                             ║"
echo "║                                                  ║"
echo "║  WiFi Network:  ${SSID}                  ║"
echo "║  WiFi Password: pocketcloud123                   ║"
echo "║  WiFi IP:       192.168.4.1                      ║"
echo "║  Ethernet IP:   ${ETH_IP}                        ║"
echo "║                                                  ║"
echo "║  Internet sharing: Enabled via ethernet          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo_green "Setup complete! Run ./01-verify-network.sh to verify."
echo ""
if [ "$ETH_IP" != "Not connected" ]; then
    echo_green "Ethernet connected! WiFi clients will have internet access."
    echo_yellow "You can also access PocketCloud via ethernet at: ${ETH_IP}"
else
    echo_yellow "Ethernet not connected. Connect ethernet cable for:"
    echo "  • Internet sharing to WiFi clients"
    echo "  • Faster file uploads via ethernet IP"
fi
echo ""
