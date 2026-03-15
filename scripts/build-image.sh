#!/bin/bash
set -euo pipefail

# PocketCloud Drive Image Builder
# Builds a custom Raspberry Pi OS image with PocketCloud pre-installed

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build"
IMAGE_DIR="$BUILD_DIR/image"
MOUNT_DIR="$BUILD_DIR/mount"

# Configuration
PI_OS_VERSION="2024-03-15"
PI_OS_URL="https://downloads.raspberrypi.org/raspios_lite_arm64/images/raspios_lite_arm64-2024-03-15/2024-03-15-raspios-bookworm-arm64-lite.img.xz"
POCKETCLOUD_VERSION="${POCKETCLOUD_VERSION:-$(git describe --tags --always)}"
OUTPUT_IMAGE="PocketCloud-${POCKETCLOUD_VERSION}.img"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1" >&2
    exit 1
}

# Check dependencies
check_dependencies() {
    log "Checking dependencies..."
    
    local deps=("wget" "xz" "losetup" "mount" "chroot" "qemu-user-static")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            error "Required dependency '$dep' not found"
        fi
    done
    
    # Check if running as root (required for loopback mounting)
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (for loopback mounting)"
    fi
    
    success "All dependencies found"
}

# Download base Pi OS image
download_base_image() {
    log "Downloading Raspberry Pi OS base image..."
    
    mkdir -p "$IMAGE_DIR"
    local base_image="$IMAGE_DIR/raspios-base.img.xz"
    
    if [[ ! -f "$base_image" ]]; then
        wget -O "$base_image" "$PI_OS_URL"
        success "Downloaded base image"
    else
        success "Base image already exists"
    fi
    
    # Extract image
    log "Extracting base image..."
    if [[ ! -f "$IMAGE_DIR/raspios-base.img" ]]; then
        xz -d -k "$base_image"
        success "Extracted base image"
    else
        success "Base image already extracted"
    fi
}

# Copy and resize image
prepare_image() {
    log "Preparing image for customization..."
    
    # Copy base image to working image
    cp "$IMAGE_DIR/raspios-base.img" "$IMAGE_DIR/$OUTPUT_IMAGE"
    
    # Resize image to add space for PocketCloud (add 2GB)
    local current_size=$(stat -c%s "$IMAGE_DIR/$OUTPUT_IMAGE")
    local new_size=$((current_size + 2147483648))  # +2GB
    
    truncate -s "$new_size" "$IMAGE_DIR/$OUTPUT_IMAGE"
    
    # Resize the root partition
    echo ", +" | sfdisk -N 2 "$IMAGE_DIR/$OUTPUT_IMAGE"
    
    success "Image prepared and resized"
}
# Mount image via loopback
mount_image() {
    log "Mounting image via loopback..."
    
    # Setup loopback device
    local loop_device=$(losetup -f --show "$IMAGE_DIR/$OUTPUT_IMAGE")
    echo "$loop_device" > "$BUILD_DIR/loop_device"
    
    # Wait for partitions to appear
    partprobe "$loop_device"
    sleep 2
    
    # Mount partitions
    mkdir -p "$MOUNT_DIR"
    mount "${loop_device}p2" "$MOUNT_DIR"  # Root partition
    mount "${loop_device}p1" "$MOUNT_DIR/boot"  # Boot partition
    
    success "Image mounted at $MOUNT_DIR"
}

# Setup chroot environment
setup_chroot() {
    log "Setting up chroot environment..."
    
    # Copy qemu static for ARM64 emulation on x86
    if [[ $(uname -m) != "aarch64" ]]; then
        cp /usr/bin/qemu-aarch64-static "$MOUNT_DIR/usr/bin/"
    fi
    
    # Mount necessary filesystems
    mount -t proc proc "$MOUNT_DIR/proc"
    mount -t sysfs sysfs "$MOUNT_DIR/sys"
    mount -o bind /dev "$MOUNT_DIR/dev"
    mount -o bind /dev/pts "$MOUNT_DIR/dev/pts"
    
    # Copy DNS resolution
    cp /etc/resolv.conf "$MOUNT_DIR/etc/resolv.conf"
    
    success "Chroot environment ready"
}

# Install PocketCloud in chroot
install_pocketcloud() {
    log "Installing PocketCloud in chroot..."
    
    # Copy project files to image
    mkdir -p "$MOUNT_DIR/opt/pocketcloud"
    rsync -av --exclude='.git' --exclude='node_modules' --exclude='build' \
        "$PROJECT_ROOT/" "$MOUNT_DIR/opt/pocketcloud/"
    
    # Create installation script for chroot
    cat > "$MOUNT_DIR/tmp/install-pocketcloud.sh" << 'EOF'
#!/bin/bash
set -euo pipefail

cd /opt/pocketcloud

# Update package lists
apt-get update

# Run setup scripts
echo "Running network setup..."
bash scripts/setup-network.sh

echo "Installing Node.js..."
bash scripts/setup-node.sh

echo "Setting up application..."
bash scripts/setup-app.sh

echo "Configuring services..."
bash scripts/setup-services.sh

echo "Optimizing Pi..."
bash scripts/optimize-pi.sh

echo "Setting up GPIO..."
bash scripts/setup-gpio.sh

# Set ownership
chown -R pocketcloud:pocketcloud /opt/pocketcloud

echo "PocketCloud installation complete"
EOF

    chmod +x "$MOUNT_DIR/tmp/install-pocketcloud.sh"
    
    # Run installation in chroot
    chroot "$MOUNT_DIR" /tmp/install-pocketcloud.sh
    
    success "PocketCloud installed"
}

# Setup first boot configuration
setup_first_boot() {
    log "Setting up first boot configuration..."
    
    # Create first boot flag
    touch "$MOUNT_DIR/boot/pocketcloud-firstboot"
    
    # Create first boot script
    cat > "$MOUNT_DIR/usr/local/bin/pocketcloud-firstboot.sh" << 'EOF'
#!/bin/bash
# PocketCloud First Boot Setup

set -euo pipefail

LOG_FILE="/var/log/pocketcloud-firstboot.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "$(date): Starting PocketCloud first boot setup..."

# Generate new SSH host keys
echo "Generating SSH host keys..."
rm -f /etc/ssh/ssh_host_*
ssh-keygen -A

# Generate new machine-id
echo "Generating machine-id..."
rm -f /etc/machine-id /var/lib/dbus/machine-id
systemd-machine-id-setup

# Get MAC address for unique WiFi name
MAC=$(cat /sys/class/net/wlan0/address | tr -d ':' | tail -c 5 | tr '[:lower:]' '[:upper:]')
WIFI_NAME="PocketCloud-${MAC}"

# Generate random WiFi password
WIFI_PASSWORD=$(openssl rand -base64 12 | tr -d "=+/" | cut -c1-12)

echo "WiFi Name: $WIFI_NAME"
echo "WiFi Password: $WIFI_PASSWORD"

# Update hostapd configuration
sed -i "s/ssid=PocketCloud/ssid=$WIFI_NAME/" /etc/hostapd/hostapd.conf
sed -i "s/wpa_passphrase=.*/wpa_passphrase=$WIFI_PASSWORD/" /etc/hostapd/hostapd.conf

# Wait for USB drive to be connected
echo "Waiting for USB storage device..."
timeout=60
while [ $timeout -gt 0 ]; do
    if [ -e /dev/sda1 ] || [ -e /dev/sda ]; then
        echo "USB storage detected"
        break
    fi
    sleep 1
    ((timeout--))
done

if [ $timeout -eq 0 ]; then
    echo "Warning: No USB storage detected, using SD card storage"
else
    # Format USB drive if needed
    if ! blkid /dev/sda1 &>/dev/null; then
        echo "Formatting USB drive..."
        parted /dev/sda --script mklabel gpt
        parted /dev/sda --script mkpart primary ext4 0% 100%
        mkfs.ext4 -F /dev/sda1
    fi
    
    # Mount USB drive
    mkdir -p /mnt/pocketcloud
    mount /dev/sda1 /mnt/pocketcloud
    
    # Create directory structure
    mkdir -p /mnt/pocketcloud/{files,db,logs,cache}
    chown -R pocketcloud:pocketcloud /mnt/pocketcloud
    
    # Add to fstab
    echo "/dev/sda1 /mnt/pocketcloud ext4 defaults,nofail 0 2" >> /etc/fstab
fi

# Set setup mode for first run
echo "SETUP_MODE=true" >> /opt/pocketcloud/.env

# Save connection info for display
cat > /boot/pocketcloud-info.txt << EOL
PocketCloud Drive Ready!

WiFi Network: $WIFI_NAME
Password: $WIFI_PASSWORD
Web Interface: http://192.168.4.1
Admin Panel: http://192.168.4.1/admin

Connect any device to the WiFi network above,
then open the web interface in your browser.
EOL

# Remove first boot flag
rm -f /boot/pocketcloud-firstboot

echo "$(date): First boot setup complete, rebooting..."
reboot
EOF

    chmod +x "$MOUNT_DIR/usr/local/bin/pocketcloud-firstboot.sh"
    
    # Create systemd service for first boot
    cat > "$MOUNT_DIR/etc/systemd/system/pocketcloud-firstboot.service" << 'EOF'
[Unit]
Description=PocketCloud First Boot Setup
After=multi-user.target
ConditionPathExists=/boot/pocketcloud-firstboot

[Service]
Type=oneshot
ExecStart=/usr/local/bin/pocketcloud-firstboot.sh
StandardOutput=journal+console
StandardError=journal+console

[Install]
WantedBy=multi-user.target
EOF

    # Enable first boot service
    chroot "$MOUNT_DIR" systemctl enable pocketcloud-firstboot.service
    
    success "First boot configuration complete"
}
# Clean up image
cleanup_image() {
    log "Cleaning up image..."
    
    # Clear logs
    chroot "$MOUNT_DIR" find /var/log -type f -exec truncate -s 0 {} \;
    
    # Clear bash history
    rm -f "$MOUNT_DIR/root/.bash_history"
    rm -f "$MOUNT_DIR/home"/*/.bash_history
    
    # Clear SSH host keys (will be regenerated on first boot)
    rm -f "$MOUNT_DIR/etc/ssh/ssh_host_"*
    
    # Clear machine-id (will be regenerated on first boot)
    truncate -s 0 "$MOUNT_DIR/etc/machine-id"
    rm -f "$MOUNT_DIR/var/lib/dbus/machine-id"
    
    # Clean package cache
    chroot "$MOUNT_DIR" apt-get clean
    chroot "$MOUNT_DIR" apt-get autoremove -y
    
    # Remove temporary files
    rm -rf "$MOUNT_DIR/tmp"/*
    rm -rf "$MOUNT_DIR/var/tmp"/*
    
    # Remove qemu static if copied
    if [[ $(uname -m) != "aarch64" ]]; then
        rm -f "$MOUNT_DIR/usr/bin/qemu-aarch64-static"
    fi
    
    success "Image cleaned up"
}

# Unmount image
unmount_image() {
    log "Unmounting image..."
    
    # Unmount filesystems
    umount "$MOUNT_DIR/dev/pts" || true
    umount "$MOUNT_DIR/dev" || true
    umount "$MOUNT_DIR/sys" || true
    umount "$MOUNT_DIR/proc" || true
    umount "$MOUNT_DIR/boot" || true
    umount "$MOUNT_DIR" || true
    
    # Detach loopback device
    if [[ -f "$BUILD_DIR/loop_device" ]]; then
        local loop_device=$(cat "$BUILD_DIR/loop_device")
        losetup -d "$loop_device"
        rm -f "$BUILD_DIR/loop_device"
    fi
    
    success "Image unmounted"
}

# Shrink and compress image
finalize_image() {
    log "Finalizing image..."
    
    # Shrink image to minimum size
    local last_sector=$(parted "$IMAGE_DIR/$OUTPUT_IMAGE" unit s print | grep "^ 2" | awk '{print $3}' | sed 's/s//')
    local new_size=$(((last_sector + 1) * 512))
    
    truncate -s "$new_size" "$IMAGE_DIR/$OUTPUT_IMAGE"
    
    # Compress image
    log "Compressing image..."
    xz --threads=0 -9 "$IMAGE_DIR/$OUTPUT_IMAGE"
    
    # Generate checksums
    cd "$IMAGE_DIR"
    sha256sum "${OUTPUT_IMAGE}.xz" > "${OUTPUT_IMAGE}.xz.sha256"
    
    success "Image finalized: ${OUTPUT_IMAGE}.xz"
    
    # Display final info
    local final_size=$(du -h "$IMAGE_DIR/${OUTPUT_IMAGE}.xz" | cut -f1)
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 PocketCloud Drive Image Build Complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 Image: ${OUTPUT_IMAGE}.xz"
    echo "📏 Size: $final_size"
    echo "📍 Location: $IMAGE_DIR/${OUTPUT_IMAGE}.xz"
    echo "🔐 SHA256: $IMAGE_DIR/${OUTPUT_IMAGE}.xz.sha256"
    echo
    echo "Flash this image to a 32GB+ microSD card (Class 10/A1 minimum, A2 recommended)"
    echo "Use Balena Etcher or similar tool for flashing"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Cleanup on exit
cleanup_on_exit() {
    if [[ -d "$MOUNT_DIR" ]]; then
        unmount_image
    fi
}

trap cleanup_on_exit EXIT

# Main execution
main() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🥧 PocketCloud Drive Image Builder"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Version: $POCKETCLOUD_VERSION"
    echo "Base OS: Raspberry Pi OS Lite 64-bit ($PI_OS_VERSION)"
    echo "Output: $OUTPUT_IMAGE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    
    check_dependencies
    download_base_image
    prepare_image
    mount_image
    setup_chroot
    install_pocketcloud
    setup_first_boot
    cleanup_image
    unmount_image
    finalize_image
}

# Run main function
main "$@"