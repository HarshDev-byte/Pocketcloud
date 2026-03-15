#!/bin/bash

# Setup mDNS/Bonjour service discovery for PocketCloud
# This enables pocketcloud.local hostname resolution on macOS, Linux, Windows 10+

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

log_info "Setting up mDNS/Bonjour service discovery for PocketCloud..."

# Install avahi-daemon if not present
if ! command -v avahi-daemon >/dev/null 2>&1; then
    log_info "Installing avahi-daemon..."
    apt-get update
    apt-get install -y avahi-daemon avahi-utils
    log_success "Installed avahi-daemon"
else
    log_info "avahi-daemon is already installed"
fi

# Create avahi services directory if it doesn't exist
mkdir -p /etc/avahi/services

# Create PocketCloud service definition
cat > /etc/avahi/services/pocketcloud.service << 'EOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">PocketCloud Drive on %h</name>
  
  <!-- Main PocketCloud service -->
  <service>
    <type>_pocketcloud._tcp</type>
    <port>3000</port>
    <txt-record>version=1.0.0</txt-record>
    <txt-record>path=/</txt-record>
    <txt-record>features=files,sharing,streaming,admin</txt-record>
    <txt-record>auth=required</txt-record>
    <txt-record>ssl=false</txt-record>
  </service>
  
  <!-- HTTP service for web interface -->
  <service>
    <type>_http._tcp</type>
    <port>3000</port>
    <txt-record>path=/</txt-record>
    <txt-record>description=PocketCloud Drive Web Interface</txt-record>
  </service>
  
  <!-- WebDAV service for file access -->
  <service>
    <type>_webdav._tcp</type>
    <port>3000</port>
    <txt-record>path=/webdav</txt-record>
    <txt-record>description=PocketCloud WebDAV Access</txt-record>
  </service>
  
</service-group>
EOF

log_success "Created PocketCloud mDNS service definition"

# Configure avahi-daemon
cat > /etc/avahi/avahi-daemon.conf << 'EOF'
# PocketCloud Avahi Configuration
[server]
host-name=pocketcloud
domain-name=local
browse-domains=local
use-ipv4=yes
use-ipv6=no
allow-interfaces=wlan0,eth0
deny-interfaces=lo
check-response-ttl=no
use-iff-running=no
enable-dbus=yes
disallow-other-stacks=no
allow-point-to-point=no
cache-entries-max=4096
clients-max=4096
objects-per-client-max=1024
entries-per-entry-group-max=32
ratelimit-interval-usec=1000000
ratelimit-burst=1000

[wide-area]
enable-wide-area=yes

[publish]
disable-publishing=no
disable-user-service-publishing=no
add-service-cookie=no
publish-addresses=yes
publish-hinfo=yes
publish-workstation=yes
publish-domain=yes
publish-dns-servers=no
publish-resolv-conf-dns-servers=no
publish-aaaa-on-ipv4=yes
publish-a-on-ipv6=no

[reflector]
enable-reflector=no
reflect-ipv=no

[rlimits]
rlimit-as=
rlimit-core=0
rlimit-data=8388608
rlimit-fsize=0
rlimit-nofile=768
rlimit-stack=8388608
rlimit-nproc=3
EOF

log_success "Configured avahi-daemon for PocketCloud"

# Set hostname to pocketcloud
echo "pocketcloud" > /etc/hostname
hostnamectl set-hostname pocketcloud

# Update /etc/hosts
if ! grep -q "pocketcloud" /etc/hosts; then
    echo "127.0.1.1    pocketcloud.local pocketcloud" >> /etc/hosts
    echo "192.168.4.1  pocketcloud.local pocketcloud" >> /etc/hosts
fi

log_success "Set hostname to pocketcloud"

# Enable and start avahi-daemon
systemctl enable avahi-daemon
systemctl restart avahi-daemon

log_success "Started avahi-daemon service"

# Wait a moment for service to start
sleep 2

# Test mDNS resolution
log_info "Testing mDNS service discovery..."

if systemctl is-active --quiet avahi-daemon; then
    log_success "avahi-daemon is running"
else
    log_error "avahi-daemon failed to start"
    systemctl status avahi-daemon
    exit 1
fi

# Test service publication
if avahi-browse -t _pocketcloud._tcp | grep -q "pocketcloud"; then
    log_success "PocketCloud mDNS service is being advertised"
else
    log_warning "PocketCloud mDNS service may not be advertising correctly"
fi

# Test hostname resolution
if avahi-resolve -n pocketcloud.local | grep -q "192.168.4.1"; then
    log_success "pocketcloud.local resolves to 192.168.4.1"
else
    log_warning "pocketcloud.local hostname resolution may not be working"
fi

# Create mDNS test script
cat > /usr/local/bin/test-mdns.sh << 'EOF'
#!/bin/bash
echo "Testing PocketCloud mDNS Discovery..."
echo "======================================"
echo

echo "1. Testing hostname resolution:"
avahi-resolve -n pocketcloud.local || echo "  ❌ Hostname resolution failed"
echo

echo "2. Testing service discovery:"
avahi-browse -t _pocketcloud._tcp | head -5
echo

echo "3. Testing HTTP service:"
avahi-browse -t _http._tcp | grep pocketcloud || echo "  ❌ HTTP service not found"
echo

echo "4. Testing from other devices:"
echo "  macOS:    dns-sd -B _pocketcloud._tcp"
echo "  Linux:    avahi-browse _pocketcloud._tcp"
echo "  Windows:  Use Bonjour Browser or nslookup pocketcloud.local"
echo
EOF

chmod +x /usr/local/bin/test-mdns.sh

log_success "Created mDNS test script at /usr/local/bin/test-mdns.sh"

log_success "mDNS/Bonjour setup complete!"
echo
echo "How it works:"
echo "1. PocketCloud advertises itself as 'pocketcloud.local' on the network"
echo "2. Devices with mDNS support can discover it automatically"
echo "3. Users can access http://pocketcloud.local instead of IP addresses"
echo "4. Works on macOS, Linux, Windows 10+, and many mobile apps"
echo
echo "Test commands:"
echo "  Local:  /usr/local/bin/test-mdns.sh"
echo "  Remote: ping pocketcloud.local"
echo "  Browse: avahi-browse _pocketcloud._tcp"
echo
echo "Client discovery examples:"
echo "  macOS:    dns-sd -B _pocketcloud._tcp"
echo "  Linux:    avahi-browse _pocketcloud._tcp"
echo "  Windows:  nslookup pocketcloud.local"