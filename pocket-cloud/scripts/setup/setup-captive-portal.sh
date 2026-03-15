#!/bin/bash

# Setup captive portal for zero-configuration device discovery
# This makes ALL domains resolve to 192.168.4.1 so devices auto-discover PocketCloud

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

log_info "Setting up captive portal for PocketCloud discovery..."

# Backup existing dnsmasq config
if [[ -f /etc/dnsmasq.conf ]]; then
    cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup.$(date +%Y%m%d_%H%M%S)
    log_info "Backed up existing dnsmasq configuration"
fi

# Create captive portal dnsmasq configuration
cat > /etc/dnsmasq.conf << 'EOF'
# PocketCloud Captive Portal Configuration
# This configuration makes ALL DNS queries resolve to 192.168.4.1
# enabling zero-configuration device discovery

# Interface configuration
interface=wlan0
bind-interfaces

# DHCP configuration
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
dhcp-option=3,192.168.4.1  # Default gateway
dhcp-option=6,192.168.4.1  # DNS server

# Captive portal DNS configuration
# Resolve ALL domains to our IP (192.168.4.1)
address=/#/192.168.4.1

# Specific overrides for common captive portal detection
address=/captive.apple.com/192.168.4.1
address=/hotspot.apple.com/192.168.4.1
address=/www.apple.com/192.168.4.1
address=/clients3.google.com/192.168.4.1
address=/connectivitycheck.gstatic.com/192.168.4.1
address=/www.msftconnecttest.com/192.168.4.1
address=/www.msftncsi.com/192.168.4.1
address=/detectportal.firefox.com/192.168.4.1
address=/nmcheck.gnome.org/192.168.4.1

# Local hostname resolution
address=/pocketcloud.local/192.168.4.1
address=/pocketcloud/192.168.4.1

# Cache settings
cache-size=1000
neg-ttl=60

# Logging (disable in production for performance)
# log-queries
# log-dhcp

# Don't read /etc/hosts
no-hosts

# Don't read /etc/resolv.conf
no-resolv

# Expand hosts file
expand-hosts
domain=pocketcloud.local

# Authoritative DNS server
auth-server=192.168.4.1,wlan0
auth-zone=pocketcloud.local,192.168.4.0/24
EOF

log_success "Created captive portal dnsmasq configuration"

# Create hostapd configuration for captive portal
cat > /etc/hostapd/hostapd.conf << 'EOF'
# PocketCloud WiFi Access Point Configuration
interface=wlan0
driver=nl80211
ssid=PocketCloud-$(cat /proc/cpuinfo | grep Serial | cut -d ' ' -f 2 | tail -c 5)
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

# Captive portal settings
# These settings help trigger captive portal detection
max_num_sta=20
beacon_int=100
dtim_period=2
EOF

log_success "Created hostapd configuration with captive portal settings"

# Enable IP forwarding for captive portal
echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

# Create iptables rules for captive portal
# Redirect all HTTP traffic to our server
iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 -j DNAT --to-destination 192.168.4.1:3000
iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 443 -j DNAT --to-destination 192.168.4.1:3000
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
iptables -A FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT

# Save iptables rules
iptables-save > /etc/iptables.ipv4.nat

# Create script to restore iptables on boot
cat > /etc/rc.local << 'EOF'
#!/bin/bash
# Restore iptables rules for captive portal
iptables-restore < /etc/iptables.ipv4.nat
exit 0
EOF

chmod +x /etc/rc.local

log_success "Configured iptables for captive portal redirection"

# Enable and start services
systemctl enable dnsmasq
systemctl enable hostapd

# Restart services
systemctl restart dnsmasq
systemctl restart hostapd

log_success "Captive portal services enabled and started"

# Create systemd service to ensure captive portal starts on boot
cat > /etc/systemd/system/pocketcloud-captive.service << 'EOF'
[Unit]
Description=PocketCloud Captive Portal
After=network.target
Wants=dnsmasq.service hostapd.service

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'iptables-restore < /etc/iptables.ipv4.nat'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl enable pocketcloud-captive.service
systemctl start pocketcloud-captive.service

log_success "Created and enabled PocketCloud captive portal service"

# Test configuration
log_info "Testing captive portal configuration..."

if systemctl is-active --quiet dnsmasq; then
    log_success "dnsmasq is running"
else
    log_error "dnsmasq failed to start"
    systemctl status dnsmasq
fi

if systemctl is-active --quiet hostapd; then
    log_success "hostapd is running"
else
    log_error "hostapd failed to start"
    systemctl status hostapd
fi

# Test DNS resolution
if nslookup google.com 192.168.4.1 | grep -q "192.168.4.1"; then
    log_success "DNS captive portal is working (all domains resolve to 192.168.4.1)"
else
    log_warning "DNS captive portal may not be working correctly"
fi

log_success "Captive portal setup complete!"
echo
echo "How it works:"
echo "1. When devices connect to PocketCloud WiFi, ALL domains resolve to 192.168.4.1"
echo "2. Captive portal detection triggers on iOS/Android/Windows/macOS"
echo "3. Users see 'Sign in to network' notification"
echo "4. Tapping the notification opens PocketCloud app automatically"
echo "5. Zero configuration required - works on ALL devices!"
echo
echo "Next steps:"
echo "1. Ensure PocketCloud backend handles captive portal routes"
echo "2. Test on various devices (iOS, Android, Windows, macOS)"
echo "3. Verify captive portal detection triggers correctly"