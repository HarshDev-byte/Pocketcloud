#!/bin/bash

# PocketCloud Network Watchdog
# Monitors network status and performs self-healing operations

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
WATCH_INTERVAL=60
DB_PATH="/opt/pocketcloud/backend/data/storage.db"
NETWORK_MODE_SCRIPT="/opt/pocketcloud/scripts/network-mode.sh"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
    logger -t pocketcloud-network-watch "INFO: $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
    logger -t pocketcloud-network-watch "SUCCESS: $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
    logger -t pocketcloud-network-watch "WARNING: $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
    logger -t pocketcloud-network-watch "ERROR: $1"
}

# Signal handler for graceful shutdown
cleanup() {
    log_info "Network watchdog shutting down"
    exit 0
}
trap cleanup SIGINT SIGTERM

# Check if network mode script exists
if [[ ! -x "$NETWORK_MODE_SCRIPT" ]]; then
    log_error "Network mode script not found or not executable: $NETWORK_MODE_SCRIPT"
    exit 1
fi

# Get current network configuration from database
get_network_config() {
    if [[ -f "$DB_PATH" ]]; then
        sqlite3 "$DB_PATH" "SELECT mode, hotspot_ssid FROM network_config ORDER BY id DESC LIMIT 1;" 2>/dev/null || echo "hotspot|PocketCloud"
    else
        echo "hotspot|PocketCloud"
    fi
}

# Update ethernet status in database
update_ethernet_status() {
    local connected="$1"
    local ip="$2"
    
    if [[ -f "$DB_PATH" ]]; then
        # This would require a proper database schema for ethernet status
        # For now, just log the status change
        log_info "Ethernet status: connected=$connected, ip=$ip"
    fi
}

# Check if hotspot should be active and verify its status
check_hotspot_mode() {
    local config_mode="$1"
    
    if [[ "$config_mode" == "hotspot" ]]; then
        # Check if hostapd is running
        if ! systemctl is-active --quiet hostapd; then
            log_warning "Hotspot mode configured but hostapd not running"
            return 1
        fi
        
        # Check if wlan0 has the correct IP
        local wlan0_ip
        wlan0_ip=$(ip addr show wlan0 2>/dev/null | grep "inet 192.168.4.1" | awk '{print $2}' | cut -d'/' -f1 || echo "")
        
        if [[ "$wlan0_ip" != "192.168.4.1" ]]; then
            log_warning "Hotspot mode configured but wlan0 does not have IP 192.168.4.1 (current: $wlan0_ip)"
            return 1
        fi
        
        # Check if dnsmasq is running
        if ! systemctl is-active --quiet dnsmasq; then
            log_warning "Hotspot mode configured but dnsmasq not running"
            return 1
        fi
        
        return 0
    fi
    
    return 0
}

# Check WiFi client mode status
check_client_mode() {
    local config_mode="$1"
    
    if [[ "$config_mode" == "client" ]]; then
        # Check if wlan0 has an IP (not 192.168.4.1)
        local wlan0_ip
        wlan0_ip=$(ip addr show wlan0 2>/dev/null | grep "inet " | grep -v "192.168.4.1" | awk '{print $2}' | cut -d'/' -f1 | head -n1 || echo "")
        
        if [[ -z "$wlan0_ip" ]]; then
            log_warning "Client mode configured but wlan0 has no IP address"
            return 1
        fi
        
        # Check if wpa_supplicant is running
        if ! pgrep wpa_supplicant >/dev/null; then
            log_warning "Client mode configured but wpa_supplicant not running"
            return 1
        fi
        
        return 0
    fi
    
    return 0
}

# Check ethernet connection status
check_ethernet_status() {
    local eth0_ip
    local eth0_connected="false"
    
    # Check if eth0 exists and has an IP
    if ip link show eth0 >/dev/null 2>&1; then
        eth0_ip=$(ip addr show eth0 2>/dev/null | grep "inet " | awk '{print $2}' | cut -d'/' -f1 | head -n1 || echo "")
        
        if [[ -n "$eth0_ip" ]]; then
            eth0_connected="true"
        fi
    fi
    
    echo "$eth0_connected|$eth0_ip"
}

# Self-heal network configuration
self_heal() {
    local config_mode="$1"
    local hotspot_ssid="$2"
    
    log_warning "Attempting to self-heal network configuration"
    
    case "$config_mode" in
        "hotspot")
            log_info "Restoring hotspot mode"
            if "$NETWORK_MODE_SCRIPT" hotspot; then
                log_success "Hotspot mode restored successfully"
            else
                log_error "Failed to restore hotspot mode"
            fi
            ;;
        "client")
            log_warning "Client mode healing not implemented - manual intervention required"
            ;;
        *)
            log_warning "Unknown network mode: $config_mode"
            ;;
    esac
}

# Main monitoring loop
main() {
    log_info "PocketCloud Network Watchdog starting (interval: ${WATCH_INTERVAL}s)"
    
    local last_ethernet_status=""
    
    while true; do
        # Get current configuration
        local config_line
        config_line=$(get_network_config)
        local config_mode
        config_mode=$(echo "$config_line" | cut -d'|' -f1)
        local hotspot_ssid
        hotspot_ssid=$(echo "$config_line" | cut -d'|' -f2)
        
        # Check hotspot mode
        if ! check_hotspot_mode "$config_mode"; then
            self_heal "$config_mode" "$hotspot_ssid"
        fi
        
        # Check client mode
        if ! check_client_mode "$config_mode"; then
            log_warning "Client mode issues detected - may need manual intervention"
        fi
        
        # Check ethernet status
        local ethernet_status
        ethernet_status=$(check_ethernet_status)
        local ethernet_connected
        ethernet_connected=$(echo "$ethernet_status" | cut -d'|' -f1)
        local ethernet_ip
        ethernet_ip=$(echo "$ethernet_status" | cut -d'|' -f2)
        
        # Log ethernet status changes
        if [[ "$ethernet_status" != "$last_ethernet_status" ]]; then
            if [[ "$ethernet_connected" == "true" ]]; then
                log_success "Ethernet connected: $ethernet_ip"
            else
                log_info "Ethernet disconnected"
            fi
            
            update_ethernet_status "$ethernet_connected" "$ethernet_ip"
            last_ethernet_status="$ethernet_status"
        fi
        
        # Sleep until next check
        sleep "$WATCH_INTERVAL"
    done
}

# Start the watchdog
main "$@"