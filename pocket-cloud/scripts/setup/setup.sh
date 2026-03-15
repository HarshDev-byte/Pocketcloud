#!/bin/bash
set -euo pipefail

# PocketCloud Drive - Master Setup Script
# Raspberry Pi 4B Production Deployment

POCKETCLOUD_VERSION="1.0.0"
INSTALL_DIR="/opt/pocketcloud"
STORAGE_DIR="/mnt/pocketcloud"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOTAL_STEPS=8

# Color output functions
print_step() { echo -e "\n\033[1;34m[${1}/${TOTAL_STEPS}]\033[0m $2"; }
print_ok()   { echo -e "\033[1;32m✓\033[0m $1"; }
print_err()  { echo -e "\033[1;31m✗\033[0m $1"; exit 1; }
print_warn() { echo -e "\033[1;33m⚠\033[0m $1"; }

# Dry run mode
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    print_warn "DRY RUN MODE - No changes will be made"
fi

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    print_err "This script should not be run as root. Run as pi user with sudo access."
fi

# Check sudo access
if ! sudo -n true 2>/dev/null; then
    print_err "This script requires sudo access. Please run: sudo visudo and add: pi ALL=(ALL) NOPASSWD:ALL"
fi

print_step 1 "Checking system requirements"
# Check Raspberry Pi 4B
if ! grep -q "Raspberry Pi 4" /proc/cpuinfo; then
    print_err "This script requires a Raspberry Pi 4B"
fi

# Check 64-bit OS
if [[ $(uname -m) != "aarch64" ]]; then
    print_err "This script requires a 64-bit ARM OS (aarch64)"
fi

# Check RAM (minimum 4GB)
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
if [[ $TOTAL_RAM -lt 3500 ]]; then
    print_err "This script requires at least 4GB RAM (found ${TOTAL_RAM}MB)"
fi

# Check internet connection
if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
    print_err "Internet connection required for initial setup"
fi

print_ok "System requirements met: Pi 4B, 64-bit OS, ${TOTAL_RAM}MB RAM"

print_step 2 "Updating system and installing dependencies"
if [[ $DRY_RUN == false ]]; then
    sudo apt update
    sudo apt upgrade -y
    sudo apt install -y \
        curl wget git unzip \
        hostapd dnsmasq avahi-daemon \
        sqlite3 ffmpeg imagemagick \
        ufw fail2ban \
        build-essential python3-dev \
        nginx
    print_ok "System updated and dependencies installed"
else
    print_ok "Would update system and install dependencies"
fi
print_step 3 "Setting up storage"
if [[ $DRY_RUN == false ]]; then
    "${SCRIPT_DIR}/setup-storage.sh"
    print_ok "Storage configured at ${STORAGE_DIR}"
else
    print_ok "Would setup storage at ${STORAGE_DIR}"
fi

print_step 4 "Configuring network"
if [[ $DRY_RUN == false ]]; then
    "${SCRIPT_DIR}/setup-network.sh"
    print_ok "Network configured (hotspot + mDNS)"
else
    print_ok "Would configure network (hotspot + mDNS)"
fi

print_step 5 "Installing Node.js 20 LTS"
if [[ $DRY_RUN == false ]]; then
    "${SCRIPT_DIR}/setup-node.sh"
    print_ok "Node.js 20 LTS installed"
else
    print_ok "Would install Node.js 20 LTS"
fi

print_step 6 "Installing PocketCloud application"
if [[ $DRY_RUN == false ]]; then
    "${SCRIPT_DIR}/setup-app.sh"
    print_ok "PocketCloud application installed"
else
    print_ok "Would install PocketCloud application"
fi
print_step 7 "Setting up systemd services"
if [[ $DRY_RUN == false ]]; then
    "${SCRIPT_DIR}/install-services-new.sh"
    print_ok "Systemd services configured and started"
else
    print_ok "Would setup systemd services"
fi

print_step 8 "Running health check"
if [[ $DRY_RUN == false ]]; then
    sleep 5  # Give services time to start
    "${SCRIPT_DIR}/health-check.sh"
    print_ok "Health check passed"
else
    print_ok "Would run health check"
fi

# Generate WiFi network name with last 4 chars of MAC
WIFI_SUFFIX=$(cat /sys/class/net/wlan0/address | tail -c 6 | tr -d ':' | tr '[:lower:]' '[:upper:]')

# Final success message
echo
echo "╔═══════════════════════════════════════════╗"
echo "║   PocketCloud Drive v${POCKETCLOUD_VERSION} is ready!     ║"
echo "║                                           ║"
echo "║   WiFi Network:  PocketCloud-${WIFI_SUFFIX}         ║"
echo "║   WiFi Password: pocketcloud123           ║"
echo "║   Web Interface: http://192.168.4.1       ║"
echo "║   Admin Panel:   http://192.168.4.1/admin ║"
echo "║   mDNS:          http://pocketcloud.local ║"
echo "║                                           ║"
echo "║   Connect to the WiFi above and visit     ║"
echo "║   http://192.168.4.1 to get started.      ║"
echo "╚═══════════════════════════════════════════╝"
echo