#!/bin/bash

# PocketCloud WiFi Connection Script
# Secure WiFi client connection with proper error handling and fallback

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Exit codes
EXIT_SUCCESS=0
EXIT_AUTH_FAILED=1
EXIT_NETWORK_NOT_FOUND=2
EXIT_TIMEOUT=3
EXIT_UNKNOWN_ERROR=4

# Configuration
CONNECTION_TIMEOUT=30
NETWORK_MODE_SCRIPT="/opt/pocketcloud/scripts/network-mode.sh"

# Logging functions (to stderr to keep stdout clean for IP output)
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
    log_warning "Connection interrupted"
    
    # Clean up any temporary files
    rm -f /tmp/wpa_supplicant_$$.conf
    
    # Fallback to hotspot mode
    fallback_to_hotspot
    
    exit 130
}
trap cleanup SIGINT SIGTERM

# Fallback to hotspot mode
fallback_to_hotspot() {
    log_warning "Falling back to hotspot mode"
    
    if [[ -x "$NETWORK_MODE_SCRIPT" ]]; then
        "$NETWORK_MODE_SCRIPT" hotspot >/dev/null 2>&1 || true
    fi
}

# Validate input parameters
validate_input() {
    local ssid="$1"
    local password="$2"
    
    # Check SSID length
    if [[ ${#ssid} -eq 0 || ${#ssid} -gt 32 ]]; then
        log_error "SSID must be 1-32 characters"
        return 1
    fi
    
    # Check password length
    if [[ ${#password} -lt 8 || ${#password} -gt 63 ]]; then
        log_error "Password must be 8-63 characters"
        return 1
    fi
    
    # Check for dangerous characters (basic sanitization)
    if [[ "$ssid" =~ [\"\'\\] ]] || [[ "$password" =~ [\"\'\\] ]]; then
        log_error "SSID and password cannot contain quotes or backslashes"
        return 1
    fi
    
    return 0
}

# Check if network is available
check_network_available() {
    local ssid="$1"
    
    log_info "Scanning for network: $ssid"
    
    # Scan for networks
    local scan_result
    if scan_result=$(iwlist wlan0 scan 2>/dev/null | grep "ESSID:\"$ssid\""); then
        log_info "Network found: $ssid"
        return 0
    else
        log_error "Network not found: $ssid"
        return 1
    fi
}

# Create wpa_supplicant configuration
create_wpa_config() {
    local ssid="$1"
    local password="$2"
    local config_file="$3"
    
    log_info "Creating wpa_supplicant configuration"
    
    # Create secure temporary config file
    umask 077
    cat > "$config_file" << EOF
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=US

network={
    ssid="$ssid"
    psk="$password"
    key_mgmt=WPA-PSK
    priority=1
}
EOF
    
    # Ensure proper permissions
    chmod 600 "$config_file"
}

# Connect to WiFi network
connect_wifi() {
    local ssid="$1"
    local password="$2"
    
    log_info "Connecting to WiFi network: $ssid"
    
    # Stop any existing network services
    log_info "Stopping existing network services"
    systemctl stop hostapd 2>/dev/null || true
    systemctl stop dnsmasq 2>/dev/null || true
    pkill wpa_supplicant 2>/dev/null || true
    pkill dhclient 2>/dev/null || true
    
    # Flush existing IP configuration
    ip addr flush dev wlan0 2>/dev/null || true
    
    # Create temporary wpa_supplicant config
    local wpa_config="/tmp/wpa_supplicant_$$.conf"
    create_wpa_config "$ssid" "$password" "$wpa_config"
    
    # Start wpa_supplicant
    log_info "Starting wpa_supplicant"
    if ! wpa_supplicant -B -i wlan0 -c "$wpa_config" -P /var/run/wpa_supplicant.pid; then
        log_error "Failed to start wpa_supplicant"
        rm -f "$wpa_config"
        return $EXIT_AUTH_FAILED
    fi
    
    # Wait for connection
    log_info "Waiting for WiFi connection"
    local count=0
    local connected=false
    
    while [[ $count -lt 15 ]]; do
        if wpa_cli -i wlan0 status 2>/dev/null | grep -q "wpa_state=COMPLETED"; then
            connected=true
            break
        fi
        sleep 1
        ((count++))
    done
    
    if [[ "$connected" != "true" ]]; then
        log_error "WiFi authentication failed or timed out"
        pkill wpa_supplicant 2>/dev/null || true
        rm -f "$wpa_config"
        return $EXIT_AUTH_FAILED
    fi
    
    log_success "WiFi connected successfully"
    
    # Request DHCP lease
    log_info "Requesting DHCP lease"
    if ! timeout 15 dhclient wlan0; then
        log_error "Failed to obtain DHCP lease"
        pkill wpa_supplicant 2>/dev/null || true
        rm -f "$wpa_config"
        return $EXIT_TIMEOUT
    fi
    
    # Wait for IP address
    log_info "Waiting for IP address"
    local ip=""
    count=0
    
    while [[ $count -lt $CONNECTION_TIMEOUT ]]; do
        ip=$(ip addr show wlan0 | grep "inet " | awk '{print $2}' | cut -d'/' -f1 | head -n1 || echo "")
        if [[ -n "$ip" && "$ip" != "192.168.4.1" ]]; then
            break
        fi
        sleep 1
        ((count++))
    done
    
    # Clean up config file
    rm -f "$wpa_config"
    
    if [[ -n "$ip" && "$ip" != "192.168.4.1" ]]; then
        log_success "IP address obtained: $ip"
        echo "$ip"  # Output IP to stdout for caller
        return $EXIT_SUCCESS
    else
        log_error "Timeout waiting for IP address"
        pkill wpa_supplicant 2>/dev/null || true
        return $EXIT_TIMEOUT
    fi
}

# Usage function
usage() {
    echo "Usage: $0 <SSID> <PASSWORD>" >&2
    echo >&2
    echo "Connect to a WiFi network with automatic fallback to hotspot mode." >&2
    echo >&2
    echo "Exit codes:" >&2
    echo "  0 - Success (IP address printed to stdout)" >&2
    echo "  1 - Authentication failed" >&2
    echo "  2 - Network not found" >&2
    echo "  3 - Timeout getting IP address" >&2
    echo "  4 - Unknown error" >&2
    echo >&2
    exit $EXIT_UNKNOWN_ERROR
}

# Main function
main() {
    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit $EXIT_UNKNOWN_ERROR
    fi
    
    # Check arguments
    if [[ $# -ne 2 ]]; then
        log_error "Invalid number of arguments"
        usage
    fi
    
    local ssid="$1"
    local password="$2"
    
    # Validate input
    if ! validate_input "$ssid" "$password"; then
        exit $EXIT_UNKNOWN_ERROR
    fi
    
    # Check if network is available
    if ! check_network_available "$ssid"; then
        fallback_to_hotspot
        exit $EXIT_NETWORK_NOT_FOUND
    fi
    
    # Attempt connection
    local exit_code
    if connect_wifi "$ssid" "$password"; then
        exit_code=$EXIT_SUCCESS
    else
        exit_code=$?
    fi
    
    # Fallback to hotspot on any failure
    if [[ $exit_code -ne $EXIT_SUCCESS ]]; then
        fallback_to_hotspot
    fi
    
    exit $exit_code
}

# Run main function with all arguments
main "$@"