#!/bin/bash
set -euo pipefail

# Complete Raspberry Pi Setup for PocketCloud
# This script does everything: USB storage + PocketCloud installation

SCRIPT_VERSION="2.0.0"
LOG_FILE="/var/log/pocketcloud-complete-setup.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"; exit 1; }
info() { echo -e "${CYAN}ℹ${NC} $1" | tee -a "$LOG_FILE"; }

# Check root
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root. Use: sudo $0"
fi

# Initialize log
mkdir -p "$(dirname "$LOG_FILE")"
echo "$(date): Starting complete Raspberry Pi setup" > "$LOG_FILE"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🥧 Complete PocketCloud Setup for Raspberry Pi v$SCRIPT_VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "This script will completely set up PocketCloud on your Raspberry Pi:"
echo
echo "📦 PHASE 1: System Preparation"
echo "   • Update system packages"
echo "   • Install required dependencies"
echo "   • Check hardware compatibility"
echo
echo "💾 PHASE 2: USB Storage Setup"
echo "   • Detect and format USB drive"
echo "   • Set up automatic mounting"
echo "   • Create directory structure"
echo
echo "🚀 PHASE 3: PocketCloud Installation"
echo "   • Download and build PocketCloud"
echo "   • Set up WiFi hotspot"
echo "   • Configure web interface"
echo "   • Set up automatic startup"
echo
echo "⏱️  Total estimated time: 15-20 minutes"
echo
warn "⚠️  Make sure you have a USB drive connected (50GB+ recommended)"
echo

echo -n "Ready to begin complete setup? [Y/n] "
if [[ -t 0 ]]; then
    read -r response
else
    read -r response < /dev/tty
fi

if [[ "$response" =~ ^[Nn]$ ]]; then
    echo "Setup cancelled"
    exit 0
fi

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 PHASE 1: System Preparation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

log "Checking hardware compatibility..."
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    error "This script only works on Raspberry Pi hardware"
fi

# Check Pi model
PI_MODEL=$(grep "Model" /proc/cpuinfo | cut -d: -f2 | xargs)
log "Detected: $PI_MODEL"

# Check RAM
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [[ "$RAM_MB" -lt 1800 ]]; then
    error "Minimum 2GB RAM required (detected: ${RAM_MB}MB)"
fi

success "Hardware compatible: $PI_MODEL (${RAM_MB}MB RAM)"

log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
success "System updated"

log "Installing essential dependencies..."
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
    python3-pip \
    parted \
    e2fsprogs \
    util-linux
success "Dependencies installed"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💾 PHASE 2: USB Storage Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

info "Running USB storage setup..."
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/setup-usb-storage.sh | bash

if ! mountpoint -q "/mnt/pocketcloud"; then
    error "USB storage setup failed. Please run manually and try again."
fi

success "USB storage configured"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 PHASE 3: PocketCloud Installation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

info "Running PocketCloud installation..."
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/install-pocketcloud.sh | bash

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Complete Setup Finished!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

success "All phases completed successfully!"

echo
echo "Your Raspberry Pi is now ready with PocketCloud!"
echo "The system will reboot automatically to complete the setup."