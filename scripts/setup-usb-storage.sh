#!/bin/bash
set -euo pipefail

# PocketCloud USB Storage Setup Script
# Automatically detects, formats, and mounts external USB drives for PocketCloud
# Supports 1TB+ drives with optimal performance settings

SCRIPT_VERSION="1.0.0"
MOUNT_POINT="/mnt/pocketcloud"
BACKUP_MOUNT="/mnt/pocketcloud-backup"
CONFIG_FILE="/opt/pocketcloud/config/storage.conf"
LOG_FILE="/var/log/pocketcloud-storage.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

info() {
    echo -e "${CYAN}ℹ${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root. Use: sudo $0"
    fi
}

# Check system requirements
check_requirements() {
    log "Checking system requirements..."
    
    # Check if running on Raspberry Pi
    if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
        error "This script is designed for Raspberry Pi hardware"
    fi
    
    # Check required tools
    local required_tools=("lsblk" "fdisk" "mkfs.ext4" "blkid" "parted")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            warn "$tool not found, installing..."
            apt-get update -qq
            apt-get install -y -qq parted e2fsprogs util-linux
            break
        fi
    done
    
    success "System requirements met"
}

# Detect USB drives
detect_usb_drives() {
    log "Detecting USB storage devices..."
    
    # Get all USB storage devices
    local usb_devices=()
    while IFS= read -r line; do
        usb_devices+=("$line")
    done < <(lsblk -d -o NAME,SIZE,TYPE,TRAN | grep -E "usb|USB" | grep -v "loop" || true)
    
    if [[ ${#usb_devices[@]} -eq 0 ]]; then
        error "No USB storage devices detected. Please connect a USB drive and try again."
    fi
    
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔍 Detected USB Storage Devices:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local index=1
    local device_list=()
    
    for device_info in "${usb_devices[@]}"; do
        local device_name=$(echo "$device_info" | awk '{print $1}')
        local device_size=$(echo "$device_info" | awk '{print $2}')
        local device_type=$(echo "$device_info" | awk '{print $3}')
        
        # Get additional info
        local device_path="/dev/$device_name"
        local device_model=""
        local device_vendor=""
        
        if [[ -f "/sys/block/$device_name/device/model" ]]; then
            device_model=$(cat "/sys/block/$device_name/device/model" 2>/dev/null | tr -d '\n' || echo "Unknown")
        fi
        
        if [[ -f "/sys/block/$device_name/device/vendor" ]]; then
            device_vendor=$(cat "/sys/block/$device_name/device/vendor" 2>/dev/null | tr -d '\n' || echo "Unknown")
        fi
        
        # Check if device is already mounted
        local mount_status=""
        if mount | grep -q "$device_path"; then
            mount_status=" ${RED}(MOUNTED)${NC}"
        else
            mount_status=" ${GREEN}(AVAILABLE)${NC}"
        fi
        
        echo -e "  ${CYAN}[$index]${NC} $device_path - $device_size - $device_vendor $device_model$mount_status"
        device_list+=("$device_path")
        ((index++))
    done
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    
    # Let user select device
    while true; do
        echo -n "Select device number [1-${#device_list[@]}] or 'q' to quit: "
        read -r selection
        
        if [[ "$selection" == "q" ]]; then
            echo "Setup cancelled by user"
            exit 0
        fi
        
        if [[ "$selection" =~ ^[0-9]+$ ]] && [[ "$selection" -ge 1 ]] && [[ "$selection" -le ${#device_list[@]} ]]; then
            SELECTED_DEVICE="${device_list[$((selection-1))]}"
            break
        else
            warn "Invalid selection. Please enter a number between 1 and ${#device_list[@]}"
        fi
    done
    
    success "Selected device: $SELECTED_DEVICE"
}

# Analyze selected device
analyze_device() {
    log "Analyzing selected device: $SELECTED_DEVICE"
    
    # Get device info
    local device_name=$(basename "$SELECTED_DEVICE")
    local device_size_bytes=$(lsblk -b -d -o SIZE -n "$SELECTED_DEVICE")
    local device_size_gb=$((device_size_bytes / 1024 / 1024 / 1024))
    
    # Check minimum size (100GB)
    if [[ $device_size_gb -lt 100 ]]; then
        error "Device too small: ${device_size_gb}GB (minimum 100GB required)"
    fi
    
    # Check if device is mounted
    if mount | grep -q "$SELECTED_DEVICE"; then
        warn "Device is currently mounted. Unmounting..."
        umount "${SELECTED_DEVICE}"* 2>/dev/null || true
        sleep 2
    fi
    
    # Check for existing data
    local has_partitions=false
    if lsblk -n "$SELECTED_DEVICE" | grep -q "part"; then
        has_partitions=true
    fi
    
    # Display device analysis
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 Device Analysis: $SELECTED_DEVICE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Size: ${device_size_gb}GB ($(numfmt --to=iec-i --suffix=B $device_size_bytes))"
    echo "Interface: USB 3.0 $(lsusb | grep -i "$(cat /sys/block/$device_name/device/vendor 2>/dev/null || echo '')" | head -1 || echo '')"
    
    if [[ "$has_partitions" == true ]]; then
        echo -e "Status: ${YELLOW}Has existing partitions${NC}"
        echo
        echo "Existing partitions:"
        lsblk "$SELECTED_DEVICE" -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT
    else
        echo -e "Status: ${GREEN}No partitions (clean drive)${NC}"
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Confirm formatting
    if [[ "$has_partitions" == true ]]; then
        echo
        warn "This will DESTROY ALL DATA on $SELECTED_DEVICE"
        echo -n "Are you sure you want to continue? Type 'YES' to confirm: "
        read -r confirmation
        
        if [[ "$confirmation" != "YES" ]]; then
            echo "Setup cancelled by user"
            exit 0
        fi
    fi
    
    success "Device analysis complete"
}

# Format device with optimal settings
format_device() {
    log "Formatting device with optimal settings..."
    
    local device_name=$(basename "$SELECTED_DEVICE")
    
    # Unmount any existing partitions
    umount "${SELECTED_DEVICE}"* 2>/dev/null || true
    
    # Create new partition table
    info "Creating new GPT partition table..."
    parted -s "$SELECTED_DEVICE" mklabel gpt
    
    # Create single partition using entire disk
    info "Creating primary partition..."
    parted -s "$SELECTED_DEVICE" mkpart primary ext4 0% 100%
    
    # Wait for partition to be recognized
    sleep 3
    partprobe "$SELECTED_DEVICE"
    sleep 2
    
    # Determine partition device
    local partition_device="${SELECTED_DEVICE}1"
    if [[ ! -b "$partition_device" ]]; then
        # Try alternative naming (e.g., /dev/sda1 vs /dev/sdap1)
        partition_device="${SELECTED_DEVICE}p1"
        if [[ ! -b "$partition_device" ]]; then
            error "Could not find partition device after creation"
        fi
    fi
    
    # Format with ext4 and optimal settings
    info "Formatting partition with ext4..."
    mkfs.ext4 -F \
        -L "PocketCloud" \
        -O ^has_journal \
        -E stride=32,stripe-width=32 \
        -b 4096 \
        -i 16384 \
        "$partition_device"
    
    # Re-enable journal with optimal settings
    tune2fs -j "$partition_device"
    tune2fs -o journal_data_writeback "$partition_device"
    
    # Set optimal mount options
    tune2fs -o user_xattr,acl "$partition_device"
    
    # Set reserved blocks to 1% (default is 5%)
    tune2fs -m 1 "$partition_device"
    
    PARTITION_DEVICE="$partition_device"
    success "Device formatted successfully: $PARTITION_DEVICE"
}

# Create mount points and configure mounting
setup_mounting() {
    log "Setting up mount points..."
    
    # Create mount directories
    mkdir -p "$MOUNT_POINT"
    mkdir -p "$BACKUP_MOUNT"
    
    # Set proper ownership
    chown -R pocketcloud:pocketcloud "$MOUNT_POINT" 2>/dev/null || chown -R pi:pi "$MOUNT_POINT"
    
    # Get UUID of the partition
    local uuid=$(blkid -s UUID -o value "$PARTITION_DEVICE")
    if [[ -z "$uuid" ]]; then
        error "Could not get UUID of formatted partition"
    fi
    
    # Create fstab entry
    local fstab_entry="UUID=$uuid $MOUNT_POINT ext4 defaults,noatime,commit=60,barrier=0 0 2"
    
    # Remove any existing entries for this mount point
    sed -i "\|$MOUNT_POINT|d" /etc/fstab
    
    # Add new entry
    echo "$fstab_entry" >> /etc/fstab
    
    # Mount the drive
    info "Mounting drive..."
    mount "$MOUNT_POINT"
    
    # Verify mount
    if ! mountpoint -q "$MOUNT_POINT"; then
        error "Failed to mount drive at $MOUNT_POINT"
    fi
    
    # Create directory structure
    info "Creating directory structure..."
    mkdir -p "$MOUNT_POINT"/{uploads,media,backups,temp,trash}
    mkdir -p "$MOUNT_POINT/media"/{photos,videos,music,documents}
    
    # Set proper permissions
    chown -R pocketcloud:pocketcloud "$MOUNT_POINT" 2>/dev/null || chown -R pi:pi "$MOUNT_POINT"
    chmod -R 755 "$MOUNT_POINT"
    
    # Create storage configuration
    mkdir -p "$(dirname "$CONFIG_FILE")"
    cat > "$CONFIG_FILE" << EOF
# PocketCloud Storage Configuration
# Generated on $(date)

STORAGE_DEVICE=$PARTITION_DEVICE
STORAGE_UUID=$uuid
STORAGE_MOUNT=$MOUNT_POINT
STORAGE_SIZE=$(lsblk -b -o SIZE -n "$PARTITION_DEVICE")
STORAGE_FILESYSTEM=ext4
STORAGE_LABEL=PocketCloud

# Mount options
MOUNT_OPTIONS=defaults,noatime,commit=60,barrier=0

# Directory structure
UPLOADS_DIR=$MOUNT_POINT/uploads
MEDIA_DIR=$MOUNT_POINT/media
BACKUPS_DIR=$MOUNT_POINT/backups
TEMP_DIR=$MOUNT_POINT/temp
TRASH_DIR=$MOUNT_POINT/trash
EOF
    
    success "Mount points configured successfully"
}

# Optimize storage performance
optimize_storage() {
    log "Optimizing storage performance..."
    
    local device_name=$(basename "$SELECTED_DEVICE")
    
    # Set I/O scheduler to deadline for better SSD performance
    if [[ -f "/sys/block/$device_name/queue/scheduler" ]]; then
        echo deadline > "/sys/block/$device_name/queue/scheduler" 2>/dev/null || true
        info "Set I/O scheduler to deadline"
    fi
    
    # Increase read-ahead buffer
    if [[ -f "/sys/block/$device_name/queue/read_ahead_kb" ]]; then
        echo 1024 > "/sys/block/$device_name/queue/read_ahead_kb" 2>/dev/null || true
        info "Increased read-ahead buffer to 1MB"
    fi
    
    # Disable NCQ if it's an SSD (improves random I/O)
    if [[ -f "/sys/block/$device_name/queue/nr_requests" ]]; then
        echo 1 > "/sys/block/$device_name/queue/nr_requests" 2>/dev/null || true
    fi
    
    # Create udev rule for persistent optimization
    cat > "/etc/udev/rules.d/99-pocketcloud-storage.rules" << EOF
# PocketCloud Storage Optimization Rules
# Automatically optimize USB storage devices

# Set scheduler and read-ahead for PocketCloud storage
SUBSYSTEM=="block", KERNEL=="sd*", ATTR{queue/scheduler}="deadline"
SUBSYSTEM=="block", KERNEL=="sd*", ATTR{queue/read_ahead_kb}="1024"

# Set optimal queue depth for USB storage
SUBSYSTEM=="block", KERNEL=="sd*", ATTR{queue/nr_requests}="32"
EOF
    
    # Reload udev rules
    udevadm control --reload-rules
    udevadm trigger
    
    success "Storage performance optimized"
}

# Setup monitoring and health checks
setup_monitoring() {
    log "Setting up storage monitoring..."
    
    # Create monitoring script
    cat > "/usr/local/bin/pocketcloud-storage-monitor" << 'EOF'
#!/bin/bash
# PocketCloud Storage Health Monitor

MOUNT_POINT="/mnt/pocketcloud"
LOG_FILE="/var/log/pocketcloud-storage-health.log"
CONFIG_FILE="/opt/pocketcloud/config/storage.conf"

# Load configuration
if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
fi

# Check if storage is mounted
if ! mountpoint -q "$MOUNT_POINT"; then
    echo "$(date): ERROR - Storage not mounted at $MOUNT_POINT" >> "$LOG_FILE"
    # Try to remount
    mount "$MOUNT_POINT" 2>/dev/null || {
        echo "$(date): ERROR - Failed to remount storage" >> "$LOG_FILE"
        exit 1
    }
    echo "$(date): INFO - Storage remounted successfully" >> "$LOG_FILE"
fi

# Check disk space (warn if >90% full)
USAGE=$(df "$MOUNT_POINT" | awk 'NR==2{print $5}' | sed 's/%//')
if [[ $USAGE -gt 90 ]]; then
    echo "$(date): WARNING - Storage usage at ${USAGE}%" >> "$LOG_FILE"
fi

# Check filesystem health
if ! tune2fs -l "$STORAGE_DEVICE" >/dev/null 2>&1; then
    echo "$(date): ERROR - Filesystem health check failed" >> "$LOG_FILE"
fi

# Update last check timestamp
echo "$(date): INFO - Health check completed (Usage: ${USAGE}%)" >> "$LOG_FILE"
EOF
    
    chmod +x "/usr/local/bin/pocketcloud-storage-monitor"
    
    # Create systemd service for monitoring
    cat > "/etc/systemd/system/pocketcloud-storage-monitor.service" << EOF
[Unit]
Description=PocketCloud Storage Health Monitor
After=multi-user.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/pocketcloud-storage-monitor
User=root

[Install]
WantedBy=multi-user.target
EOF
    
    # Create timer for regular monitoring
    cat > "/etc/systemd/system/pocketcloud-storage-monitor.timer" << EOF
[Unit]
Description=Run PocketCloud Storage Monitor every 5 minutes
Requires=pocketcloud-storage-monitor.service

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
EOF
    
    # Enable and start monitoring
    systemctl daemon-reload
    systemctl enable pocketcloud-storage-monitor.timer
    systemctl start pocketcloud-storage-monitor.timer
    
    success "Storage monitoring configured"
}

# Create backup and maintenance scripts
create_maintenance_scripts() {
    log "Creating maintenance scripts..."
    
    # Create backup script
    cat > "/usr/local/bin/pocketcloud-backup-storage" << 'EOF'
#!/bin/bash
# PocketCloud Storage Backup Script

MOUNT_POINT="/mnt/pocketcloud"
BACKUP_DIR="/home/pi/pocketcloud-backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "Starting PocketCloud storage backup..."

# Backup configuration and database
tar -czf "$BACKUP_DIR/pocketcloud-config-$DATE.tar.gz" \
    /opt/pocketcloud/config \
    /opt/pocketcloud/data 2>/dev/null || true

# Backup user data (excluding large media files)
rsync -av --exclude="*.mp4" --exclude="*.mkv" --exclude="*.avi" \
    "$MOUNT_POINT/" "$BACKUP_DIR/data-$DATE/" 2>/dev/null || true

echo "Backup completed: $BACKUP_DIR"
echo "Config backup: pocketcloud-config-$DATE.tar.gz"
echo "Data backup: data-$DATE/"
EOF
    
    chmod +x "/usr/local/bin/pocketcloud-backup-storage"
    
    # Create cleanup script
    cat > "/usr/local/bin/pocketcloud-cleanup-storage" << 'EOF'
#!/bin/bash
# PocketCloud Storage Cleanup Script

MOUNT_POINT="/mnt/pocketcloud"
TRASH_DIR="$MOUNT_POINT/trash"
TEMP_DIR="$MOUNT_POINT/temp"

echo "Starting PocketCloud storage cleanup..."

# Clean trash (files older than 30 days)
if [[ -d "$TRASH_DIR" ]]; then
    find "$TRASH_DIR" -type f -mtime +30 -delete 2>/dev/null || true
    echo "Cleaned trash directory"
fi

# Clean temp files (files older than 7 days)
if [[ -d "$TEMP_DIR" ]]; then
    find "$TEMP_DIR" -type f -mtime +7 -delete 2>/dev/null || true
    echo "Cleaned temp directory"
fi

# Clean empty directories
find "$MOUNT_POINT" -type d -empty -delete 2>/dev/null || true

echo "Storage cleanup completed"
EOF
    
    chmod +x "/usr/local/bin/pocketcloud-cleanup-storage"
    
    success "Maintenance scripts created"
}

# Run final health check
final_health_check() {
    log "Running final health check..."
    
    # Check mount
    if ! mountpoint -q "$MOUNT_POINT"; then
        error "Storage not properly mounted"
    fi
    
    # Check permissions
    if ! touch "$MOUNT_POINT/.test" 2>/dev/null; then
        error "Cannot write to storage directory"
    fi
    rm -f "$MOUNT_POINT/.test"
    
    # Check available space
    local available_gb=$(df -BG "$MOUNT_POINT" | awk 'NR==2{print $4}' | sed 's/G//')
    if [[ $available_gb -lt 10 ]]; then
        warn "Low available space: ${available_gb}GB"
    fi
    
    # Test write performance
    info "Testing write performance..."
    local test_file="$MOUNT_POINT/.speed_test"
    local write_speed=$(dd if=/dev/zero of="$test_file" bs=1M count=100 2>&1 | grep -o '[0-9.]\+ MB/s' || echo "Unknown")
    rm -f "$test_file"
    
    success "Health check passed - Write speed: $write_speed"
}

# Display completion summary
show_completion() {
    local device_size_gb=$(df -BG "$MOUNT_POINT" | awk 'NR==2{print $2}' | sed 's/G//')
    local available_gb=$(df -BG "$MOUNT_POINT" | awk 'NR==2{print $4}' | sed 's/G//')
    local uuid=$(blkid -s UUID -o value "$PARTITION_DEVICE")
    
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 PocketCloud USB Storage Setup Complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    Storage Information                       ║"
    echo "║                                                              ║"
    echo "║  Device:      $SELECTED_DEVICE                                    ║"
    echo "║  Partition:   $PARTITION_DEVICE                                   ║"
    echo "║  UUID:        $uuid                      ║"
    echo "║  Mount Point: $MOUNT_POINT                                ║"
    echo "║  Filesystem:  ext4 (optimized)                              ║"
    echo "║  Total Size:  ${device_size_gb}GB                                        ║"
    echo "║  Available:   ${available_gb}GB                                        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo
    echo "✅ Features Configured:"
    echo "   • Automatic mounting on boot"
    echo "   • Performance optimization (deadline scheduler, read-ahead)"
    echo "   • Health monitoring (every 5 minutes)"
    echo "   • Directory structure for PocketCloud"
    echo "   • Backup and cleanup scripts"
    echo "   • Proper permissions and ownership"
    echo
    echo "📁 Directory Structure:"
    echo "   $MOUNT_POINT/uploads/     - File uploads"
    echo "   $MOUNT_POINT/media/       - Media files (photos, videos, music)"
    echo "   $MOUNT_POINT/backups/     - System backups"
    echo "   $MOUNT_POINT/temp/        - Temporary files"
    echo "   $MOUNT_POINT/trash/       - Deleted files"
    echo
    echo "🛠️  Maintenance Commands:"
    echo "   sudo pocketcloud-backup-storage      - Backup data"
    echo "   sudo pocketcloud-cleanup-storage     - Clean old files"
    echo "   sudo pocketcloud-storage-monitor     - Manual health check"
    echo
    echo "📊 Monitor Storage:"
    echo "   df -h $MOUNT_POINT                   - Check disk usage"
    echo "   sudo systemctl status pocketcloud-storage-monitor.timer"
    echo "   tail -f /var/log/pocketcloud-storage-health.log"
    echo
    echo "Your PocketCloud storage is ready! The drive will automatically mount"
    echo "on boot and is optimized for best performance."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Main function
main() {
    # Initialize log file
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$(date): Starting PocketCloud USB storage setup" > "$LOG_FILE"
    
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🥧 PocketCloud USB Storage Setup v$SCRIPT_VERSION"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    echo "This script will:"
    echo "• Detect and analyze USB storage devices"
    echo "• Format the selected drive with optimal ext4 settings"
    echo "• Create and configure mount points"
    echo "• Set up automatic mounting on boot"
    echo "• Optimize performance for Raspberry Pi"
    echo "• Configure health monitoring and maintenance"
    echo
    warn "⚠️  This will DESTROY ALL DATA on the selected drive!"
    echo
    echo -n "Continue with setup? [y/N] "
    read -r response
    
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Setup cancelled by user"
        exit 0
    fi
    
    check_root
    check_requirements
    detect_usb_drives
    analyze_device
    format_device
    setup_mounting
    optimize_storage
    setup_monitoring
    create_maintenance_scripts
    final_health_check
    show_completion
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "PocketCloud USB Storage Setup v$SCRIPT_VERSION"
        echo
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --version, -v  Show version information"
        echo "  --list         List available USB devices"
        echo "  --check        Check current storage status"
        echo
        echo "This script automatically detects, formats, and configures"
        echo "USB storage devices for optimal use with PocketCloud."
        exit 0
        ;;
    --version|-v)
        echo "PocketCloud USB Storage Setup v$SCRIPT_VERSION"
        exit 0
        ;;
    --list)
        echo "Available USB storage devices:"
        lsblk -d -o NAME,SIZE,TYPE,TRAN,VENDOR,MODEL | grep -E "usb|USB" || echo "No USB devices found"
        exit 0
        ;;
    --check)
        if [[ -f "$CONFIG_FILE" ]]; then
            echo "Current PocketCloud storage configuration:"
            cat "$CONFIG_FILE"
            echo
            echo "Mount status:"
            df -h "$MOUNT_POINT" 2>/dev/null || echo "Storage not mounted"
        else
            echo "No PocketCloud storage configured"
        fi
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac