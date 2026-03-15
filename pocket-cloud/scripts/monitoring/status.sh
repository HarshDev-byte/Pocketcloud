#!/bin/bash
# Pocket Cloud Drive - Status Script
# Shows comprehensive system status

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                 Pocket Cloud Drive Status                    ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
}

print_section() {
    echo -e "\n${BLUE}$1${NC}"
    echo "----------------------------------------"
}

get_service_status() {
    local service="$1"
    local status=$(systemctl is-active "$service" 2>/dev/null || echo "inactive")
    local enabled=$(systemctl is-enabled "$service" 2>/dev/null || echo "disabled")
    
    case "$status" in
        "active")
            echo -e "${GREEN}●${NC} $service: ${GREEN}$status${NC} (${enabled})"
            ;;
        "inactive"|"failed")
            echo -e "${RED}●${NC} $service: ${RED}$status${NC} (${enabled})"
            ;;
        *)
            echo -e "${YELLOW}●${NC} $service: ${YELLOW}$status${NC} (${enabled})"
            ;;
    esac
}

show_system_info() {
    print_section "System Information"
    
    echo "Hostname: $(hostname)"
    echo "Uptime: $(uptime -p)"
    echo "Load: $(uptime | awk -F'load average:' '{print $2}')"
    
    # Memory usage
    local mem_info=$(free -h | awk 'NR==2{printf "Used: %s/%s (%.0f%%)", $3,$2,$3*100/$2}')
    echo "Memory: $mem_info"
    
    # CPU temperature (Pi specific)
    if [[ -f /sys/class/thermal/thermal_zone0/temp ]]; then
        local temp=$(($(cat /sys/class/thermal/thermal_zone0/temp) / 1000))
        echo "CPU Temperature: ${temp}°C"
    fi
}

show_network_status() {
    print_section "Network Status"
    
    # WiFi interface
    if ip link show wlan0 >/dev/null 2>&1; then
        local wlan0_status=$(ip link show wlan0 | grep -o "state [A-Z]*" | cut -d' ' -f2)
        echo "WiFi Interface (wlan0): $wlan0_status"
        
        if [[ "$wlan0_status" == "UP" ]]; then
            local ip_addr=$(ip addr show wlan0 | grep "inet " | awk '{print $2}' | head -1)
            echo "WiFi IP Address: ${ip_addr:-"Not assigned"}"
        fi
    else
        echo "WiFi Interface: Not found"
    fi
    
    # Ethernet interface
    if ip link show eth0 >/dev/null 2>&1; then
        local eth0_status=$(ip link show eth0 | grep -o "state [A-Z]*" | cut -d' ' -f2)
        echo "Ethernet Interface (eth0): $eth0_status"
        
        if [[ "$eth0_status" == "UP" ]]; then
            local eth_ip=$(ip addr show eth0 | grep "inet " | awk '{print $2}' | head -1)
            echo "Ethernet IP Address: ${eth_ip:-"Not assigned"}"
        fi
    fi
    
    # Check if hostapd is running
    if systemctl is-active --quiet hostapd; then
        local ssid=$(grep "^ssid=" /etc/hostapd/hostapd.conf 2>/dev/null | cut -d= -f2 || echo "Unknown")
        echo "WiFi Access Point: Active (SSID: $ssid)"
    else
        echo "WiFi Access Point: Inactive"
    fi
}

show_service_status() {
    print_section "Service Status"
    
    # Core services
    get_service_status "pocketcloud-backend.service"
    get_service_status "pocketcloud-frontend.service"
    get_service_status "pocketcloud-watchdog.service"
    get_service_status "pocketcloud-cleanup.timer"
    
    echo
    
    # System services
    get_service_status "mnt-pocketcloud.mount"
    get_service_status "hostapd.service"
    get_service_status "dnsmasq.service"
    get_service_status "nginx.service"
}

show_storage_status() {
    print_section "Storage Status"
    
    # Check if storage is mounted
    if mountpoint -q /mnt/pocketcloud 2>/dev/null; then
        echo -e "${GREEN}●${NC} USB Storage: Mounted"
        
        # Storage usage
        local storage_info=$(df -h /mnt/pocketcloud | awk 'NR==2{printf "%s used of %s (%s)", $3, $2, $5}')
        echo "Usage: $storage_info"
        
        # Available space
        local available=$(df -h /mnt/pocketcloud | awk 'NR==2{print $4}')
        echo "Available: $available"
        
        # Inode usage
        local inode_usage=$(df -i /mnt/pocketcloud | awk 'NR==2{printf "%.1f%%", $3*100/$2}')
        echo "Inodes used: $inode_usage"
        
    else
        echo -e "${RED}●${NC} USB Storage: Not mounted"
    fi
    
    # Database status
    if [[ -f /mnt/pocketcloud/db/storage.db ]]; then
        local db_size=$(ls -lh /mnt/pocketcloud/db/storage.db | awk '{print $5}')
        echo "Database size: $db_size"
    else
        echo "Database: Not found"
    fi
}

show_api_status() {
    print_section "API Status"
    
    # Test backend API
    if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
        echo -e "${GREEN}●${NC} Backend API: Responding"
        
        # Get API health info
        local health_info=$(curl -s http://localhost:3000/api/health 2>/dev/null)
        if command -v jq >/dev/null 2>&1; then
            echo "Status: $(echo "$health_info" | jq -r '.status // "unknown"')"
            echo "Uptime: $(echo "$health_info" | jq -r '.uptime // "unknown"')s"
        fi
    else
        echo -e "${RED}●${NC} Backend API: Not responding"
    fi
    
    # Test frontend
    if curl -sf http://localhost:5173 >/dev/null 2>&1; then
        echo -e "${GREEN}●${NC} Frontend: Responding"
    else
        echo -e "${RED}●${NC} Frontend: Not responding"
    fi
    
    # Test nginx
    if curl -sf http://localhost/ >/dev/null 2>&1; then
        echo -e "${GREEN}●${NC} Web Server: Responding"
    else
        echo -e "${RED}●${NC} Web Server: Not responding"
    fi
}

show_recent_logs() {
    print_section "Recent Activity"
    
    echo "Last 5 backend log entries:"
    sudo journalctl -u pocketcloud-backend.service -n 5 --no-pager -o short 2>/dev/null | sed 's/^/  /' || echo "  No logs available"
    
    echo
    echo "System errors in last hour:"
    sudo journalctl --since "1 hour ago" -p err --no-pager -o short 2>/dev/null | tail -3 | sed 's/^/  /' || echo "  No errors"
}

show_quick_stats() {
    print_section "Quick Statistics"
    
    # File count from database (if available)
    if [[ -f /mnt/pocketcloud/db/storage.db ]]; then
        local file_count=$(sqlite3 /mnt/pocketcloud/db/storage.db "SELECT COUNT(*) FROM files WHERE is_deleted = 0;" 2>/dev/null || echo "unknown")
        echo "Files in database: $file_count"
        
        local folder_count=$(sqlite3 /mnt/pocketcloud/db/storage.db "SELECT COUNT(*) FROM folders WHERE is_deleted = 0;" 2>/dev/null || echo "unknown")
        echo "Folders in database: $folder_count"
        
        local user_count=$(sqlite3 /mnt/pocketcloud/db/storage.db "SELECT COUNT(*) FROM users WHERE is_active = 1;" 2>/dev/null || echo "unknown")
        echo "Active users: $user_count"
    fi
    
    # Process count
    local pocketcloud_processes=$(pgrep -f "pocketcloud\|node.*dist/index.js" | wc -l)
    echo "Pocket Cloud processes: $pocketcloud_processes"
}

show_management_commands() {
    print_section "Management Commands"
    
    echo "Service Control:"
    echo "  pocketcloud start     - Start all services"
    echo "  pocketcloud stop      - Stop all services"
    echo "  pocketcloud restart   - Restart all services"
    echo "  pocketcloud logs      - Follow backend logs"
    echo "  pocketcloud health    - Check API health"
    echo
    echo "Individual Services:"
    echo "  systemctl restart pocketcloud-backend"
    echo "  journalctl -u pocketcloud-backend -f"
    echo
    echo "Maintenance:"
    echo "  /opt/pocketcloud/scripts/cleanup.sh"
    echo "  /opt/pocketcloud/scripts/backup.sh"
}

main() {
    print_header
    
    show_system_info
    show_network_status
    show_service_status
    show_storage_status
    show_api_status
    show_recent_logs
    show_quick_stats
    show_management_commands
    
    echo
    echo -e "${CYAN}Status check completed at $(date)${NC}"
}

main "$@"