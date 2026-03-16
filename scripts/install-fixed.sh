#!/bin/bash
set -euo pipefail

# PocketCloud Drive Installer - Fixed Version
# Works with current project structure

SCRIPT_VERSION="1.0.1"
POCKETCLOUD_REPO="https://github.com/HarshDev-byte/Pocketcloud.git"
INSTALL_DIR="/opt/pocketcloud"
LOG_FILE="/var/log/pocketcloud-install.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"; exit 1; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root. Use: sudo $0"
fi

# Initialize log
mkdir -p "$(dirname "$LOG_FILE")"
echo "$(date): Starting PocketCloud installation" > "$LOG_FILE"

log "Checking hardware compatibility..."
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    error "This installer only works on Raspberry Pi hardware"
fi
success "Hardware compatible"

log "Checking system requirements..."
ram_mb=$(free -m | awk '/^Mem:/{print $2}')
if [[ "$ram_mb" -lt 1800 ]]; then
    error "Minimum 2GB RAM required (detected: ${ram_mb}MB)"
fi
success "System requirements met (RAM: ${ram_mb}MB)"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🥧 PocketCloud Drive Installer v$SCRIPT_VERSION (Fixed)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "This will install PocketCloud Drive on your Raspberry Pi:"
echo "• WiFi hotspot (PocketCloud-XXXX)"
echo "• Web interface at http://192.168.4.1"
echo "• File storage and streaming server"
echo
echo -n "Proceed with installation? [Y/n] "
read -r response

if [[ "$response" =~ ^[Nn]$ ]]; then
    echo "Installation cancelled"
    exit 0
fi

log "Installing dependencies..."
apt-get update -qq
apt-get install -y -qq curl git build-essential nodejs npm hostapd dnsmasq nginx sqlite3
success "Dependencies installed"

log "Downloading PocketCloud..."
if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
fi
git clone "$POCKETCLOUD_REPO" "$INSTALL_DIR"
cd "$INSTALL_DIR"
success "PocketCloud downloaded"

log "Setting up USB storage..."
if [[ -f "scripts/setup-usb-storage.sh" ]]; then
    bash scripts/setup-usb-storage.sh
else
    warn "USB storage setup script not found, please run manually"
fi

log "Installing Node.js packages..."
if [[ -d "pocket-cloud/backend" ]]; then
    cd "$INSTALL_DIR/pocket-cloud/backend"
    npm install
    success "Backend packages installed"
fi

if [[ -d "pocket-cloud/frontend" ]]; then
    cd "$INSTALL_DIR/pocket-cloud/frontend"
    npm install
    npm run build
    success "Frontend built"
fi

log "Creating basic systemd services..."
cat > /etc/systemd/system/pocketcloud-backend.service << EOF
[Unit]
Description=PocketCloud Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/pocket-cloud/backend
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pocketcloud-backend
success "Services configured"

log "Setting up WiFi hotspot..."
# Basic hostapd configuration
cat > /etc/hostapd/hostapd.conf << EOF
interface=wlan0
driver=nl80211
ssid=PocketCloud-$(cat /sys/class/net/wlan0/address | tail -c 5 | tr -d ':' | tr '[:lower:]' '[:upper:]')
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

# Basic dnsmasq configuration
cat > /etc/dnsmasq.conf << EOF
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
EOF

systemctl enable hostapd dnsmasq
success "WiFi hotspot configured"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 PocketCloud Installation Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "Next steps:"
echo "1. Reboot your Pi: sudo reboot"
echo "2. Connect to WiFi: PocketCloud-XXXX"
echo "3. Password: pocketcloud123"
echo "4. Open: http://192.168.4.1"
echo
echo "Note: This is a basic installation. Some features may need manual configuration."
echo "Check the logs: tail -f $LOG_FILE"
echo
echo "Rebooting in 10 seconds..."
sleep 10
reboot