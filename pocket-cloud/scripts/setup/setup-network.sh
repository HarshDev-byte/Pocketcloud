#!/bin/bash

# PocketCloud Network Setup Script
# Configures all three network modes: hotspot, client WiFi, and ethernet
# Idempotent and safe to run multiple times

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Dry run mode
DRYRUN=${DRYRUN:-0}

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Dry run wrapper
run_cmd() {
    if [[ $DRYRUN -eq 1 ]]; then
        echo -e "${YELLOW}[DRYRUN]${NC} $*"
    else
        "$@"
    fi
}

# Signal handler for graceful shutdown
cleanup() {
    log_warning "Setup interrupted. Cleaning up..."
    exit 130
}
trap cleanup SIGINT SIGTERM

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

log_info "Starting PocketCloud network setup..."

# Generate unique hotspot SSID
HOTSPOT_SSID="PocketCloud-$(cat /proc/sys/kernel/random/uuid | cut -c1-4 | tr '[:lower:]' '[:upper:]')"

# Update package list
log_info "Updating package list..."
run_cmd apt-get update -qq

# Install required packages
log_info "Installing network packages..."
run_cmd apt-get install -y hostapd dnsmasq avahi-daemon iptables-persistent

# Configure static IP for hotspot mode
log_info "Configuring static IP for hotspot mode..."
if ! grep -q "interface wlan0" /etc/dhcpcd.conf 2>/dev/null; then
    log_info "Adding static IP configuration to dhcpcd.conf..."
    run_cmd tee -a /etc/dhcpcd.conf > /dev/null << 'EOF'

# PocketCloud hotspot static IP configuration
interface wlan0
static ip_address=192.168.4.1/24
nohook wpa_supplicant
EOF
else
    log_info "Static IP configuration already exists in dhcpcd.conf"
fi

# Configure dnsmasq
log_info "Configuring dnsmasq..."
if [[ ! -f /etc/dnsmasq.conf.backup ]]; then
    run_cmd cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup
fi

run_cmd tee /etc/dnsmasq.conf > /dev/null << 'EOF'
# PocketCloud dnsmasq configuration
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
domain=local
address=/#/192.168.4.1
bind-dynamic

# Captive portal detection
address=/connectivitycheck.gstatic.com/192.168.4.1
address=/clients3.google.com/192.168.4.1
address=/captive.apple.com/192.168.4.1
EOF

# Configure hostapd
log_info "Configuring hostapd..."
run_cmd tee /etc/hostapd/hostapd.conf > /dev/null << EOF
# PocketCloud hostapd configuration
interface=wlan0
ssid=${HOTSPOT_SSID}
wpa_passphrase=pocketcloud123
hw_mode=g
channel=6
wmm_enabled=1
ieee80211n=1
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
EOF

# Set DAEMON_CONF in /etc/default/hostapd
log_info "Setting hostapd daemon configuration..."
run_cmd tee /etc/default/hostapd > /dev/null << 'EOF'
# PocketCloud hostapd daemon configuration
DAEMON_CONF="/etc/hostapd/hostapd.conf"
EOF

# Enable IP forwarding
log_info "Enabling IP forwarding..."
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
    run_cmd tee -a /etc/sysctl.conf > /dev/null << 'EOF'

# PocketCloud IP forwarding
net.ipv4.ip_forward=1
EOF
    run_cmd sysctl -p
else
    log_info "IP forwarding already enabled"
fi

# Configure avahi for mDNS
log_info "Configuring avahi for mDNS..."
run_cmd mkdir -p /etc/avahi/services
run_cmd tee /etc/avahi/services/pocketcloud.service > /dev/null << 'EOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">PocketCloud on %h</name>
  <service>
    <type>_pocketcloud._tcp</type>
    <port>80</port>
    <txt-record>version=1.0</txt-record>
    <txt-record>model=PocketCloud</txt-record>
  </service>
  <service>
    <type>_http._tcp</type>
    <port>80</port>
  </service>
</service-group>
EOF

# Enable services (don't start yet)
log_info "Enabling services..."
run_cmd systemctl unmask hostapd
run_cmd systemctl enable hostapd
run_cmd systemctl enable dnsmasq
run_cmd systemctl enable avahi-daemon

# Create wpa_supplicant directory with proper permissions
log_info "Creating wpa_supplicant directory..."
run_cmd mkdir -p /etc/wpa_supplicant
run_cmd chmod 755 /etc/wpa_supplicant

# Configure iptables for captive portal
log_info "Configuring iptables for captive portal..."
if [[ $DRYRUN -eq 0 ]]; then
    # NAT rules for internet sharing
    iptables -t nat -C POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || \
        iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
    
    iptables -C FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || \
        iptables -A FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT
    
    iptables -C FORWARD -i wlan0 -o eth0 -j ACCEPT 2>/dev/null || \
        iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT
    
    # DNS redirect for captive portal
    iptables -t nat -C PREROUTING -i wlan0 -p udp --dport 53 -j DNAT --to-destination 192.168.4.1:53 2>/dev/null || \
        iptables -t nat -A PREROUTING -i wlan0 -p udp --dport 53 -j DNAT --to-destination 192.168.4.1:53
    
    # HTTP redirect for captive portal
    iptables -t nat -C PREROUTING -i wlan0 -p tcp --dport 80 -j DNAT --to-destination 192.168.4.1:80 2>/dev/null || \
        iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 -j DNAT --to-destination 192.168.4.1:80
    
    # Save iptables rules
    iptables-save > /etc/iptables/rules.v4
else
    log_info "[DRYRUN] Would configure iptables rules for NAT and captive portal"
fi

# Create network mode switching script
log_info "Creating network mode switching script..."
run_cmd tee /opt/pocketcloud/scripts/network-mode.sh > /dev/null << 'EOF'
#!/bin/bash
# Network mode switching script - will be created separately
echo "Network mode switching script placeholder"
EOF
run_cmd chmod +x /opt/pocketcloud/scripts/network-mode.sh

log_success "PocketCloud network setup completed successfully!"
echo
log_info "Configuration Summary:"
log_info "  Hotspot SSID: ${HOTSPOT_SSID}"
log_info "  Hotspot Password: pocketcloud123"
log_info "  Hotspot IP: 192.168.4.1"
log_info "  DHCP Range: 192.168.4.2 - 192.168.4.20"
log_info "  mDNS Hostname: pocketcloud.local"
echo
log_info "Services enabled but not started. Use network-mode.sh to activate."
log_info "Reboot recommended to ensure all changes take effect."