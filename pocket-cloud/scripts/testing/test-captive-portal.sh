#!/bin/bash

# PocketCloud Captive Portal Test Script
# Verifies that captive portal detection works for all major operating systems

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
POCKETCLOUD_IP="192.168.4.1"
BASE_URL="http://${POCKETCLOUD_IP}"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test function with timeout and error handling
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_code="$3"
    local expected_content="$4"
    local user_agent="${5:-curl/7.0}"
    
    echo -n "Testing $name... "
    
    # Make request with timeout
    local response
    local http_code
    local content
    
    if response=$(curl -s -m 10 -w "%{http_code}" -H "User-Agent: $user_agent" "$url" 2>/dev/null); then
        # Extract HTTP code (last 3 characters)
        http_code="${response: -3}"
        # Extract content (everything except last 3 characters)
        content="${response%???}"
        
        # Check HTTP code
        if [[ "$http_code" == "$expected_code" ]]; then
            # Check content if specified
            if [[ -n "$expected_content" ]]; then
                if echo "$content" | grep -q "$expected_content"; then
                    echo -e "${GREEN}✓ OK${NC}"
                    return 0
                else
                    echo -e "${RED}✗ Wrong content${NC}"
                    echo "  Expected: $expected_content"
                    echo "  Got: ${content:0:100}..."
                    return 1
                fi
            else
                echo -e "${GREEN}✓ OK${NC}"
                return 0
            fi
        else
            echo -e "${RED}✗ Wrong HTTP code${NC}"
            echo "  Expected: $expected_code"
            echo "  Got: $http_code"
            return 1
        fi
    else
        echo -e "${RED}✗ Connection failed${NC}"
        return 1
    fi
}

# Test JSON endpoint
test_json_endpoint() {
    local name="$1"
    local url="$2"
    local expected_field="$3"
    
    echo -n "Testing $name... "
    
    local response
    if response=$(curl -s -m 10 "$url" 2>/dev/null); then
        if command -v python3 >/dev/null 2>&1; then
            if echo "$response" | python3 -m json.tool >/dev/null 2>&1; then
                if echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print('$expected_field' in data)" | grep -q "True"; then
                    echo -e "${GREEN}✓ OK${NC}"
                    return 0
                else
                    echo -e "${RED}✗ Missing field: $expected_field${NC}"
                    return 1
                fi
            else
                echo -e "${RED}✗ Invalid JSON${NC}"
                return 1
            fi
        else
            # Fallback without python
            if echo "$response" | grep -q "$expected_field"; then
                echo -e "${GREEN}✓ OK${NC}"
                return 0
            else
                echo -e "${RED}✗ Missing field: $expected_field${NC}"
                return 1
            fi
        fi
    else
        echo -e "${RED}✗ Connection failed${NC}"
        return 1
    fi
}

# Check if PocketCloud is reachable
check_connectivity() {
    log_info "Checking PocketCloud connectivity..."
    
    if ! ping -c 1 -W 3 "$POCKETCLOUD_IP" >/dev/null 2>&1; then
        log_error "Cannot reach PocketCloud at $POCKETCLOUD_IP"
        log_info "Make sure you're connected to the PocketCloud WiFi hotspot"
        exit 1
    fi
    
    log_success "PocketCloud is reachable at $POCKETCLOUD_IP"
}

# Main test suite
main() {
    echo "🧪 PocketCloud Captive Portal Test Suite"
    echo "========================================"
    echo
    
    check_connectivity
    echo
    
    log_info "Testing captive portal detection endpoints..."
    echo
    
    # Apple iOS/macOS Detection
    log_info "Apple Device Detection:"
    test_endpoint "Apple hotspot-detect.html" \
        "$BASE_URL/hotspot-detect.html" \
        "200" \
        "Success" \
        "CaptiveNetworkSupport/1.0 wispr"
    
    test_endpoint "Apple library test" \
        "$BASE_URL/library/test/success.html" \
        "200" \
        "Success"
    
    test_endpoint "Apple success.txt" \
        "$BASE_URL/success.txt" \
        "200" \
        "200 OK"
    
    echo
    
    # Android Detection
    log_info "Android Device Detection:"
    test_endpoint "Android generate_204" \
        "$BASE_URL/generate_204" \
        "204" \
        ""
    
    test_endpoint "Google connectivity check" \
        "$BASE_URL/connectivitycheck.gstatic.com/generate_204" \
        "204" \
        ""
    
    test_endpoint "Android connectivity check" \
        "$BASE_URL/connectivitycheck.android.com/generate_204" \
        "204" \
        ""
    
    echo
    
    # Windows Detection
    log_info "Windows Device Detection:"
    test_endpoint "Windows NCSI" \
        "$BASE_URL/ncsi.txt" \
        "200" \
        "Microsoft NCSI"
    
    test_endpoint "Windows connect test" \
        "$BASE_URL/connecttest.txt" \
        "200" \
        "Microsoft Connect Test"
    
    echo
    
    # Firefox Detection
    log_info "Firefox Detection:"
    test_endpoint "Firefox canonical.html" \
        "$BASE_URL/canonical.html" \
        "302" \
        ""
    
    echo
    
    # Discovery Endpoints
    log_info "Discovery Endpoints:"
    test_json_endpoint "API ping endpoint" \
        "$BASE_URL/api/ping" \
        "service"
    
    test_json_endpoint "Well-known endpoint" \
        "$BASE_URL/.well-known/pocketcloud.json" \
        "name"
    
    test_json_endpoint "Network discovery" \
        "$BASE_URL/api/discovery/network" \
        "mode"
    
    test_json_endpoint "Capabilities endpoint" \
        "$BASE_URL/api/discovery/capabilities" \
        "storage"
    
    echo
    
    # Test with different User-Agents
    log_info "User-Agent Specific Tests:"
    test_endpoint "iOS Safari" \
        "$BASE_URL/hotspot-detect.html" \
        "200" \
        "PocketCloud" \
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
    
    test_endpoint "Android Chrome" \
        "$BASE_URL/generate_204" \
        "204" \
        "" \
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/112.0.0.0"
    
    test_endpoint "Windows Edge" \
        "$BASE_URL/ncsi.txt" \
        "200" \
        "Microsoft NCSI" \
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edge/112.0.1722.68"
    
    echo
    log_success "All captive portal tests completed!"
    echo
    log_info "Captive portal should now trigger on:"
    log_info "  • iOS 16+ (shows 'Sign in to PocketCloud' notification)"
    log_info "  • Android 13+ (shows network sign-in notification)"
    log_info "  • Windows 11 (shows network sign-in prompt)"
    log_info "  • macOS 13+ (opens captive portal browser automatically)"
    echo
    log_info "To test manually:"
    log_info "  1. Connect a device to the PocketCloud WiFi hotspot"
    log_info "  2. Wait for the captive portal notification to appear"
    log_info "  3. Tap/click the notification to open PocketCloud"
}

# Run tests
main "$@"