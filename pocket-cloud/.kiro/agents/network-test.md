# Network Test Agent for PocketCloud

## Purpose
Test all three PocketCloud network modes end-to-end to ensure proper functionality across different network configurations.

## Test Scenarios

### 1. Hotspot Mode Verification
**Objective**: Verify PocketCloud creates and manages its own WiFi hotspot

**Checks**:
- [ ] wlan0 interface has IP 192.168.4.1
- [ ] hostapd service is running and accessible
- [ ] GET http://192.168.4.1/api/ping returns "pocketcloud" service identifier
- [ ] GET /api/network/status shows `mode: "hotspot"`
- [ ] Hotspot SSID is broadcasting (visible to nearby devices)
- [ ] DHCP server is assigning IPs in 192.168.4.x range

**Commands to run**:
```bash
# Check interface IP
ip addr show wlan0 | grep "inet 192.168.4.1"

# Check hostapd process
pgrep hostapd

# Test API endpoints
curl -sf http://192.168.4.1/api/ping
curl -sf http://192.168.4.1/api/network/status | jq '.mode'

# Check DHCP leases
cat /var/lib/dhcp/dhcpd.leases | tail -10
```

### 2. WiFi Client Mode Verification
**Objective**: Verify PocketCloud can connect to existing WiFi networks

**Checks**:
- [ ] POST /api/network/wifi/connect with test network credentials succeeds
- [ ] Poll for IP assignment within 30 seconds maximum
- [ ] GET /api/network/status shows new IP address and network info
- [ ] pocketcloud.local resolves correctly on the network
- [ ] mDNS advertisement is working
- [ ] Fallback behavior: wrong password returns to hotspot mode

**Test sequence**:
```bash
# Test valid connection
curl -X POST http://192.168.4.1/api/network/wifi/connect \
  -H "Content-Type: application/json" \
  -d '{"ssid": "TestNetwork", "password": "validpassword"}'

# Poll for connection (max 30s)
for i in {1..30}; do
  STATUS=$(curl -s http://pocketcloud.local/api/network/status)
  if echo "$STATUS" | jq -e '.wlan0.ip' > /dev/null; then
    echo "Connected with IP: $(echo "$STATUS" | jq -r '.wlan0.ip')"
    break
  fi
  sleep 1
done

# Test invalid credentials (should fallback)
curl -X POST http://192.168.4.1/api/network/wifi/connect \
  -H "Content-Type: application/json" \
  -d '{"ssid": "TestNetwork", "password": "wrongpassword"}'

# Verify fallback to hotspot after 60s
sleep 60
curl -sf http://192.168.4.1/api/network/status | jq '.mode'
```

### 3. Ethernet Mode Verification
**Objective**: Verify PocketCloud works with wired ethernet connection

**Checks**:
- [ ] eth0 interface has valid IP when cable connected
- [ ] GET /api/network/status shows ethernet interface info
- [ ] pocketcloud.local resolves on ethernet network
- [ ] Both ethernet and WiFi can work simultaneously
- [ ] Network priority: ethernet preferred over WiFi when both available

**Commands**:
```bash
# Check ethernet interface
ip addr show eth0 | grep "inet "

# Test network status
curl -sf http://pocketcloud.local/api/network/status | jq '.eth0'

# Test mDNS resolution
avahi-resolve -n pocketcloud.local

# Check routing table priority
ip route show | grep default
```

## Test Implementation

### Automated Test Script
Create `scripts/test-network-modes.sh` that:

1. **Setup Phase**:
   - Record current network state
   - Ensure test environment is clean
   - Verify required tools are available

2. **Hotspot Test**:
   - Force hotspot mode
   - Run all hotspot checks
   - Record results

3. **WiFi Client Test**:
   - Attempt connection to test network
   - Verify connectivity and services
   - Test fallback scenario
   - Record results

4. **Ethernet Test** (if cable detected):
   - Verify ethernet connectivity
   - Test service accessibility
   - Record results

5. **Cleanup Phase**:
   - Restore original network state
   - Generate test report

### Expected Output Format
```
PocketCloud Network Mode Test Results
=====================================

🔥 Hotspot Mode: PASS
  ✓ wlan0 IP: 192.168.4.1
  ✓ hostapd running: PID 1234
  ✓ API ping: pocketcloud
  ✓ Network status: hotspot
  ✓ DHCP active: 3 leases

📶 WiFi Client Mode: PASS
  ✓ Connection successful: 192.168.1.100
  ✓ mDNS resolution: pocketcloud.local -> 192.168.1.100
  ✓ API accessible via hostname
  ✓ Fallback test: returned to hotspot

🔌 Ethernet Mode: SKIP
  ⚠ No ethernet cable detected

Summary: 2/2 modes tested, 0 failures
```

## Error Scenarios to Test

### Network Security
- [ ] Verify hotspot uses WPA2 encryption
- [ ] Test that admin interface requires authentication
- [ ] Ensure no default/weak passwords

### Edge Cases
- [ ] Network interface goes down during operation
- [ ] Multiple WiFi networks with same SSID
- [ ] Very weak WiFi signal (< -80 dBm)
- [ ] Network with captive portal
- [ ] IPv6-only networks

### Performance
- [ ] Network mode switching time (< 60 seconds)
- [ ] API response time in each mode (< 2 seconds)
- [ ] File transfer speed in each mode

## Integration with CI/CD

This test should be:
- [ ] Runnable on actual Pi hardware
- [ ] Mockable for development environments
- [ ] Integrated with GitHub Actions for hardware testing
- [ ] Part of release validation checklist

## Manual Testing Checklist

For human testers to verify:
- [ ] Install PocketCloud app on phone
- [ ] Connect to hotspot and verify file access
- [ ] Switch Pi to WiFi client mode via web interface
- [ ] Verify app automatically reconnects to new IP
- [ ] Test file upload/download in each mode
- [ ] Verify network settings persist after reboot