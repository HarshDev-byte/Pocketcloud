#!/bin/bash

# PocketCloud USB Storage Setup Script
# Helps configure external USB drive for reliable mounting

set -e

MOUNT_POINT="/mnt/pocketcloud"
FSTAB_FILE="/etc/fstab"

echo "PocketCloud USB Storage Setup"
echo "============================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run as root"
    echo "Usage: sudo bash scripts/setup-usb-storage.sh"
    exit 1
fi

# Function to detect USB drives
detect_usb_drives() {
    echo "Detecting USB drives..."
    echo ""
    
    # List all block devices that are USB and have filesystems
    lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,UUID | grep -E "(disk|part)" | while read line; do
        device_name=$(echo "$line" | awk '{print $1}')
        device_path="/dev/$device_name"
        
        # Check if it's a USB device
        if udevadm info --query=property --name="$device_path" 2>/dev/null | grep -q "ID_BUS=usb"; then
            echo "USB Device: $line"
        fi
    done
    echo ""
}

# Function to get device UUID
get_device_uuid() {
    local device="$1"
    blkid -s UUID -o value "$device" 2>/dev/null || echo ""
}

# Function to get device filesystem
get_device_fstype() {
    local device="$1"
    blkid -s TYPE -o value "$device" 2>/dev/null || echo ""
}

# Function to create mount point
create_mount_point() {
    echo "Creating mount point: $MOUNT_POINT"
    mkdir -p "$MOUNT_POINT"
    echo "✓ Mount point created"
    echo ""
}

# Function to add fstab entry
add_fstab_entry() {
    local uuid="$1"
    local fstype="$2"
    
    # Check if entry already exists
    if grep -q "$MOUNT_POINT" "$FSTAB_FILE"; then
        echo "Warning: Entry for $MOUNT_POINT already exists in $FSTAB_FILE"
        echo "Please check and update manually if needed."
        echo ""
        return
    fi
    
    # Add entry
    local fstab_entry="UUID=$uuid $MOUNT_POINT $fstype defaults,nofail 0 2"
    echo "Adding to $FSTAB_FILE:"
    echo "$fstab_entry"
    echo ""
    
    # Backup fstab
    cp "$FSTAB_FILE" "$FSTAB_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    echo "✓ Backed up $FSTAB_FILE"
    
    # Add entry
    echo "$fstab_entry" >> "$FSTAB_FILE"
    echo "✓ Added fstab entry"
    echo ""
}

# Function to test mount
test_mount() {
    echo "Testing mount..."
    
    # Try to mount
    if mount -a; then
        echo "✓ Mount successful"
    else
        echo "✗ Mount failed"
        echo "Check the fstab entry and device connection"
        exit 1
    fi
    
    # Check if mounted
    if mountpoint -q "$MOUNT_POINT"; then
        echo "✓ $MOUNT_POINT is mounted"
        
        # Show mount info
        echo ""
        echo "Mount information:"
        findmnt "$MOUNT_POINT"
        echo ""
        
        # Test write access
        if touch "$MOUNT_POINT/.pocketcloud-test" 2>/dev/null; then
            rm -f "$MOUNT_POINT/.pocketcloud-test"
            echo "✓ Write access confirmed"
        else
            echo "✗ No write access - check permissions"
            echo "Fix with: chown -R pocketcloud:pocketcloud $MOUNT_POINT"
        fi
    else
        echo "✗ $MOUNT_POINT is not mounted"
        exit 1
    fi
    echo ""
}

# Main setup process
main() {
    echo "Step 1: Detecting USB drives"
    echo "----------------------------"
    detect_usb_drives
    
    echo "Step 2: Select USB device"
    echo "------------------------"
    echo "Enter the device path (e.g., /dev/sdb1):"
    read -r device_path
    
    if [ ! -b "$device_path" ]; then
        echo "Error: $device_path is not a valid block device"
        exit 1
    fi
    
    # Get device info
    uuid=$(get_device_uuid "$device_path")
    fstype=$(get_device_fstype "$device_path")
    
    if [ -z "$uuid" ]; then
        echo "Error: Could not get UUID for $device_path"
        echo "Make sure the device has a filesystem"
        exit 1
    fi
    
    if [ -z "$fstype" ]; then
        echo "Error: Could not get filesystem type for $device_path"
        exit 1
    fi
    
    echo ""
    echo "Device information:"
    echo "  Path: $device_path"
    echo "  UUID: $uuid"
    echo "  Filesystem: $fstype"
    echo ""
    
    # Warn about non-ext4
    if [ "$fstype" != "ext4" ]; then
        echo "Warning: Filesystem is $fstype, not ext4"
        echo "ext4 is recommended for best performance and reliability"
        echo ""
    fi
    
    echo "Step 3: Create mount point"
    echo "-------------------------"
    create_mount_point
    
    echo "Step 4: Configure fstab"
    echo "----------------------"
    add_fstab_entry "$uuid" "$fstype"
    
    echo "Step 5: Test mount"
    echo "-----------------"
    test_mount
    
    echo "Setup Complete!"
    echo "==============="
    echo ""
    echo "Your USB drive is now configured for PocketCloud:"
    echo "• Device: $device_path (UUID: $uuid)"
    echo "• Mount point: $MOUNT_POINT"
    echo "• Filesystem: $fstype"
    echo ""
    echo "The drive will automatically mount on boot."
    echo "You can now start PocketCloud with: npm start"
    echo ""
    echo "If you need to change the USB drive later:"
    echo "1. Edit $FSTAB_FILE"
    echo "2. Update the UUID to match your new drive"
    echo "3. Run: sudo mount -a"
    echo ""
}

# Run main function
main