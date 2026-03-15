#!/bin/bash
set -euo pipefail

# PocketCloud Health Check Script
# Verifies all components are working correctly

STORAGE_DIR="/mnt/pocketcloud"
FAILED_CHECKS=0

print_ok()   { echo -e "\033[1;32m✓\033[0m $1"; }
print_err()  { echo -e "\033[1;31m✗\033[0m $1"; ((FAILED_CHECKS++)); }
print_warn() { echo -e "\033[1;33m⚠\033[0m $1"; }

echo "Running PocketCloud health check..."

# Check USB drive mounted
if mountpoint -q "$STORAGE_DIR"; then
    print_ok "USB drive mounted at $STORAGE_DIR"
else
    print_err "USB drive not mounted at $STORAGE_DIR"
fi

# Check disk space (minimum 5GB free)
if [[ -d "$STORAGE_DIR" ]]; then
    AVAILABLE_KB=$(df "$STORAGE_DIR" | awk 'NR==2 {print $4}')
    AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))
    
    if [[ $AVAILABLE_GB -ge 5 ]]; then
        print_ok "Disk space: ${AVAILABLE_GB}GB available"
    else
        print_err "Low disk space: only ${AVAILABLE_GB}GB available (minimum 5GB required)"
    fi
fi

# Check backend API health
if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
    print_ok "Backend API responding"
else
    print_err "Backend API not responding"
fi

# Check frontend served
if curl -sf http://localhost:3000 >/dev/null 2>&1; then
    print_ok "Frontend served"
else
    print_err "Frontend not served"
fi
# Check WiFi hotspot
if ip addr show wlan0 | grep -q "192.168.4.1"; then
    print_ok "WiFi hotspot active (192.168.4.1)"
else
    print_warn "WiFi hotspot not active (may be in client mode)"
fi

# Check database accessible
if [[ -f "$STORAGE_DIR/db/storage.db" ]]; then
    if sqlite3 "$STORAGE_DIR/db/storage.db" "SELECT 1;" >/dev/null 2>&1; then
        print_ok "Database accessible"
    else
        print_err "Database not accessible"
    fi
else
    print_err "Database file not found"
fi

# Check CPU temperature
if [[ -f /sys/class/thermal/thermal_zone0/temp ]]; then
    TEMP_MILLIC=$(cat /sys/class/thermal/thermal_zone0/temp)
    TEMP_C=$((TEMP_MILLIC / 1000))
    
    if [[ $TEMP_C -lt 80 ]]; then
        print_ok "CPU temperature: ${TEMP_C}°C"
    else
        print_err "CPU temperature too high: ${TEMP_C}°C (max 80°C)"
    fi
fi

# Check systemd services
SERVICES=("pocketcloud-backend" "pocketcloud-network-watch" "pocketcloud-cleanup.timer")

for service in "${SERVICES[@]}"; do
    if systemctl is-active --quiet "$service"; then
        print_ok "Service $service is active"
    else
        print_err "Service $service is not active"
    fi
done
# Check mDNS resolution
if avahi-resolve -n pocketcloud.local >/dev/null 2>&1; then
    print_ok "mDNS resolution working (pocketcloud.local)"
else
    print_warn "mDNS resolution not working"
fi

# Summary
echo
if [[ $FAILED_CHECKS -eq 0 ]]; then
    print_ok "All health checks passed!"
    exit 0
else
    print_err "$FAILED_CHECKS health check(s) failed"
    exit 1
fi