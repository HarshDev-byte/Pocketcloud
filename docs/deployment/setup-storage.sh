#!/bin/bash
set -euo pipefail

# PocketCloud USB Storage Setup Script
# Detects, formats, and mounts USB drive for PocketCloud storage

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_green() { echo -e "${GREEN}✓ $1${NC}"; }
echo_red() { echo -e "${RED}✗ $1${NC}"; }
echo_yellow() { echo -e "${YELLOW}⚠ $1${NC}"; }

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PocketCloud USB Storage Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# STEP 1 — Detect USB drive
echo_yellow "Step 1: Detecting USB drive..."
# List all block devices, exclude SD card (mmcblk), loop devices, and CD-ROM (sr)
echo "Available block devices:"
lsblk -ndo NAME,SIZE,TYPE | grep disk | grep -v mmcblk | grep -v loop | grep -v sr || true
echo ""

# Find the external USB drive using transport type
USB_DRIVE=$(lsblk -ndo NAME,TRAN | grep usb | head -1 | awk '{print $1}' || echo "")

if [ -z "$USB_DRIVE" ]; then
    echo_red "No USB drive detected. Connect a USB drive and retry."
    echo "Expected: A USB storage device connected to the Pi"
    exit 1
fi

USB_SIZE=$(lsblk -ndo SIZE /dev/${USB_DRIVE})
echo_green "Found USB drive: /dev/${USB_DRIVE} (${USB_SIZE})"

# STEP 2 — Check if already mounted
echo_yellow "Step 2: Checking current mount status..."
if mountpoint -q /mnt/pocketcloud 2>/dev/null; then
    echo_green "USB drive already mounted at /mnt/pocketcloud"
    echo "Skipping to directory structure setup..."
    SKIP_MOUNT=true
elif [ -e "/dev/${USB_DRIVE}1" ] && blkid /dev/${USB_DRIVE}1 | grep -q "TYPE=\"ext4\""; then
    echo_yellow "Found existing ext4 partition on /dev/${USB_DRIVE}1"
    echo "Skipping format, proceeding to mount..."
    SKIP_FORMAT=true
else
    echo_yellow "Drive needs to be formatted"
    SKIP_FORMAT=false
fi

# STEP 3 — Format drive (with confirmation)
if [ "${SKIP_FORMAT:-false}" = "false" ] && [ "${SKIP_MOUNT:-false}" != "true" ]; then
    echo_yellow "Step 3: Formatting USB drive..."
    echo ""
    echo -e "${RED}⚠  WARNING: This will ERASE all data on /dev/${USB_DRIVE}${NC}"
    echo "   Drive: /dev/${USB_DRIVE} (${USB_SIZE})"
    echo ""
    read -p "   Type 'YES' to continue: " CONFIRM
    
    if [ "$CONFIRM" != "YES" ]; then
        echo "Cancelled."
        exit 0
    fi
    
    echo_yellow "Partitioning and formatting..."
    # Create GPT partition table and single ext4 partition
    sudo parted /dev/${USB_DRIVE} --script mklabel gpt
    sudo parted /dev/${USB_DRIVE} --script mkpart primary ext4 0% 100%
    # Format with ext4 and label
    sudo mkfs.ext4 -L pocketcloud /dev/${USB_DRIVE}1
    
    # Wait for partition to appear in system
    sleep 2
    sudo udevadm settle
    echo_green "Drive formatted successfully"
fi

# STEP 4 — Create mount point and add to fstab
if [ "${SKIP_MOUNT:-false}" != "true" ]; then
    echo_yellow "Step 4: Configuring mount point..."
    # Create mount directory
    sudo mkdir -p /mnt/pocketcloud
    
    # Get UUID of the partition for stable mounting
    UUID=$(sudo blkid -s UUID -o value /dev/${USB_DRIVE}1)
    echo "Partition UUID: ${UUID}"
    
    # Add to /etc/fstab if not already present
    if ! grep -q "/mnt/pocketcloud" /etc/fstab; then
        echo "UUID=${UUID} /mnt/pocketcloud ext4 defaults,noatime,nofail 0 2" | sudo tee -a /etc/fstab > /dev/null
        echo_green "Added to /etc/fstab for automatic mounting"
    else
        echo_yellow "Mount entry already exists in /etc/fstab"
    fi
    
    # Mount now
    sudo mount -a
    echo_green "USB drive mounted at /mnt/pocketcloud"
fi

# STEP 5 — Create directory structure
echo_yellow "Step 5: Creating directory structure..."
# Create all required directories for PocketCloud
sudo mkdir -p /mnt/pocketcloud/{files,temp,db,logs,backups,thumbnails}
# Set ownership to current user
sudo chown -R $USER:$USER /mnt/pocketcloud
# Set appropriate permissions
sudo chmod -R 755 /mnt/pocketcloud
echo_green "Directory structure created"

# STEP 6 — Verify
echo_yellow "Step 6: Verifying setup..."
# Check mount and show disk usage
df -h /mnt/pocketcloud
FREE_SPACE=$(df -h /mnt/pocketcloud | tail -1 | awk '{print $4}')
echo ""
echo_green "USB drive mounted at /mnt/pocketcloud"
echo_green "Free space: ${FREE_SPACE}"
echo ""
echo "Directory structure:"
ls -la /mnt/pocketcloud/
echo ""
echo_green "Storage setup complete!"