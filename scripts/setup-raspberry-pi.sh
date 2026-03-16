#!/bin/bash
set -euo pipefail

# PocketCloud Raspberry Pi 4B Complete Setup Script
# One-command setup for Pi 4B with 1TB USB storage

SCRIPT_VERSION="1.0.0"
POCKETCLOUD_REPO="https://github.com/HarshDev-byte/Pocketcloud.git"
INSTALL_DIR="/opt/pocketcloud"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root. Use: sudo $0"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🥧 PocketCloud Raspberry Pi 4B Complete Setup v$SCRIPT_VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "This will set up your Raspberry Pi 4B as a complete PocketCloud server:"
echo "• System optimization and updates"
echo "• USB storage detection and setup"
echo "• PocketCloud installation and configuration"
echo "• WiFi hotspot and networking"
echo "• Performance optimization"
echo
echo -n "Continue? [y/N] "
read -r response
[[ "$response" =~ ^[Yy]$ ]] || exit 0

# Step 1: System preparation
log "Step 1: Preparing system..."
apt update && apt upgrade -y
success "System updated"

# Step 2: Clone PocketCloud
log "Step 2: Downloading PocketCloud..."
if [[ ! -d "$INSTALL_DIR" ]]; then
    git clone "$POCKETCLOUD_REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
success "PocketCloud downloaded"

# Step 3: Setup USB storage
log "Step 3: Setting up USB storage..."
bash scripts/setup-usb-storage.sh
success "USB storage configured"

# Step 4: Install PocketCloud
log "Step 4: Installing PocketCloud..."
bash scripts/install.sh
success "PocketCloud installed"

echo
echo "🎉 Setup complete! Your Raspberry Pi is now a PocketCloud server!"
echo "Connect to WiFi: PocketCloud-XXXX and visit http://192.168.4.1"