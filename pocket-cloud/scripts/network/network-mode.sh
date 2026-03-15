#!/bin/bash

# PocketCloud Network Mode Switching Script
# Runtime script for switching between hotspot, client, and status modes
# Called by network.service.ts

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Signal handler for graceful shutdown
cleanup() {
    log_warning "Operation interrupted"
    exit 130
}
trap cleanup SIGINT SIGTERM

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

# Usage function
usage() {
    echo "Usage: $0 <hotspot|client|status> [args...]"
    echo
    echo "Commands:"
    echo "  hotspot                    - Switch to hotspot mode"
    echo "  client <ssid> <password>   - Connect to WiFi network"
    echo "  status                     - Show current network status (JSON)"
    echo
    exit 1
}

# Sanitize input for shell safety
sanitize_input() {
    local input="$1"
    # Remove any characters that could be dangerous in shell context
    echo "$input" | sed 's/[^a-zA-Z0-9._-]//g'
}

# Get current hotspot SSID from config
get_hotspot_ssid() {
    if [[ -f /etc/hostapd/hostapd.conf ]]; then
        grep "^ssid=" /etc/hostapd/hostapd.conf | cut -d'=' -f2 || echo "PocketCloud"
    else
        echo "PocketCloud"
    fi
}

# Switch to hotspot mode
switch_to_hotspot() {
    log_info "Switching to hotspot mode..."
    
    # Kill any running wpa_supplicant processes
    pkill wpa_supplicant || true
    
    # Stop dhclient
    pkill dhclient || true
    
    # Flush wlan0 IP addresses
    ip addr flush dev wlan0 || true
    
    # Set static IP for hotspot
    ip addr add 192.168.4.1/24 dev wlan0 || true
    
    # Start hostapd
    systemctl start hostapd
    
    # Start dnsmasq
    systemctl start dnsmasq
    
    # Get SSID for output
    local ssid
    ssid=$(get_hotspot_ssid)
    
    log_success "Hotspot active: $ssid"
    echo "Hotspot active: $ssid"
}

# Connect to WiFi client network
connect_to_client() {
    local ssid="$1"
    local password="$2"
    
    log_info "Connecting to WiFi network: $ssid"
    
    # Stop hotspot services
    systemctl stop hostapd || true
    systemctl stop dnsmasq || true
    
    # Flush wlan0 IP addresses
    ip addr flush dev wlan0 || true
    
    # Create wpa_supplicant configuration
    local wpa_config="/tmp/wpa_supplicant_$$.conf"
    cat > "$wpa_config" << EOF
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=US

network={
    ssid="$ssid"
    psk="$password"
    key_mgmt=WPA-PSK
}
EOF
    
    # Start wpa_supplicant
    wpa_supplicant -B -i wlan0 -c "$wpa_config" || {
        log_error "Failed to start wpa_supplicant"
        rm -f "$wpa_config"
        return 1
    }
    
    # Request DHCP lease
    dhclient wlan0 || {
        log_error "Failed to get DHCP lease"
        pkill wpa_supplicant || true
        rm -f "$wpa_config"
        return 2
    }
    
    # Wait for IP address (30 second timeout)
    local timeout=30
    local count=0
    local ip=""
    
    while [[ $count -lt $timeout ]]; do
        ip=$(ip addr show wlan0 | grep "inet " | awk '{print $2}' | cut -d'/' -f1 | head -n1)
        if [[ -n "$ip" ]]; then
            break
        fi
        sleep 1
        ((count++))
    done
    
    # Clean up temp config
    rm -f "$wpa_config"
    
    if [[ -n "$ip" ]]; then
        log_success "Connected to $ssid with IP: $ip"
        echo "$ip"
        return 0
    else
        log_error "Timeout waiting for IP address"
        pkill wpa_supplicant || true
        return 3
    fi
}

# Get network status as JSON
get_network_status() {
    local hotspot_active="false"
    local hotspot_ssid=""
    local wifi_connected="false"
    local wifi_ssid=""
    local wifi_ip=""
    local ethernet_connected="false"
    local ethernet_ip=""
    
    # Check hotspot status
    if systemctl is-active --quiet hostapd; then
        hotspot_active="true"
        hotspot_ssid=$(get_hotspot_ssid)
    fi
    
    # Check WiFi client status
    local wlan0_ip
    wlan0_ip=$(ip addr show wlan0 2>/dev/null | grep "inet " | awk '{print $2}' | cut -d'/' -f1 | head -n1 || echo "")
    if [[ -n "$wlan0_ip" && "$wlan0_ip" != "192.168.4.1" ]]; then
        wifi_connected="true"
        wifi_ip="$wlan0_ip"
        
        # Try to get SSID from wpa_supplicant
        if command -v wpa_cli >/dev/null 2>&1; then
            wifi_ssid=$(wpa_cli -i wlan0 status 2>/dev/null | grep "^ssid=" | cut -d'=' -f2 || echo "")
        fi
    fi
    
    # Check ethernet status
    local eth0_ip
    eth0_ip=$(ip addr show eth0 2>/dev/null | grep "inet " | awk '{print $2}' | cut -d'/' -f1 | head -n1 || echo "")
    if [[ -n "$eth0_ip" ]]; then
        ethernet_connected="true"
        ethernet_ip="$eth0_ip"
    fi
    
    # Output JSON
    cat << EOF
{
  "hotspot": {
    "active": $hotspot_active,
    "ssid": "$hotspot_ssid"
  },
  "wifi": {
    "connected": $wifi_connected,
    "ssid": "$wifi_ssid",
    "ip": "$wifi_ip"
  },
  "ethernet": {
    "connected": $ethernet_connected,
    "ip": "$ethernet_ip"
  }
}
EOF
}

# Main command processing
case "${1:-}" in
    "hotspot")
        switch_to_hotspot
        ;;
    "client")
        if [[ $# -lt 3 ]]; then
            log_error "Client mode requires SSID and password"
            usage
        fi
        
        # Sanitize inputs (but preserve original for actual connection)
        local ssid="$2"
        local password="$3"
        
        # Basic validation
        if [[ ${#ssid} -eq 0 || ${#ssid} -gt 32 ]]; then
            log_error "SSID must be 1-32 characters"
            exit 4
        fi
        
        if [[ ${#password} -lt 8 || ${#password} -gt 63 ]]; then
            log_error "Password must be 8-63 characters"
            exit 4
        fi
        
        # Attempt connection
        if ! connect_to_client "$ssid" "$password"; then
            log_warning "WiFi connection failed, falling back to hotspot mode"
            switch_to_hotspot
            exit $?
        fi
        ;;
    "status")
        get_network_status
        ;;
    *)
        log_error "Unknown command: ${1:-}"
        usage
        ;;
esac