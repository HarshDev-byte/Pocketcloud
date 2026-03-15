#!/bin/bash
# Raspberry Pi 4B Hardware Optimization Script
# Run once after OS install for maximum performance with stability

set -e

echo "🚀 Optimizing Raspberry Pi 4B for Pocket Cloud Drive..."
echo "This will configure stable overclocking, disable unused services, and optimize boot time."

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

# Backup original configs
echo "📋 Creating config backups..."
cp /boot/config.txt /boot/config.txt.backup.$(date +%Y%m%d)
cp /boot/cmdline.txt /boot/cmdline.txt.backup.$(date +%Y%m%d)
cp /etc/systemd/system.conf /etc/systemd/system.conf.backup.$(date +%Y%m%d)

# 1. OVERCLOCK CONFIGURATION
echo "⚡ Configuring stable overclock..."

# Remove any existing overclock settings
sed -i '/# PocketCloud Overclock/,/# End PocketCloud Overclock/d' /boot/config.txt

# Add optimized overclock settings
cat >> /boot/config.txt << 'EOF'

# PocketCloud Overclock - Conservative & Stable
# CPU: 1900MHz, GPU: 600MHz, tested for 24/7 operation
[all]
# CPU overclock (1900MHz - stable for Pi 4B)
over_voltage=4
arm_freq=1900

# GPU overclock (600MHz - stable for media processing)
gpu_freq=600

# Memory allocation (128MB for GPU - good for transcoding)
gpu_mem=128

# microSD speed boost (100MHz - safe for most cards)
dtparam=sd_overclock=100

# USB 3.0 performance optimization
dtoverlay=dwc2,dr_mode=host

# PCIe Gen 2 for maximum USB 3.0 speed
dtparam=pciex1_gen=2

# Disable WiFi power management (better performance)
dtparam=wifi_pwr_mgmt_off=1

# Audio optimization (if using audio features)
dtparam=audio=on
audio_pwm_mode=2

# End PocketCloud Overclock
EOF

echo "✅ Overclock configuration added to /boot/config.txt"

# 2. DISABLE UNUSED SERVICES
echo "🔧 Disabling unused services for faster boot and less RAM usage..."

# Services safe to disable for a headless cloud drive
SERVICES_TO_DISABLE=(
    "bluetooth"
    "avahi-daemon"      # We run our own mDNS
    "triggerhappy"      # GPIO event daemon (not needed)
    "ModemManager"      # Mobile broadband (not needed)
    "wpa_supplicant"    # WiFi management (using NetworkManager)
    "hciuart"          # Bluetooth UART
    "bluealsa"         # Bluetooth audio
    "cups"             # Printing service
    "cups-browsed"     # Printer discovery
)

for service in "${SERVICES_TO_DISABLE[@]}"; do
    if systemctl is-enabled "$service" >/dev/null 2>&1; then
        echo "  Disabling $service..."
        systemctl disable "$service" >/dev/null 2>&1 || true
        systemctl stop "$service" >/dev/null 2>&1 || true
    fi
done

echo "✅ Unused services disabled"

# 3. FASTER BOOT CONFIGURATION
echo "🚀 Configuring faster boot..."

# Optimize kernel command line
CMDLINE_FILE="/boot/cmdline.txt"
CURRENT_CMDLINE=$(cat "$CMDLINE_FILE")

# Remove existing optimizations if present
CMDLINE_CLEAN=$(echo "$CURRENT_CMDLINE" | sed 's/quiet//g' | sed 's/fastboot//g' | sed 's/noswap//g' | sed 's/  */ /g')

# Add boot optimizations
echo "$CMDLINE_CLEAN quiet fastboot noswap" > "$CMDLINE_FILE"

echo "✅ Boot parameters optimized"

# 4. SYSTEMD TIMEOUT OPTIMIZATION
echo "⏱️  Optimizing systemd timeouts..."

# Backup and modify systemd configuration
sed -i 's/#DefaultTimeoutStartSec=90s/DefaultTimeoutStartSec=15s/' /etc/systemd/system.conf
sed -i 's/#DefaultTimeoutStopSec=90s/DefaultTimeoutStopSec=10s/' /etc/systemd/system.conf

# Reload systemd configuration
systemctl daemon-reload

echo "✅ Systemd timeouts optimized"

# 5. MEMORY AND SWAP OPTIMIZATION
echo "💾 Optimizing memory and swap..."

# Disable swap (kills SD card, we have 4GB RAM)
if systemctl is-enabled dphys-swapfile >/dev/null 2>&1; then
    echo "  Disabling swap..."
    dphys-swapfile swapoff >/dev/null 2>&1 || true
    systemctl disable dphys-swapfile >/dev/null 2>&1 || true
fi

# Create sysctl optimizations
cat > /etc/sysctl.d/99-pocketcloud.conf << 'EOF'
# PocketCloud Memory Optimizations

# Disable swap usage (we disabled swap anyway)
vm.swappiness=1

# Huge pages for SQLite performance
vm.nr_hugepages=64

# Dirty page writeback optimization for USB drives
vm.dirty_background_ratio=5
vm.dirty_ratio=10
vm.dirty_expire_centisecs=3000
vm.dirty_writeback_centisecs=500

# Network buffer optimizations
net.core.rmem_default=262144
net.core.rmem_max=16777216
net.core.wmem_default=262144
net.core.wmem_max=16777216
net.core.netdev_max_backlog=5000

# TCP optimizations for file transfers
net.ipv4.tcp_window_scaling=1
net.ipv4.tcp_rmem=4096 65536 16777216
net.ipv4.tcp_wmem=4096 65536 16777216
net.ipv4.tcp_congestion_control=bbr

# File system optimizations
fs.file-max=2097152
EOF

echo "✅ Memory and network optimizations configured"

# 6. USB MOUNT OPTIMIZATION
echo "🔌 Optimizing USB mount options..."

# Create optimized fstab entry template
cat > /etc/pocketcloud-fstab-template << 'EOF'
# PocketCloud USB Drive Mount Options
# Add this line to /etc/fstab for your USB drive:
# UUID=your-drive-uuid /mnt/pocketcloud ext4 defaults,noatime,commit=60,barrier=0 0 2
#
# Options explained:
# - noatime: Don't update access times (faster, less wear)
# - commit=60: Commit changes every 60 seconds (vs default 5)
# - barrier=0: Disable write barriers for better performance (safe with UPS)
EOF

echo "✅ USB mount optimization template created"

# 7. THERMAL MONITORING SETUP
echo "🌡️  Setting up thermal monitoring..."

# Create thermal monitoring script
cat > /usr/local/bin/thermal-monitor.sh << 'EOF'
#!/bin/bash
# Simple thermal monitoring for overclock validation

TEMP_FILE="/sys/class/thermal/thermal_zone0/temp"
LOG_FILE="/var/log/thermal.log"

while true; do
    if [ -f "$TEMP_FILE" ]; then
        TEMP_RAW=$(cat "$TEMP_FILE")
        TEMP_C=$((TEMP_RAW / 1000))
        
        if [ "$TEMP_C" -gt 80 ]; then
            echo "$(date): CRITICAL TEMP: ${TEMP_C}°C" >> "$LOG_FILE"
        elif [ "$TEMP_C" -gt 70 ]; then
            echo "$(date): HIGH TEMP: ${TEMP_C}°C" >> "$LOG_FILE"
        fi
    fi
    
    sleep 30
done
EOF

chmod +x /usr/local/bin/thermal-monitor.sh

# Create systemd service for thermal monitoring
cat > /etc/systemd/system/thermal-monitor.service << 'EOF'
[Unit]
Description=Thermal Monitoring for PocketCloud
After=multi-user.target

[Service]
Type=simple
ExecStart=/usr/local/bin/thermal-monitor.sh
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl enable thermal-monitor.service >/dev/null 2>&1

echo "✅ Thermal monitoring configured"

# 8. READ-ONLY ROOT FILESYSTEM OPTION
echo "💿 Setting up read-only root filesystem option..."

cat > /usr/local/bin/enable-readonly-root.sh << 'EOF'
#!/bin/bash
# Enable read-only root filesystem for SD card longevity
# WARNING: Run this only after system is fully configured

echo "⚠️  This will make the root filesystem read-only!"
echo "   Only /mnt/pocketcloud (USB drive) will remain writable."
echo "   To make changes later, run: sudo mount -o remount,rw /"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Install overlayroot
apt-get update
apt-get install -y overlayroot

# Configure overlayroot
echo 'overlayroot="tmpfs"' >> /etc/overlayroot.conf

echo "✅ Read-only root filesystem will be enabled on next reboot"
echo "   To disable: edit /etc/overlayroot.conf and remove the overlayroot line"
EOF

chmod +x /usr/local/bin/enable-readonly-root.sh

echo "✅ Read-only root filesystem script created at /usr/local/bin/enable-readonly-root.sh"

# 9. PERFORMANCE MONITORING TOOLS
echo "📊 Installing performance monitoring tools..."

# Install essential monitoring tools
apt-get update >/dev/null 2>&1
apt-get install -y sysbench iperf3 htop iotop >/dev/null 2>&1

echo "✅ Performance monitoring tools installed"

# 10. CREATE OPTIMIZATION STATUS SCRIPT
cat > /usr/local/bin/pocketcloud-status.sh << 'EOF'
#!/bin/bash
# PocketCloud Hardware Status Check

echo "🔍 PocketCloud Hardware Status"
echo "=============================="

# CPU frequency
echo "CPU Frequency: $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq | awk '{print $1/1000 " MHz"}')"

# GPU frequency  
echo "GPU Frequency: $(vcgencmd measure_clock core | cut -d= -f2 | awk '{print $1/1000000 " MHz"}')"

# Temperature
TEMP=$(cat /sys/class/thermal/thermal_zone0/temp)
TEMP_C=$((TEMP / 1000))
echo "Temperature: ${TEMP_C}°C"

# Throttling status
THROTTLED=$(vcgencmd get_throttled)
echo "Throttling: $THROTTLED"

# Memory
echo "Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"

# Uptime
echo "Uptime: $(uptime -p)"

# USB drive status
if mountpoint -q /mnt/pocketcloud; then
    echo "USB Drive: Mounted"
    echo "USB Space: $(df -h /mnt/pocketcloud | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
else
    echo "USB Drive: Not mounted"
fi

# Service status
echo "PocketCloud Service: $(systemctl is-active pocketcloud-backend || echo 'not running')"
EOF

chmod +x /usr/local/bin/pocketcloud-status.sh

echo "✅ Status monitoring script created at /usr/local/bin/pocketcloud-status.sh"

# Summary
echo ""
echo "🎉 Raspberry Pi 4B optimization complete!"
echo ""
echo "📋 What was configured:"
echo "   ⚡ CPU overclocked to 1900MHz (stable)"
echo "   🎮 GPU overclocked to 600MHz"
echo "   💾 128MB GPU memory allocation"
echo "   🚀 Faster boot configuration"
echo "   🔧 Unused services disabled"
echo "   💿 Memory and network optimizations"
echo "   🌡️  Thermal monitoring enabled"
echo ""
echo "⚠️  IMPORTANT: Reboot required for changes to take effect!"
echo ""
echo "📊 After reboot, run these commands to verify:"
echo "   sudo /usr/local/bin/pocketcloud-status.sh"
echo "   sudo $(dirname "$0")/benchmark.sh"
echo ""
echo "🔄 To reboot now: sudo reboot"
echo "📖 For more info: cat $(dirname "$0")/../HARDWARE.md"