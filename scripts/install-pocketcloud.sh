#!/bin/bash
set -euo pipefail

# PocketCloud Installation Script
# Installs PocketCloud on Raspberry Pi with USB storage

SCRIPT_VERSION="2.0.0"
REPO_URL="https://github.com/HarshDev-byte/Pocketcloud.git"
INSTALL_DIR="/opt/pocketcloud"
MOUNT_POINT="/mnt/pocketcloud"
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

# Check root
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root. Use: sudo $0"
fi

# Initialize log
mkdir -p "$(dirname "$LOG_FILE")"
echo "$(date): Starting PocketCloud installation" > "$LOG_FILE"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🥧 PocketCloud Installation v$SCRIPT_VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "This will install PocketCloud on your Raspberry Pi:"
echo "• Download and build PocketCloud"
echo "• Set up WiFi hotspot (PocketCloud-XXXX)"
echo "• Configure web interface at http://192.168.4.1"
echo "• Set up file storage and streaming"
echo "• Configure automatic startup"
echo

# Check if USB storage is set up
if ! mountpoint -q "$MOUNT_POINT"; then
    warn "USB storage not found at $MOUNT_POINT"
    echo "Please run the USB storage setup first:"
    echo "curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/setup-usb-storage.sh | sudo bash"
    echo
    echo -n "Continue anyway? [y/N] "
    if [[ -t 0 ]]; then
        read -r response
    else
        read -r response < /dev/tty
    fi
    
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Installation cancelled"
        exit 0
    fi
fi

echo -n "Proceed with installation? [Y/n] "
if [[ -t 0 ]]; then
    read -r response
else
    read -r response < /dev/tty
fi

if [[ "$response" =~ ^[Nn]$ ]]; then
    echo "Installation cancelled"
    exit 0
fi

log "Updating system packages..."
apt-get update -qq
success "System updated"

log "Installing dependencies..."
apt-get install -y -qq \
    curl \
    git \
    build-essential \
    nodejs \
    npm \
    hostapd \
    dnsmasq \
    nginx \
    sqlite3 \
    python3 \
    python3-pip
success "Dependencies installed"

log "Downloading PocketCloud..."
if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
fi
git clone "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"
success "PocketCloud downloaded"

log "Installing backend packages..."
if [[ -d "pocket-cloud/backend" ]]; then
    cd "$INSTALL_DIR/pocket-cloud/backend"
    npm install --production
    success "Backend packages installed"
else
    warn "Backend directory not found, skipping npm install"
fi

log "Installing frontend packages..."
if [[ -d "pocket-cloud/frontend" ]]; then
    cd "$INSTALL_DIR/pocket-cloud/frontend"
    npm install
    npm run build
    success "Frontend built"
else
    warn "Frontend directory not found, skipping build"
fi

log "Creating PocketCloud user..."
if ! id "pocketcloud" &>/dev/null; then
    useradd -r -s /bin/false -d "$INSTALL_DIR" pocketcloud
fi
chown -R pocketcloud:pocketcloud "$INSTALL_DIR"
success "User created"

log "Setting up systemd service..."
cat > /etc/systemd/system/pocketcloud.service << EOF
[Unit]
Description=PocketCloud Server
After=network.target

[Service]
Type=simple
User=pocketcloud
WorkingDirectory=$INSTALL_DIR/pocket-cloud/backend
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=STORAGE_PATH=$MOUNT_POINT

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pocketcloud
success "Service configured"

log "Setting up WiFi hotspot..."

# Generate unique SSID
MAC_SUFFIX=$(cat /sys/class/net/wlan0/address 2>/dev/null | tail -c 5 | tr -d ':' | tr '[:lower:]' '[:upper:]' || echo "0000")
SSID="PocketCloud-$MAC_SUFFIX"

# Configure hostapd
cat > /etc/hostapd/hostapd.conf << EOF
interface=wlan0
driver=nl80211
ssid=$SSID
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

# Configure dnsmasq
cat > /etc/dnsmasq.conf << EOF
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
address=/#/192.168.4.1
EOF

# Configure network interface
cat > /etc/systemd/network/08-wlan0.network << EOF
[Match]
Name=wlan0

[Network]
Address=192.168.4.1/24
IPMasquerade=yes
EOF

# Enable IP forwarding
echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

# Configure iptables for NAT
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
iptables -A FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT

# Save iptables rules
iptables-save > /etc/iptables.ipv4.nat

# Load iptables on boot
cat > /etc/systemd/system/iptables-restore.service << EOF
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

systemctl enable iptables-restore
systemctl enable hostapd
systemctl enable dnsmasq
success "WiFi hotspot configured: $SSID"

log "Setting up nginx reverse proxy..."
cat > /etc/nginx/sites-available/pocketcloud << EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    server_name _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/pocketcloud /etc/nginx/sites-enabled/
systemctl enable nginx
success "Nginx configured"

log "Creating startup script..."
cat > /usr/local/bin/pocketcloud-startup << 'EOF'
#!/bin/bash
# PocketCloud startup script

# Wait for network
sleep 10

# Configure wlan0 interface
ip addr add 192.168.4.1/24 dev wlan0 2>/dev/null || true
ip link set wlan0 up

# Start services
systemctl start hostapd
systemctl start dnsmasq
systemctl start nginx
systemctl start pocketcloud

echo "PocketCloud started - Connect to WiFi and visit http://192.168.4.1"
EOF

chmod +x /usr/local/bin/pocketcloud-startup

# Create systemd service for startup
cat > /etc/systemd/system/pocketcloud-startup.service << EOF
[Unit]
Description=PocketCloud Startup
After=network.target
Wants=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/pocketcloud-startup
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl enable pocketcloud-startup
success "Startup script configured"

# Final health check
log "Running health check..."
if [[ -f "$INSTALL_DIR/pocket-cloud/backend/package.json" ]]; then
    success "Backend files present"
else
    warn "Backend files missing"
fi

if mountpoint -q "$MOUNT_POINT"; then
    success "USB storage mounted"
else
    warn "USB storage not mounted"
fi

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 PocketCloud Installation Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Connection Information                    ║"
echo "║                                                              ║"
echo "║  WiFi Network: $SSID                           ║"
echo "║  Password:     pocketcloud123                                ║"
echo "║  Web Interface: http://192.168.4.1                          ║"
echo "║  Storage:      $MOUNT_POINT                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo
echo "Next Steps:"
echo "1. Reboot your Pi: sudo reboot"
echo "2. Connect to WiFi: $SSID"
echo "3. Open browser: http://192.168.4.1"
echo "4. Complete setup wizard"
echo
echo "The system will reboot in 10 seconds..."
sleep 10
reboot