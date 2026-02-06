#!/bin/bash

# PocketCloud USB Storage Setup Script
# Automates external USB drive setup for PocketCloud

set -e

echo "=============================================="
echo "PocketCloud USB Storage Setup"
echo "=============================================="
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

# Function to detect USB drives
detect_usb_drives() {
    echo "🔍 Detecting USB drives..."
    echo
    
    # List all block devices excluding loop devices and the root partition
    lsblk -d -o NAME,SIZE,MODEL,TRAN | grep -E "(usb|USB)" || {
        echo "❌ No USB drives detected!"
        echo "   Please connect a USB drive and try again."
        exit 1
    }
    echo
}

# Function to get drive info
get_drive_info() {
    local device=$1
    echo "📋 Drive Information for $device:"
    echo "   Size: $(lsblk -d -n -o SIZE /dev/$device)"
    echo "   Model: $(lsblk -d -n -o MODEL /dev/$device)"
    echo "   Current partitions:"
    lsblk /dev/$device -o NAME,SIZE,FSTYPE,MOUNTPOINT
    echo
}

# Function to format drive
format_drive() {
    local device=$1
    local partition="${device}1"
    
    echo "⚠️  WARNING: This will DESTROY ALL DATA on /dev/$device"
    echo "   Are you sure you want to continue? (type 'yes' to confirm)"
    read -r confirmation
    
    if [[ "$confirmation" != "yes" ]]; then
        echo "❌ Operation cancelled"
        exit 1
    fi
    
    echo "🔧 Formatting /dev/$device..."
    
    # Unmount if mounted
    umount /dev/${partition} 2>/dev/null || true
    
    # Create new partition table
    parted -s /dev/$device mklabel gpt
    parted -s /dev/$device mkpart primary ext4 0% 100%
    
    # Format as ext4
    mkfs.ext4 -F /dev/${partition}
    
    # Set label
    e2label /dev/${partition} "PocketCloud"
    
    echo "✅ Drive formatted successfully"
}

# Function to setup mount point
setup_mount() {
    local device=$1
    local partition="${device}1"
    
    # Get UUID
    local uuid=$(blkid -s UUID -o value /dev/${partition})
    
    if [[ -z "$uuid" ]]; then
        echo "❌ Could not get UUID for /dev/${partition}"
        exit 1
    fi
    
    echo "🔧 Setting up mount point..."
    
    # Create mount directory
    mkdir -p /mnt/pocketcloud
    
    # Check if already in fstab
    if grep -q "/mnt/pocketcloud" /etc/fstab; then
        echo "⚠️  Mount entry already exists in /etc/fstab"
        echo "   Removing old entry..."
        sed -i '\|/mnt/pocketcloud|d' /etc/fstab
    fi
    
    # Add to fstab
    echo "UUID=$uuid /mnt/pocketcloud ext4 defaults,nofail 0 2" >> /etc/fstab
    
    # Mount now
    mount -a
    
    # Verify mount
    if mountpoint -q /mnt/pocketcloud; then
        echo "✅ USB drive mounted at /mnt/pocketcloud"
        echo "   UUID: $uuid"
        echo "   Free space: $(df -h /mnt/pocketcloud | tail -1 | awk '{print $4}')"
    else
        echo "❌ Failed to mount USB drive"
        exit 1
    fi
}

# Function to set permissions
set_permissions() {
    echo "🔧 Setting permissions..."
    
    # Create PocketCloud data directory
    mkdir -p /mnt/pocketcloud/pocketcloud-data
    
    # Set ownership (will be changed by installer later)
    chown -R root:root /mnt/pocketcloud/pocketcloud-data
    chmod 755 /mnt/pocketcloud/pocketcloud-data
    
    echo "✅ Permissions set"
}

# Function to test the setup
test_setup() {
    echo "🧪 Testing setup..."
    
    # Test write access
    local test_file="/mnt/pocketcloud/test-write-$(date +%s)"
    echo "test" > "$test_file"
    
    if [[ -f "$test_file" ]]; then
        rm "$test_file"
        echo "✅ Write test passed"
    else
        echo "❌ Write test failed"
        exit 1
    fi
    
    # Check filesystem
    local fstype=$(df -T /mnt/pocketcloud | tail -1 | awk '{print $2}')
    if [[ "$fstype" == "ext4" ]]; then
        echo "✅ Filesystem check passed (ext4)"
    else
        echo "⚠️  Filesystem is $fstype (ext4 recommended)"
    fi
}

# Main execution
main() {
    echo "This script will help you set up external USB storage for PocketCloud."
    echo "PocketCloud requires external USB storage mounted at /mnt/pocketcloud"
    echo
    
    # Detect USB drives
    detect_usb_drives
    
    echo "📝 Available USB drives:"
    lsblk -d -o NAME,SIZE,MODEL,TRAN | grep -E "(usb|USB)" | nl -w2 -s') '
    echo
    
    # Get user selection
    echo "Enter the device name (e.g., sda, sdb): "
    read -r device_name
    
    # Validate device
    if [[ ! -b "/dev/$device_name" ]]; then
        echo "❌ Device /dev/$device_name not found"
        exit 1
    fi
    
    # Show drive info
    get_drive_info "$device_name"
    
    # Check if already has ext4 partition
    local existing_fs=$(lsblk -n -o FSTYPE /dev/${device_name}1 2>/dev/null || echo "")
    
    if [[ "$existing_fs" == "ext4" ]]; then
        echo "✅ Drive already has ext4 filesystem"
        echo "   Do you want to use it as-is? (y/n): "
        read -r use_existing
        
        if [[ "$use_existing" =~ ^[Yy]$ ]]; then
            echo "📋 Using existing filesystem..."
        else
            format_drive "$device_name"
        fi
    else
        echo "🔧 Drive needs to be formatted for PocketCloud"
        format_drive "$device_name"
    fi
    
    # Setup mount point
    setup_mount "$device_name"
    
    # Set permissions
    set_permissions
    
    # Test setup
    test_setup
    
    echo
    echo "=============================================="
    echo "✅ USB Storage Setup Complete!"
    echo "=============================================="
    echo
    echo "📋 Summary:"
    echo "   Mount point: /mnt/pocketcloud"
    echo "   Filesystem: ext4"
    echo "   Auto-mount: Enabled (via /etc/fstab)"
    echo "   Free space: $(df -h /mnt/pocketcloud | tail -1 | awk '{print $4}')"
    echo
    echo "🚀 You can now install PocketCloud:"
    echo "   sudo bash install.sh"
    echo
}

# Run main function
main "$@"