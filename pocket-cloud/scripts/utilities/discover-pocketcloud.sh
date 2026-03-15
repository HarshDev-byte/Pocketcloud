#!/bin/bash

# PocketCloud Device Discovery Client
# Demonstrates the three-method fallback chain for finding PocketCloud devices
# Works on macOS, Linux, Windows (with WSL), and can be adapted for other platforms

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_method() {
    echo -e "${CYAN}[METHOD]${NC} $*"
}

# Configuration
DISCOVERY_TIMEOUT=5
CACHE_FILE="$HOME/.pocketcloud-discovery-cache"
FOUND_DEVICE=""

# Check dependencies
check_dependencies() {
    local missing=()
    
    if ! command -v curl >/dev/null 2>&1; then
        missing+=("curl")
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        missing+=("jq")
    fi
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_warning "Missing optional dependencies: ${missing[*]}"
        log_info "Install them for better functionality:"
        echo "  macOS: brew install ${missing[*]}"
        echo "  Ubuntu: sudo apt install ${missing[*]}"
        echo
    fi
}

# Test if a URL responds with PocketCloud
test_pocketcloud_url() {
    local url="$1"
    local timeout="${2:-$DISCOVERY_TIMEOUT}"
    
    if ! command -v curl >/dev/null 2>&1; then
        return 1
    fi
    
    local response
    if response=$(curl -s --connect-timeout "$timeout" --max-time "$timeout" "$url/api/ping" 2>/dev/null); then
        if echo "$response" | grep -q '"service":"pocketcloud"' 2>/dev/null; then
            FOUND_DEVICE="$url"
            return 0
        fi
    fi
    
    return 1
}

# METHOD 1: mDNS/Bonjour Discovery
discover_mdns() {
    log_method "METHOD 1: mDNS/Bonjour Discovery"
    echo "Trying pocketcloud.local hostname resolution..."
    
    # Try different mDNS resolution methods
    local methods=(
        "http://pocketcloud.local:3000"
        "http://pocketcloud.local"
    )
    
    for url in "${methods[@]}"; do
        echo "  Testing: $url"
        if test_pocketcloud_url "$url" 3; then
            log_success "Found PocketCloud via mDNS: $url"
            return 0
        fi
    done
    
    # Try using avahi-resolve if available
    if command -v avahi-resolve >/dev/null 2>&1; then
        echo "  Using avahi-resolve..."
        if avahi-resolve -n pocketcloud.local >/dev/null 2>&1; then
            local ip
            ip=$(avahi-resolve -n pocketcloud.local | awk '{print $2}')
            if [[ -n "$ip" ]]; then
                echo "  Resolved pocketcloud.local to $ip"
                if test_pocketcloud_url "http://$ip:3000" 3; then
                    log_success "Found PocketCloud via avahi: http://$ip:3000"
                    return 0
                fi
            fi
        fi
    fi
    
    # Try using dns-sd if available (macOS)
    if command -v dns-sd >/dev/null 2>&1; then
        echo "  Using dns-sd (macOS Bonjour)..."
        # This is more complex and would require parsing dns-sd output
        # For now, we'll skip the full implementation
    fi
    
    log_warning "mDNS discovery failed - pocketcloud.local not found"
    return 1
}

# METHOD 2: Fixed IP Discovery  
discover_fixed_ip() {
    log_method "METHOD 2: Fixed IP Discovery"
    echo "Trying known PocketCloud IP addresses..."
    
    local known_ips=(
        "192.168.4.1:3000"
        "192.168.4.1"
        "10.0.0.1:3000"
        "10.0.0.1"
    )
    
    for ip_port in "${known_ips[@]}"; do
        echo "  Testing: http://$ip_port"
        if test_pocketcloud_url "http://$ip_port" 2; then
            log_success "Found PocketCloud at fixed IP: http://$ip_port"
            return 0
        fi
    done
    
    log_warning "Fixed IP discovery failed - no PocketCloud found at known addresses"
    return 1
}

# METHOD 3: Network Scan Discovery
discover_network_scan() {
    log_method "METHOD 3: Network Scan Discovery"
    echo "Scanning local network for PocketCloud devices..."
    
    # Get current network
    local network=""
    if command -v ip >/dev/null 2>&1; then
        # Linux
        network=$(ip route | grep -E "192\.168\.|10\.0\.|172\." | head -1 | awk '{print $1}' | cut -d'/' -f1 | sed 's/\.[0-9]*$//')
    elif command -v route >/dev/null 2>&1; then
        # macOS
        network=$(route -n get default | grep interface | awk '{print $2}' | xargs ifconfig | grep "inet " | grep -E "192\.168\.|10\.0\.|172\." | awk '{print $2}' | cut -d'.' -f1-3)
    fi
    
    if [[ -z "$network" ]]; then
        # Fallback to common networks
        local networks=("192.168.4" "192.168.1" "192.168.0" "10.0.0")
    else
        local networks=("$network")
    fi
    
    for net in "${networks[@]}"; do
        echo "  Scanning network: $net.0/24"
        
        # Scan common PocketCloud IPs first
        local priority_ips=("$net.1" "$net.100" "$net.200")
        for ip in "${priority_ips[@]}"; do
            echo "    Testing: http://$ip:3000"
            if test_pocketcloud_url "http://$ip:3000" 1; then
                log_success "Found PocketCloud via network scan: http://$ip:3000"
                return 0
            fi
        done
        
        # Quick scan of range 2-20 (common DHCP range)
        for i in {2..20}; do
            local ip="$net.$i"
            echo "    Testing: http://$ip:3000"
            if test_pocketcloud_url "http://$ip:3000" 1; then
                log_success "Found PocketCloud via network scan: http://$ip:3000"
                return 0
            fi
        done
    done
    
    log_warning "Network scan failed - no PocketCloud devices found"
    return 1
}

# Load cached discovery result
load_cache() {
    if [[ -f "$CACHE_FILE" ]]; then
        local cached_url
        cached_url=$(cat "$CACHE_FILE")
        if [[ -n "$cached_url" ]]; then
            echo "Testing cached URL: $cached_url"
            if test_pocketcloud_url "$cached_url" 2; then
                log_success "Found PocketCloud using cached URL: $cached_url"
                return 0
            else
                log_info "Cached URL no longer valid, removing cache"
                rm -f "$CACHE_FILE"
            fi
        fi
    fi
    return 1
}

# Save successful discovery to cache
save_cache() {
    if [[ -n "$FOUND_DEVICE" ]]; then
        echo "$FOUND_DEVICE" > "$CACHE_FILE"
        log_info "Cached discovery result: $FOUND_DEVICE"
    fi
}

# Get device information
get_device_info() {
    if [[ -z "$FOUND_DEVICE" ]]; then
        return 1
    fi
    
    echo
    log_info "Getting device information..."
    
    if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
        local info
        if info=$(curl -s --connect-timeout 5 "$FOUND_DEVICE/api/ping" 2>/dev/null); then
            echo "Device Information:"
            echo "=================="
            echo "$info" | jq -r '
                "Name: " + (.name // "Unknown") +
                "\nVersion: " + (.version // "Unknown") +
                "\nFeatures: " + ((.features // []) | join(", ")) +
                "\nUsers: " + (.users | tostring) +
                "\nStorage: " + ((.storage.used // 0) / 1024 / 1024 / 1024 | floor | tostring) + "GB used / " + 
                            ((.storage.total // 0) / 1024 / 1024 / 1024 | floor | tostring) + "GB total" +
                "\nStatus: " + (.status // "Unknown") +
                "\nSetup Required: " + (if .setupRequired then "Yes" else "No" end)
            '
            echo
            echo "Endpoints:"
            echo "$info" | jq -r '.endpoints | to_entries[] | "  " + .key + ": " + .value'
        else
            echo "Could not retrieve device information"
        fi
    else
        echo "Install curl and jq to see detailed device information"
    fi
}

# Manual IP entry fallback
manual_discovery() {
    log_method "METHOD 4: Manual Entry"
    echo "All automatic discovery methods failed."
    echo
    read -p "Enter PocketCloud IP address (or press Enter to skip): " manual_ip
    
    if [[ -n "$manual_ip" ]]; then
        # Add http:// if not present
        if [[ ! "$manual_ip" =~ ^https?:// ]]; then
            manual_ip="http://$manual_ip"
        fi
        
        # Add port if not present
        if [[ ! "$manual_ip" =~ :[0-9]+$ ]]; then
            manual_ip="$manual_ip:3000"
        fi
        
        echo "Testing manual IP: $manual_ip"
        if test_pocketcloud_url "$manual_ip" 5; then
            log_success "Found PocketCloud at manual IP: $manual_ip"
            return 0
        else
            log_error "No PocketCloud found at $manual_ip"
            return 1
        fi
    fi
    
    return 1
}

# Main discovery function
main() {
    echo "PocketCloud Device Discovery"
    echo "============================"
    echo "Searching for PocketCloud devices on the network..."
    echo
    
    check_dependencies
    
    # Try cached result first
    if load_cache; then
        get_device_info
        return 0
    fi
    
    # Try each discovery method in order
    local methods=(
        "discover_mdns"
        "discover_fixed_ip" 
        "discover_network_scan"
        "manual_discovery"
    )
    
    for method in "${methods[@]}"; do
        if $method; then
            save_cache
            get_device_info
            echo
            log_success "Discovery complete! PocketCloud found at: $FOUND_DEVICE"
            echo
            echo "You can now access PocketCloud at:"
            echo "  Web Interface: $FOUND_DEVICE"
            echo "  API Endpoint: $FOUND_DEVICE/api"
            echo
            return 0
        fi
        echo
    done
    
    log_error "Could not find any PocketCloud devices"
    echo
    echo "Troubleshooting:"
    echo "1. Make sure you're connected to the PocketCloud WiFi network"
    echo "2. Check that PocketCloud is running and accessible"
    echo "3. Try connecting to http://192.168.4.1 directly in your browser"
    echo "4. Verify your network configuration"
    
    return 1
}

# Handle command line arguments
case "${1:-discover}" in
    "discover"|"")
        main
        ;;
    "test")
        if [[ -n "${2:-}" ]]; then
            test_pocketcloud_url "$2" 10 && echo "✅ PocketCloud found" || echo "❌ Not a PocketCloud device"
        else
            echo "Usage: $0 test <url>"
        fi
        ;;
    "cache")
        if [[ -f "$CACHE_FILE" ]]; then
            echo "Cached URL: $(cat "$CACHE_FILE")"
        else
            echo "No cached discovery result"
        fi
        ;;
    "clear-cache")
        rm -f "$CACHE_FILE"
        echo "Discovery cache cleared"
        ;;
    "help")
        echo "PocketCloud Discovery Client"
        echo "Usage: $0 [command]"
        echo
        echo "Commands:"
        echo "  discover     Discover PocketCloud devices (default)"
        echo "  test <url>   Test if URL is a PocketCloud device"
        echo "  cache        Show cached discovery result"
        echo "  clear-cache  Clear discovery cache"
        echo "  help         Show this help"
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac