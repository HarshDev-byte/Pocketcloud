#!/bin/bash

# PocketCloud Network Mode End-to-End Test
# Tests all three network modes: hotspot, WiFi client, and ethernet

set -e

# Configuration
BASE="http://192.168.4.1"
TIMEOUT=30
PASS=0
FAIL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
    ((PASS++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
    ((FAIL++))
}

# Test function with timeout and error handling
check() {
    local desc="$1"
    shift
    
    log_info "Testing: $desc"
    
    if timeout $TIMEOUT "$@" &>/dev/null; then
        log_success "$desc"
        return 0
    else
        log_error "$desc"
        return 1
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Wait for service to be ready
wait_for_service() {
    local url="$1"
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for service at $url..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            log_success "Service is ready at $url"
            return 0
        fi
        
        sleep 2
        ((attempt++))
    done
    
    log_error "Service not ready after $((max_attempts * 2)) seconds"
    return 1
}

# Test JSON response validity
test_json_response() {
    local url="$1"
    local desc="$2"
    
    if command_exists python3; then
        if curl -sf "$url" | python3 -m json.tool >/dev/null 2>&1; then
            log_success "$desc returns valid JSON"
            return 0
        else
            log_error "$desc returns invalid JSON"
            return 1
        fi
    elif command_exists jq; then
        if curl -sf "$url" | jq . >/dev/null 2>&1; then
            log_success "$desc returns valid JSON"
            return 0
        else
            log_error "$desc returns invalid JSON"
            return 1
        fi
    else
        log_warning "No JSON validator available (python3 or jq), skipping JSON validation"
        return 0
    fi
}

# Test network mode value
test_network_mode() {
    local expected_mode="$1"
    local response
    
    response=$(curl -sf "$BASE/api/network/status" 2>/dev/null)
    
    if echo "$response" | grep -q "\"mode\":\"$expected_mode\""; then
        log_success "Network mode is $expected_mode"
        return 0
    else
        log_error "Network mode is not $expected_mode"
        echo "Response: $response"
        return 1
    fi
}

# Test if IP is in access URLs
test_ip_in_access_urls() {
    local ip="$1"
    local response
    
    response=$(curl -sf "$BASE/api/network/status" 2>/dev/null)
    
    if echo "$response" | grep -q "$ip"; then
        log_success "IP $ip found in accessUrls"
        return 0
    else
        log_error "IP $ip not found in accessUrls"
        return 1
    fi
}

# Main test execution
main() {
    echo "=================================================="
    echo "🧪 PocketCloud Network Mode Test Suite"
    echo "=================================================="
    echo ""
    
    # Check prerequisites
    log_info "Checking prerequisites..."
    
    if ! command_exists curl; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
    echo ""
    
    # Test 1: Basic connectivity
    echo "🔥 Testing Hotspot Mode"
    echo "------------------------"
    
    check "Pi reachable at 192.168.4.1" \
        curl -sf "$BASE/api/ping"
    
    check "Health check passes" \
        curl -sf "$BASE/api/health"
    
    test_json_response "$BASE/api/network/status" "Network status endpoint"
    
    test_network_mode "hotspot"
    
    test_ip_in_access_urls "192.168.4.1"
    
    # Test interface configuration
    if [ -f /proc/net/dev ]; then
        if grep -q "wlan0" /proc/net/dev; then
            log_info "Checking wlan0 interface configuration..."
            
            if ip addr show wlan0 2>/dev/null | grep -q "192.168.4.1"; then
                log_success "wlan0 has IP 192.168.4.1"
            else
                log_error "wlan0 does not have IP 192.168.4.1"
            fi
        else
            log_warning "wlan0 interface not found"
        fi
    fi
    
    # Test hostapd process
    if command_exists pgrep; then
        if pgrep hostapd >/dev/null 2>&1; then
            log_success "hostapd process is running"
        else
            log_error "hostapd process is not running"
        fi
    else
        log_warning "pgrep not available, cannot check hostapd process"
    fi
    
    echo ""
    
    # Test 2: API functionality
    echo "🌐 Testing API Endpoints"
    echo "------------------------"
    
    check "Files API accessible" \
        curl -sf "$BASE/api/files"
    
    check "Storage API accessible" \
        curl -sf "$BASE/api/storage/status"
    
    # Test mDNS resolution if available
    if command_exists avahi-resolve; then
        check "mDNS resolution works" \
            avahi-resolve -n pocketcloud.local
    elif command_exists dig; then
        check "mDNS resolution works" \
            dig @224.0.0.251 -p 5353 pocketcloud.local
    else
        log_warning "No mDNS resolver available, skipping mDNS test"
    fi
    
    echo ""
    
    # Test 3: WiFi scanning (if available)
    echo "📶 Testing WiFi Functionality"
    echo "-----------------------------"
    
    if check "WiFi scan API accessible" curl -sf "$BASE/api/network/wifi/scan"; then
        log_info "WiFi scanning is available"
        
        # Test scan results format
        test_json_response "$BASE/api/network/wifi/scan" "WiFi scan endpoint"
    else
        log_warning "WiFi scanning not available or failed"
    fi
    
    echo ""
    
    # Test 4: Ethernet detection (if available)
    echo "🔌 Testing Ethernet Detection"
    echo "-----------------------------"
    
    if [ -f /proc/net/dev ] && grep -q "eth0" /proc/net/dev; then
        log_info "Ethernet interface detected"
        
        if ip addr show eth0 2>/dev/null | grep -q "inet "; then
            local eth_ip
            eth_ip=$(ip addr show eth0 | grep "inet " | awk '{print $2}' | cut -d'/' -f1 | head -1)
            log_success "Ethernet has IP: $eth_ip"
            
            # Test if ethernet IP is in network status
            test_ip_in_access_urls "$eth_ip"
        else
            log_warning "Ethernet interface has no IP address"
        fi
    else
        log_warning "No ethernet interface detected"
    fi
    
    echo ""
    
    # Test 5: Security checks
    echo "🔒 Testing Security"
    echo "------------------"
    
    # Test that admin endpoints require authentication
    if curl -sf "$BASE/api/admin/system" >/dev/null 2>&1; then
        log_error "Admin endpoint accessible without authentication"
    else
        log_success "Admin endpoint requires authentication"
    fi
    
    # Test CORS headers
    local cors_headers
    cors_headers=$(curl -sI "$BASE/api/ping" | grep -i "access-control")
    if [ -n "$cors_headers" ]; then
        log_success "CORS headers present"
    else
        log_warning "No CORS headers found"
    fi
    
    echo ""
    
    # Results summary
    echo "=================================================="
    echo "📊 Test Results Summary"
    echo "=================================================="
    echo ""
    echo -e "✅ Passed: ${GREEN}$PASS${NC}"
    echo -e "❌ Failed: ${RED}$FAIL${NC}"
    echo -e "📈 Success Rate: $(( PASS * 100 / (PASS + FAIL) ))%"
    echo ""
    
    if [ $FAIL -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed! PocketCloud network is working correctly.${NC}"
        exit 0
    else
        echo -e "${RED}⚠️  Some tests failed. Please check the network configuration.${NC}"
        echo ""
        echo "Troubleshooting tips:"
        echo "- Ensure PocketCloud service is running: sudo systemctl status pocketcloud"
        echo "- Check network interfaces: ip addr show"
        echo "- Verify hostapd configuration: sudo systemctl status hostapd"
        echo "- Check logs: sudo journalctl -u pocketcloud -f"
        exit 1
    fi
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Test interrupted by user${NC}"; exit 130' INT TERM

# Run main function
main "$@"