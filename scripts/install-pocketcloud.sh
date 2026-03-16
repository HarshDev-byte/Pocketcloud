#!/bin/bash
set -euo pipefail

SCRIPT_VERSION="2.1.0"
REPO_URL="https://github.com/HarshDev-byte/Pocketcloud.git"
INSTALL_DIR="/opt/pocketcloud"
MOUNT_POINT="/mnt/pocketcloud"
LOG_FILE="/var/log/pocketcloud-install.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"; exit 1; }

# Root check
[[ $EUID -ne 0 ]] && error "Run with: sudo $0"

mkdir -p "$(dirname "$LOG_FILE")"
echo "$(date): Starting PocketCloud install" > "$LOG_FILE"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🥧 PocketCloud Installation v$SCRIPT_VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# USB check
if ! mountpoint -q "$MOUNT_POINT"; then
    warn "USB storage not mounted at $MOUNT_POINT"
    read -p "Continue anyway? [y/N] " response
    [[ ! "$response" =~ ^[Yy]$ ]] && exit 0
fi

read -p "Proceed with installation? [Y/n] " response
response=${response:-Y}
[[ "$response" =~ ^[Nn]$ ]] && exit 0

log "Updating packages..."
apt-get update -y

log "Installing dependencies..."
apt-get install -y \
curl git build-essential \
hostapd dnsmasq nginx \
sqlite3 python3 python3-pip

success "Dependencies installed"

log "Installing Node.js LTS..."

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

success "Node installed $(node -v)"

log "Cloning PocketCloud..."

rm -rf "$INSTALL_DIR"
git clone "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"

success "Repository downloaded"

# Backend install
if [[ -d "$INSTALL_DIR/pocket-cloud/backend" ]]; then
    log "Installing backend..."
    cd "$INSTALL_DIR/pocket-cloud/backend"
    npm install --production
    success "Backend installed"
else
    warn "Backend directory missing"
fi

# Frontend build
if [[ -d "$INSTALL_DIR/pocket-cloud/frontend" ]]; then
    log "Building frontend..."
    cd "$INSTALL_DIR/pocket-cloud/frontend"
    npm install
    npm run build
    success "Frontend built"
else
    warn "Frontend directory missing"
fi

# Create service user
log "Creating pocketcloud user..."

if ! id "pocketcloud" &>/dev/null; then
    useradd -r -s /usr/sbin/nologin -d "$INSTALL_DIR" pocketcloud
fi

chown -R pocketcloud:pocketcloud "$INSTALL_DIR"

success "User configured"

# Backend service
log "Creating systemd service..."

cat > /etc/systemd/system/pocketcloud.service <<EOF
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

success "Service installed"

# WiFi hotspot
log "Configuring WiFi hotspot..."

if [[ ! -d /etc/hostapd ]]; then
mkdir -p /etc/hostapd
fi

MAC_SUFFIX=$(cat /sys/class/net/wlan0/address 2>/dev/null | tail -c 5 | tr -d ':' | tr '[:lower:]' '[:upper:]' || echo "0000")
SSID="PocketCloud-$MAC_SUFFIX"

cat > /etc/hostapd/hostapd.conf <<EOF
interface=wlan0
driver=nl80211
ssid=$SSID
hw_mode=g
channel=7
wpa=2
wpa_passphrase=pocketcloud123
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
EOF

sed -i 's|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd

cat > /etc/dnsmasq.conf <<EOF
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.50,255.255.255.0,24h
address=/#/192.168.4.1
EOF

# Enable IP forwarding safely
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

sysctl -p

# NAT
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
iptables-save > /etc/iptables.ipv4.nat

cat > /etc/systemd/system/iptables-restore.service <<EOF
[Unit]
Description=Restore iptables
After=network.target

[Service]
Type=oneshot
ExecStart=/sbin/iptables-restore /etc/iptables.ipv4.nat

[Install]
WantedBy=multi-user.target
EOF

systemctl enable iptables-restore
systemctl enable hostapd
systemctl enable dnsmasq

success "Hotspot configured: $SSID"

# nginx
log "Configuring nginx..."

cat > /etc/nginx/sites-available/pocketcloud <<EOF
server {
listen 80 default_server;
server_name _;

location / {
proxy_pass http://localhost:3000;
proxy_set_header Host \$host;
proxy_set_header X-Real-IP \$remote_addr;
proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
}
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/pocketcloud /etc/nginx/sites-enabled/

systemctl enable nginx
systemctl restart nginx

success "Nginx configured"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 PocketCloud Installed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo
echo "WiFi Network : $SSID"
echo "Password     : pocketcloud123"
echo "Open browser : http://192.168.4.1"
echo "Storage Path : $MOUNT_POINT"
echo

echo "Rebooting in 10 seconds..."
sleep 10
reboot