#!/bin/bash
set -euo pipefail

# PocketCloud USB Storage Setup Script
# Simple, focused USB drive setup for PocketCloud

SCRIPT_VERSION="2.0.0"
MOUNT_POINT="/mnt/pocketcloud"
LOG_FILE="/var/log/pocketcloud-usb-setup.log"

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
echo "$(date): Starting USB storage setup" > "$LOG_FILE"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🥧 PocketCloud USB Storage Setup v$SCRIPT_VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "This will set up your USB drive for PocketCloud:"
echo "• Detect USB storage devices"
echo "• Format with optimal ext4 settings"
echo "• Create mount point at $MOUNT_POINT"
echo "• Set up automatic mounting"
echo "• Create directory structure"
echo
warn "⚠️  This will DESTROY ALL DATA on the selected drive!"
echo

# Handle input for piped execution
echo -n "Continue? [y/N] "
if [[ -t 0 ]]; then
    read -r response
else
    read -r response < /dev/tty
fi

if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Setup cancelled"
    exit 0
fi

log "Installing required tools..."
apt-get update -qq
apt-get install -y -qq parted e2fsprogs util-linux
success "Tools installed"

log "Detecting USB drives..."
mapfile -t usb_devices < <(lsblk -d -o NAME,SIZE,TRAN | grep -E "usb" | awk '{print "/dev/" $1 " (" $2 ")"}' || true)

if [[ ${#usb_devices[@]} -eq 0 ]]; then
    error "No USB drives detected. Connect a USB drive and try again."
fi

echo
echo "Available USB drives:"
for i in "${!usb_devices[@]}"; do
    echo "  $((i+1)). ${usb_devices[i]}"
done
echo

echo -n "Select drive [1-${#usb_devices[@]}]: "
if [[ -t 0 ]]; then
    read -r selection
else
    read -r selection < /dev/tty
fi

if [[ ! "$selection" =~ ^[0-9]+$ ]] || [[ "$selection" -lt 1 ]] || [[ "$selection" -gt ${#usb_devices[@]} ]]; then
    error "Invalid selection"
fi

SELECTED_DEVICE=$(echo "${usb_devices[$((selection-1))]}" | awk '{print $1}')
success "Selected: $SELECTED_DEVICE"

# Check device size
device_size_gb=$(lsblk -b -d -o SIZE -n "$SELECTED_DEVICE" | awk '{print int($1/1024/1024/1024)}')
if [[ $device_size_gb -lt 50 ]]; then
    error "Drive too small: ${device_size_gb}GB (minimum 50GB required)"
fi

log "Unmounting any existing partitions..."
umount "${SELECTED_DEVICE}"* 2>/dev/null || true

log "Creating partition table..."
parted -s "$SELECTED_DEVICE" mklabel gpt
parted -s "$SELECTED_DEVICE" mkpart primary ext4 0% 100%
sleep 2
partprobe "$SELECTED_DEVICE"
sleep 2

# Find partition
PARTITION="${SELECTED_DEVICE}1"
if [[ ! -b "$PARTITION" ]]; then
    PARTITION="${SELECTED_DEVICE}p1"
fi

if [[ ! -b "$PARTITION" ]]; then
    error "Could not find partition after creation"
fi

log "Formatting with ext4..."
mkfs.ext4 -F -L "PocketCloud" "$PARTITION"
success "Partition formatted: $PARTITION"

log "Setting up mount point..."
mkdir -p "$MOUNT_POINT"

# Get UUID and create fstab entry
UUID=$(blkid -s UUID -o value "$PARTITION")
if [[ -z "$UUID" ]]; then
    error "Could not get partition UUID"
fi

# Remove existing fstab entries for this mount point
sed -i "\|$MOUNT_POINT|d" /etc/fstab

# Add new fstab entry
echo "UUID=$UUID $MOUNT_POINT ext4 defaults,noatime 0 2" >> /etc/fstab

# Mount the drive
mount "$MOUNT_POINT"

if ! mountpoint -q "$MOUNT_POINT"; then
    error "Failed to mount drive"
fi

log "Creating directory structure..."
mkdir -p "$MOUNT_POINT"/{uploads,media,backups,temp,trash}
mkdir -p "$MOUNT_POINT/media"/{photos,videos,music,documents}

# Set permissions
chown -R pi:pi "$MOUNT_POINT" 2>/dev/null || chown -R 1000:1000 "$MOUNT_POINT"
chmod -R 755 "$MOUNT_POINT"

# Test write access
if ! touch "$MOUNT_POINT/.test" 2>/dev/null; then
    error "Cannot write to mounted drive"
fi
rm -f "$MOUNT_POINT/.test"

success "USB storage setup complete!"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 USB Storage Ready!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "Device: $SELECTED_DEVICE"
echo "Partition: $PARTITION"
echo "Mount Point: $MOUNT_POINT"
echo "Size: ${device_size_gb}GB"
echo "UUID: $UUID"
echo
echo "The drive will automatically mount on boot."
echo "Ready for PocketCloud installation!"
echo