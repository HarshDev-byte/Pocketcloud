#!/bin/bash

# Boot Time Analysis Script for Raspberry Pi 4B
# Analyzes boot performance and identifies slow services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Boot Time Analysis Report ===${NC}"
echo "Analyzing system boot performance..."
echo ""

# Check if systemd-analyze is available
if ! command -v systemd-analyze &> /dev/null; then
    echo -e "${RED}Error: systemd-analyze not found${NC}"
    echo "This script requires systemd (should be available on Raspberry Pi OS)"
    exit 1
fi

# 1. Overall boot time
echo -e "${YELLOW}1. Overall Boot Time${NC}"
boot_time=$(systemd-analyze 2>/dev/null || echo "Boot time analysis failed")
echo "$boot_time"

# Extract total time for comparison
total_time=$(echo "$boot_time" | grep -o '[0-9.]*s' | tail -1 | sed 's/s//')
if [ -n "$total_time" ]; then
    if (( $(echo "$total_time < 30" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "${GREEN}✓ EXCELLENT${NC} - Boot time under 30 seconds"
    elif (( $(echo "$total_time < 45" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "${YELLOW}⚠ GOOD${NC} - Boot time under 45 seconds"
    else
        echo -e "${RED}✗ SLOW${NC} - Boot time over 45 seconds (optimization needed)"
    fi
fi

echo ""

# 2. Critical path analysis
echo -e "${YELLOW}2. Critical Path Analysis${NC}"
echo "Services on the critical boot path:"
systemd-analyze critical-chain 2>/dev/null | head -20
echo ""

# 3. Slowest services
echo -e "${YELLOW}3. Slowest Services (Top 20)${NC}"
echo "Services taking the most time to start:"
systemd-analyze blame 2>/dev/null | head -20
echo ""

# 4. PocketCloud service analysis
echo -e "${YELLOW}4. PocketCloud Service Analysis${NC}"
if systemctl list-units --type=service | grep -q pocketcloud; then
    echo "PocketCloud service critical path:"
    systemd-analyze critical-chain pocketcloud-backend.service 2>/dev/null || echo "pocketcloud-backend.service not found"
    echo ""
    
    # Check PocketCloud service timing
    pocketcloud_time=$(systemd-analyze blame 2>/dev/null | grep pocketcloud || echo "No PocketCloud services found")
    if [ -n "$pocketcloud_time" ]; then
        echo "PocketCloud service timings:"
        echo "$pocketcloud_time"
    fi
else
    echo "No PocketCloud services found in systemd"
fi
echo ""

# 5. Boot plot (if available)
echo -e "${YELLOW}5. Boot Timeline${NC}"
if command -v systemd-analyze &> /dev/null; then
    echo "Generating boot timeline plot..."
    
    # Try to generate SVG plot
    if systemd-analyze plot > /tmp/boot-plot.svg 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Boot timeline saved to: /tmp/boot-plot.svg"
        echo "Open this file in a web browser to see detailed boot timeline"
    else
        echo "Could not generate boot plot"
    fi
fi
echo ""

# 6. Service status check
echo -e "${YELLOW}6. Service Status Check${NC}"
echo "Checking status of key services:"

services=("ssh" "networking" "systemd-networkd" "systemd-resolved" "avahi-daemon" "bluetooth" "pocketcloud-backend")

for service in "${services[@]}"; do
    if systemctl list-units --type=service | grep -q "$service"; then
        status=$(systemctl is-active "$service" 2>/dev/null || echo "inactive")
        enabled=$(systemctl is-enabled "$service" 2>/dev/null || echo "disabled")
        
        if [ "$status" = "active" ]; then
            status_color="${GREEN}active${NC}"
        elif [ "$status" = "inactive" ] && [ "$enabled" = "disabled" ]; then
            status_color="${BLUE}disabled${NC}"
        else
            status_color="${RED}$status${NC}"
        fi
        
        printf "  %-20s %s (%s)\n" "$service:" "$status_color" "$enabled"
    fi
done
echo ""

# 7. Failed services
echo -e "${YELLOW}7. Failed Services${NC}"
failed_services=$(systemctl list-units --failed --no-legend 2>/dev/null | wc -l)
if [ "$failed_services" -gt 0 ]; then
    echo -e "${RED}⚠ $failed_services failed service(s) found:${NC}"
    systemctl list-units --failed --no-legend 2>/dev/null
else
    echo -e "${GREEN}✓ No failed services${NC}"
fi
echo ""

# 8. Boot optimization recommendations
echo -e "${YELLOW}8. Boot Optimization Recommendations${NC}"

# Check for common slow services
slow_services=$(systemd-analyze blame 2>/dev/null | head -10 | awk '$1 > "5s" {print $2}' || echo "")

if [ -n "$slow_services" ]; then
    echo "Services taking >5 seconds to start:"
    echo "$slow_services" | while read -r service; do
        echo "  • $service"
        
        # Provide specific recommendations
        case "$service" in
            *bluetooth*)
                echo "    → Consider: sudo systemctl disable bluetooth"
                ;;
            *avahi*)
                echo "    → Consider: sudo systemctl disable avahi-daemon (if using custom mDNS)"
                ;;
            *ModemManager*)
                echo "    → Consider: sudo systemctl disable ModemManager"
                ;;
            *NetworkManager*)
                echo "    → Consider switching to systemd-networkd for faster networking"
                ;;
            *plymouth*)
                echo "    → Consider: sudo systemctl disable plymouth-start"
                ;;
        esac
    done
else
    echo -e "${GREEN}✓ No services taking excessive time${NC}"
fi

echo ""

# 9. Kernel boot parameters check
echo -e "${YELLOW}9. Kernel Boot Parameters${NC}"
if [ -f /boot/cmdline.txt ]; then
    cmdline=$(cat /boot/cmdline.txt)
    echo "Current kernel parameters:"
    echo "$cmdline"
    echo ""
    
    # Check for optimization parameters
    optimizations=()
    if [[ "$cmdline" == *"quiet"* ]]; then
        optimizations+=("quiet")
    fi
    if [[ "$cmdline" == *"fastboot"* ]]; then
        optimizations+=("fastboot")
    fi
    if [[ "$cmdline" == *"noswap"* ]]; then
        optimizations+=("noswap")
    fi
    
    if [ ${#optimizations[@]} -gt 0 ]; then
        echo -e "${GREEN}✓ Boot optimizations found:${NC} ${optimizations[*]}"
    else
        echo -e "${YELLOW}⚠ No boot optimizations detected${NC}"
        echo "Consider adding: quiet fastboot noswap"
    fi
fi

echo ""

# 10. Summary and recommendations
echo -e "${BLUE}=== Boot Analysis Summary ===${NC}"
echo ""

if [ -n "$total_time" ]; then
    echo "Total boot time: ${total_time}s"
    
    if (( $(echo "$total_time < 30" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "${GREEN}Status: EXCELLENT${NC} - No optimization needed"
    elif (( $(echo "$total_time < 45" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "${YELLOW}Status: GOOD${NC} - Minor optimizations possible"
        echo ""
        echo "Quick wins:"
        echo "• Disable unused services (bluetooth, avahi-daemon)"
        echo "• Add 'quiet fastboot' to /boot/cmdline.txt"
        echo "• Check for failed services"
    else
        echo -e "${RED}Status: NEEDS OPTIMIZATION${NC}"
        echo ""
        echo "Recommended actions:"
        echo "• Run: sudo systemctl disable bluetooth avahi-daemon ModemManager"
        echo "• Add 'quiet fastboot noswap' to /boot/cmdline.txt"
        echo "• Investigate services taking >5 seconds"
        echo "• Consider switching to systemd-networkd"
        echo "• Check for hardware issues (slow SD card)"
    fi
fi

echo ""
echo "For detailed analysis, review:"
echo "• Boot plot: /tmp/boot-plot.svg"
echo "• Run: systemd-analyze critical-chain [service-name]"
echo "• Run: journalctl -b to see boot logs"
echo ""
echo "Target: <30s total boot time for optimal PocketCloud performance"