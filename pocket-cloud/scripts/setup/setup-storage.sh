#!/bin/bash
set -euo pipefail

# PocketCloud Storage Setup Script
# Detects and mounts USB drive for PocketCloud storage

STORAGE_DIR="/mnt/pocketcloud"

print_ok()   { echo -e "\033[1;32m✓\033[0m $1"; }
print_err()  { echo -e "\033[1;31m✗\033[0m $1"; exit 1; }
print_warn() { echo -e "\033[1;33m⚠\033[0m $1"; }

echo "Setting up PocketCloud storage..."

# Find external USB drives (exclude SD card)
DRIVES=$(lsblk -ndo NAME,SIZE,TYPE | grep -v mmcblk | grep disk | awk '{print $1}')

if [[ -z "$DRIVES" ]]; then
    print_err "No external USB drives found. Please connect a USB drive and try again."
fi

# Find the largest drive (assume it's the main storage)
LARGEST_DRIVE=""
LARGEST_SIZE=0

for drive in $DRIVES; do
    SIZE_BYTES=$(lsblk -bno SIZE "/dev/$drive" | head -1)
    if [[ $SIZE_BYTES -gt $LARGEST_SIZE ]]; then
        LARGEST_SIZE=$SIZE_BYTES
        LARGEST_DRIVE=$drive
    fi
done

if [[ -z "$LARGEST_DRIVE" ]]; then
    print_err "Could not determine storage drive"
fi

DEVICE="/dev/${LARGEST_DRIVE}"
PARTITION="${DEVICE}1"
SIZE_GB=$((LARGEST_SIZE / 1024 / 1024 / 1024))

print_ok "Found storage drive: $DEVICE (${SIZE_GB}GB)"

# Check if drive has partitions
if ! lsblk -n "$DEVICE" | grep -q part; then
    print_warn "Drive has no partitions. Creating partition..."
    
    # Create single partition using entire disk
    sudo parted -s "$DEVICE" mklabel gpt
    sudo parted -s "$DEVICE" mkpart primary ext4 0% 100%
    sudo partprobe "$DEVICE"
    sleep 2
fi
# Check filesystem
FSTYPE=$(lsblk -nfo FSTYPE "$PARTITION" 2>/dev/null || echo "")

if [[ "$FSTYPE" != "ext4" ]]; then
    print_warn "Partition is not ext4 formatted (current: ${FSTYPE:-unformatted})"
    echo "This will FORMAT the drive and ERASE ALL DATA!"
    echo "Drive: $DEVICE (${SIZE_GB}GB)"
    
    read -p "Continue? [y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_err "Aborted by user"
    fi
    
    print_warn "Formatting drive as ext4..."
    sudo mkfs.ext4 -F "$PARTITION"
    print_ok "Drive formatted as ext4"
fi

# Get UUID for fstab
UUID=$(sudo blkid -s UUID -o value "$PARTITION")
if [[ -z "$UUID" ]]; then
    print_err "Could not get UUID for partition $PARTITION"
fi

print_ok "Partition UUID: $UUID"

# Create mount point
sudo mkdir -p "$STORAGE_DIR"

# Add to fstab if not already present
if ! grep -q "$UUID" /etc/fstab; then
    echo "UUID=$UUID $STORAGE_DIR ext4 defaults,noatime 0 2" | sudo tee -a /etc/fstab
    print_ok "Added to /etc/fstab"
fi

# Mount the drive
if ! mountpoint -q "$STORAGE_DIR"; then
    sudo mount -a
    print_ok "Mounted storage drive"
fi
# Create directory structure
sudo mkdir -p "$STORAGE_DIR"/{files,temp,db,logs,backups,thumbnails,cache}

# Set ownership to pi user
sudo chown -R pi:pi "$STORAGE_DIR"

# Set permissions
chmod 755 "$STORAGE_DIR"
chmod 755 "$STORAGE_DIR"/{files,temp,db,logs,backups,thumbnails,cache}

print_ok "Created directory structure:"
print_ok "  $STORAGE_DIR/files      - User files"
print_ok "  $STORAGE_DIR/temp       - Temporary files"
print_ok "  $STORAGE_DIR/db         - Database files"
print_ok "  $STORAGE_DIR/logs       - Application logs"
print_ok "  $STORAGE_DIR/backups    - Database backups"
print_ok "  $STORAGE_DIR/thumbnails - Media thumbnails"
print_ok "  $STORAGE_DIR/cache      - Media cache"

# Verify mount and space
AVAILABLE=$(df -h "$STORAGE_DIR" | awk 'NR==2 {print $4}')
print_ok "Storage ready: ${AVAILABLE} available"

echo "Storage setup complete!"