#!/bin/bash

# RAM Optimization Script for Raspberry Pi 4B
# Optimizes memory usage for PocketCloud Drive performance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== RAM Optimization for Raspberry Pi 4B ===${NC}"
echo "Optimizing memory settings for PocketCloud Drive..."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root${NC}"
    echo "Usage: sudo $0"
    exit 1
fi

# Show current memory info
echo -e "${YELLOW}Current memory status:${NC}"
free -h
echo ""

# 1. Disable swap completely
echo -e "${YELLOW}1. Disabling swap (extends SD card life)${NC}"

# Stop swap
if swapon --show | grep -q "/"; then
    echo "Stopping active swap..."
    swapoff -a
    echo -e "${GREEN}✓${NC} Swap stopped"
else
    echo "No active swap found"
fi

# Disable dphys-swapfile service
if systemctl is-enabled dphys-swapfile >/dev/null 2>&1; then
    echo "Disabling dphys-swapfile service..."
    systemctl stop dphys-swapfile
    systemctl disable dphys-swapfile
    echo -e "${GREEN}✓${NC} dphys-swapfile service disabled"
else
    echo "dphys-swapfile service already disabled"
fi

# Remove swap file if it exists
if [ -f /var/swap ]; then
    echo "Removing swap file..."
    rm -f /var/swap
    echo -e "${GREEN}✓${NC} Swap file removed"
fi

# Comment out swap in fstab
if grep -q "swap" /etc/fstab; then
    echo "Disabling swap in /etc/fstab..."
    sed -i '/swap/s/^/#/' /etc/fstab
    echo -e "${GREEN}✓${NC} Swap disabled in fstab"
fi

echo ""

# 2. Configure huge pages for SQLite performance
echo -e "${YELLOW}2. Configuring huge pages for database performance${NC}"

# Check current huge pages
current_hugepages=$(cat /proc/sys/vm/nr_hugepages)
echo "Current huge pages: $current_hugepages"

# Set huge pages (64 pages = 128MB for SQLite)
if ! grep -q "vm.nr_hugepages" /etc/sysctl.conf; then
    echo "vm.nr_hugepages=64" >> /etc/sysctl.conf
    echo -e "${GREEN}✓${NC} Huge pages configured (64 pages = 128MB)"
else
    echo "Huge pages already configured in sysctl.conf"
fi

# Apply immediately
echo 64 > /proc/sys/vm/nr_hugepages
echo -e "${GREEN}✓${NC} Huge pages applied immediately"

echo ""

# 3. Optimize dirty page writeback for USB drives
echo -e "${YELLOW}3. Optimizing dirty page writeback for USB storage${NC}"

# Lower dirty ratios for better USB drive performance
if ! grep -q "vm.dirty_background_ratio" /etc/sysctl.conf; then
    cat >> /etc/sysctl.conf << EOF

# Dirty page writeback optimization for USB drives
vm.dirty_background_ratio=5
vm.dirty_ratio=10
vm.dirty_writeback_centisecs=500
vm.dirty_expire_centisecs=3000
EOF
    echo -e "${GREEN}✓${NC} Dirty page settings added to sysctl.conf"
else
    echo "Dirty page settings already configured"
fi

# Apply immediately
sysctl -w vm.dirty_background_ratio=5
sysctl -w vm.dirty_ratio=10
sysctl -w vm.dirty_writeback_centisecs=500
sysctl -w vm.dirty_expire_centisecs=3000
echo -e "${GREEN}✓${NC} Dirty page settings applied immediately"

echo ""
# 4. Network buffer optimization
echo -e "${YELLOW}4. Optimizing network buffers${NC}"

if ! grep -q "net.core.rmem_max" /etc/sysctl.conf; then
    cat >> /etc/sysctl.conf << EOF

# Network buffer optimization
net.core.rmem_max=134217728
net.core.wmem_max=134217728
net.core.rmem_default=65536
net.core.wmem_default=65536
net.ipv4.tcp_rmem=4096 65536 134217728
net.ipv4.tcp_wmem=4096 65536 134217728
net.ipv4.tcp_congestion_control=bbr
EOF
    echo -e "${GREEN}✓${NC} Network buffer settings added"
else
    echo "Network buffer settings already configured"
fi

# Apply network settings
sysctl -w net.core.rmem_max=134217728
sysctl -w net.core.wmem_max=134217728
sysctl -w net.core.rmem_default=65536
sysctl -w net.core.wmem_default=65536
echo -e "${GREEN}✓${NC} Network buffer settings applied"

echo ""

# 5. Memory overcommit optimization
echo -e "${YELLOW}5. Configuring memory overcommit${NC}"

if ! grep -q "vm.overcommit_memory" /etc/sysctl.conf; then
    cat >> /etc/sysctl.conf << EOF

# Memory overcommit optimization
vm.overcommit_memory=1
vm.overcommit_ratio=80
vm.swappiness=1
EOF
    echo -e "${GREEN}✓${NC} Memory overcommit settings added"
else
    echo "Memory overcommit settings already configured"
fi

# Apply memory settings
sysctl -w vm.overcommit_memory=1
sysctl -w vm.overcommit_ratio=80
sysctl -w vm.swappiness=1
echo -e "${GREEN}✓${NC} Memory overcommit settings applied"

echo ""

# 6. File system cache optimization
echo -e "${YELLOW}6. Optimizing file system cache${NC}"

if ! grep -q "vm.vfs_cache_pressure" /etc/sysctl.conf; then
    cat >> /etc/sysctl.conf << EOF

# File system cache optimization
vm.vfs_cache_pressure=50
vm.min_free_kbytes=65536
EOF
    echo -e "${GREEN}✓${NC} File system cache settings added"
else
    echo "File system cache settings already configured"
fi

# Apply cache settings
sysctl -w vm.vfs_cache_pressure=50
sysctl -w vm.min_free_kbytes=65536
echo -e "${GREEN}✓${NC} File system cache settings applied"

echo ""

# 7. Create memory monitoring script
echo -e "${YELLOW}7. Creating memory monitoring script${NC}"

cat > /usr/local/bin/memory-monitor << 'EOF'
#!/bin/bash
# Memory monitoring script for PocketCloud Drive

echo "=== Memory Status ==="
free -h

echo ""
echo "=== Top Memory Consumers ==="
ps aux --sort=-%mem | head -10

echo ""
echo "=== Huge Pages Status ==="
grep -E "HugePages|Hugepagesize" /proc/meminfo

echo ""
echo "=== Cache Status ==="
echo "Page cache: $(awk '/^Cached:/ {print $2}' /proc/meminfo) kB"
echo "Buffer cache: $(awk '/^Buffers:/ {print $2}' /proc/meminfo) kB"
echo "Dirty pages: $(awk '/^Dirty:/ {print $2}' /proc/meminfo) kB"

echo ""
echo "=== Memory Pressure ==="
echo "Available: $(awk '/^MemAvailable:/ {print $2}' /proc/meminfo) kB"
echo "Free: $(awk '/^MemFree:/ {print $2}' /proc/meminfo) kB"

if [ -f /proc/pressure/memory ]; then
    echo ""
    echo "=== Memory Pressure (PSI) ==="
    cat /proc/pressure/memory
fi
EOF

chmod +x /usr/local/bin/memory-monitor
echo -e "${GREEN}✓${NC} Memory monitoring script created at /usr/local/bin/memory-monitor"

echo ""

# 8. Show final status
echo -e "${YELLOW}8. Final memory status${NC}"
echo ""
echo "Memory after optimization:"
free -h

echo ""
echo "Huge pages status:"
grep -E "HugePages|Hugepagesize" /proc/meminfo

echo ""
echo -e "${GREEN}=== RAM Optimization Complete ===${NC}"
echo ""
echo "Changes made:"
echo "• Swap completely disabled (extends SD card life)"
echo "• Huge pages configured for SQLite performance (128MB)"
echo "• Dirty page writeback optimized for USB drives"
echo "• Network buffers increased for better throughput"
echo "• Memory overcommit tuned for 4GB RAM"
echo "• File system cache optimized"
echo "• Memory monitoring script installed"
echo ""
echo "To monitor memory usage: memory-monitor"
echo "Settings will persist after reboot."
echo ""
echo -e "${BLUE}Reboot recommended to ensure all settings take effect.${NC}"