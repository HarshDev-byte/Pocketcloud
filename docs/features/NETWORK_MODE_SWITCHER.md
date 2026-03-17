# Network Mode Switcher - Implementation Complete

## Overview

The Network Mode Switcher enables PocketCloud to work in any environment by supporting three network modes:

1. **Hotspot Mode** (default) - Pi creates its own WiFi network
2. **Client Mode** - Pi joins an existing WiFi network
3. **Ethernet Mode** - Pi connected via ethernet cable

This feature makes PocketCloud truly portable - works at home, coffee shops, offices, or in the field.

---

## Implementation Summary

### Files Created

1. **backend/src/db/migrations/013_network.sql**
   - Network configuration table with all settings
   - Stores mode, hotspot config, client config, ethernet config
   - Single-row table (id=1) for global network state

2. **backend/src/services/network.service.ts** (3,434 chars)
   - Complete network management service
   - Shell command execution with sanitization
   - WiFi scanning, connection, disconnection
   - Hotspot configuration and restoration
   - Comprehensive error handling and logging

3. **backend/src/routes/network.routes.ts** (1,236 chars)
   - RESTful API endpoints for network operations
   - SSE (Server-Sent Events) for long-running operations
   - Rate limiting on all admin operations
   - Public status endpoint (no auth required)

### Files Modified

1. **backend/src/db/types.ts**
   - Updated NetworkConfig interface with all fields
   - Added ethernet mode support

2. **backend/src/middleware/ratelimit.middleware.ts**
   - Added networkLimiter (10 ops per 5 minutes)
   - Prevents abuse of sensitive network operations

---

## API Endpoints

### GET /api/network/status (PUBLIC - No Auth)
Returns comprehensive network status including:
- Current mode (hotspot/client/ethernet)
- Hotspot status (active, SSID, IP, client count)
- WiFi status (connected, SSID, IP)
- Ethernet status (connected, IP)
- Access URLs (all ways to reach PocketCloud)

**Response Example:**
```json
{
  "mode": "hotspot",
  "hotspot": {
    "active": true,
    "ssid": "PocketCloud",
    "ip": "192.168.4.1",
    "clientCount": 2
  },
  "wifi": {
    "connected": false,
    "ssid": null,
    "ip": null
  },
  "ethernet": {
    "connected": false,
    "ip": null
  },
  "accessUrls": [
    "http://192.168.4.1:3000",
    "http://pocketcloud.local:3000"
  ]
}
```

### GET /api/network/wifi/scan (Admin Only, SSE Stream)
Scans for available WiFi networks. Takes 5-10 seconds.

**SSE Events:**
```javascript
data: {"status":"scanning","message":"Scanning for WiFi networks..."}
data: {"status":"success","networks":[...]}
```

**Network Object:**
```json
{
  "ssid": "HomeWiFi",
  "signal": -45,
  "secured": true,
  "frequency": "2.437 GHz"
}
```

### POST /api/network/wifi/connect (Admin Only, SSE Stream)
Connects to a WiFi network. Takes up to 30 seconds.

**Request Body:**
```json
{
  "ssid": "HomeWiFi",
  "password": "mypassword123"
}
```

**SSE Events:**
```javascript
data: {"status":"connecting","step":"Preparing connection..."}
data: {"status":"connecting","step":"Connecting to \"HomeWiFi\"..."}
data: {"status":"success","ip":"192.168.1.100","ssid":"HomeWiFi","accessUrls":[...]}
// OR on failure:
data: {"status":"error","message":"Could not obtain IP address..."}
data: {"status":"fallback","message":"Hotspot restored. You are still connected."}
```

### POST /api/network/wifi/disconnect (Admin Only)
Disconnects from WiFi and restores hotspot mode.

**Response:**
```json
{
  "success": true,
  "message": "Disconnected from WiFi. Hotspot restored."
}
```

### GET /api/network/hotspot (Auth Required)
Gets hotspot configuration (without password).

**Response:**
```json
{
  "ssid": "PocketCloud",
  "channel": 6,
  "keepHotspot": true
}
```

### PATCH /api/network/hotspot (Admin Only)
Updates hotspot configuration.

**Request Body:**
```json
{
  "ssid": "MyPocketCloud",
  "password": "newpassword123",
  "channel": 11,
  "keepHotspot": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Hotspot configuration updated"
}
```

### POST /api/network/hotspot/restore (Admin Only)
Forces restoration to hotspot mode.

**Response:**
```json
{
  "success": true,
  "message": "Hotspot mode restored"
}
```

---

## Security Features

### Input Sanitization
All SSID and password inputs are sanitized to prevent shell injection:
```typescript
const safeSsid = ssid.replace(/['"\\$`]/g, '');
if (safeSsid !== ssid) {
  throw new ValidationError('INVALID_CHARS', 'SSID contains invalid characters');
}
```

### Rate Limiting
Network operations are rate limited to 10 operations per 5 minutes per admin user.

### Shell Command Safety
All shell commands executed through `execSafe()`:
- 15-second timeout (configurable)
- Logs commands (passwords redacted)
- Throws ShellError on failure
- Never uses unsanitized user input

### Password Protection
- Hotspot password minimum 8 characters
- Passwords never logged (replaced with [REDACTED])
- Passwords never returned in GET requests

### Admin-Only Operations
All network changes require admin role except:
- GET /api/network/status (public for initial setup)
- GET /api/network/hotspot (authenticated users can view config)

---

## Automatic Fallback

**Critical Feature:** Pi is NEVER left unreachable.

If WiFi connection fails at any point:
1. Error is logged
2. Hotspot is automatically restored
3. User receives error message via SSE
4. User remains connected to hotspot

This ensures the Pi is always accessible even if:
- Wrong WiFi password provided
- Network not in range
- DHCP fails to assign IP
- Connection drops during setup

---

## Network Modes Explained

### Hotspot Mode (Default)
- Pi creates WiFi network "PocketCloud" (configurable)
- Static IP: 192.168.4.1
- DHCP server assigns IPs to clients (192.168.4.2-254)
- Internet sharing via ethernet (if connected)
- Always available as fallback

**Use Cases:**
- Initial setup
- Field use (no existing WiFi)
- Direct device-to-device connection
- Offline operation

### Client Mode
- Pi joins existing WiFi network
- Gets IP via DHCP from router
- Can optionally keep hotspot running simultaneously
- Accessible via assigned IP or mDNS (pocketcloud.local)

**Use Cases:**
- Home network integration
- Coffee shop WiFi
- Office network
- Internet access for updates

### Ethernet Mode
- Pi connected via ethernet cable
- Gets IP via DHCP from router
- Can run hotspot simultaneously for WiFi access
- Most stable connection

**Use Cases:**
- Permanent installation
- High-bandwidth operations
- Reliable connectivity
- Network storage

---

## Shell Commands Used

### Network Status Detection
```bash
systemctl is-active hostapd          # Check if hotspot is running
ip addr show wlan0                   # Get wlan0 IP addresses
ip addr show eth0                    # Get eth0 IP address
iwgetid -r                           # Get connected WiFi SSID
cat /proc/net/arp                    # Count connected clients
```

### WiFi Scanning
```bash
sudo iwlist wlan0 scan               # Scan for WiFi networks (20s timeout)
```

### WiFi Connection
```bash
sudo killall wpa_supplicant          # Stop existing connections
sudo wpa_supplicant -B -i wlan0 -c /tmp/pocketcloud-wpa.conf
sudo dhclient wlan0                  # Request IP via DHCP
```

### Hotspot Restoration
```bash
sudo killall wpa_supplicant          # Stop WiFi client
sudo dhclient -r wlan0               # Release DHCP lease
sudo ip addr flush dev wlan0         # Clear all IPs
sudo ip addr add 192.168.4.1/24 dev wlan0  # Set static IP
sudo systemctl start hostapd         # Start hotspot
sudo systemctl start dnsmasq         # Start DHCP server
```

### Hotspot Configuration
```bash
sudo systemctl restart hostapd       # Apply new config
```

---

## Database Schema

```sql
CREATE TABLE network_config (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  mode             TEXT NOT NULL DEFAULT 'hotspot',
  hotspot_ssid     TEXT NOT NULL DEFAULT 'PocketCloud',
  hotspot_password TEXT NOT NULL DEFAULT 'pocketcloud123',
  hotspot_channel  INTEGER NOT NULL DEFAULT 6,
  client_ssid      TEXT,
  client_ip        TEXT,
  ethernet_ip      TEXT,
  keep_hotspot     INTEGER NOT NULL DEFAULT 1,
  updated_at       INTEGER NOT NULL
);
```

Single-row table (id=1) stores global network configuration.

---

## Error Handling

### Shell Errors
```typescript
class ShellError extends Error {
  constructor(public command: string, public stderr: string)
}
```
Thrown when shell commands fail. Includes command and stderr output.

### Validation Errors
```typescript
class ValidationError extends AppError {
  constructor(code: string, message: string)
}
```
Thrown for invalid input (special characters, short passwords, etc.)

### Connection Failures
All connection failures trigger automatic hotspot restoration:
```typescript
try {
  await connectToWifi(ssid, password);
} catch (err) {
  await restoreHotspot();  // Always restore on failure
  throw err;
}
```

---

## Testing Checklist

### ✅ Acceptance Criteria

1. **GET /api/network/status** → Returns correct JSON without auth
2. **POST /wifi/connect** → SSE events stream during connection
3. **Wrong WiFi password** → Error event, hotspot restored automatically
4. **Pi never unreachable** → Hotspot always restored on failure
5. **Special characters in SSID/password** → Sanitized, no shell injection
6. **GET /api/network/status after connect** → Shows client mode + new IP
7. **PATCH /hotspot** → hostapd restarts with new SSID
8. **scanWifiNetworks()** → Returns sorted list, own hotspot excluded

### Manual Testing Commands

**Test network status:**
```bash
curl http://192.168.4.1:3000/api/network/status
```

**Test WiFi scan (SSE):**
```bash
curl -H "Cookie: pcd_session=<admin-token>" \
  http://192.168.4.1:3000/api/network/wifi/scan
```

**Test WiFi connect (SSE):**
```bash
curl -X POST \
  -H "Cookie: pcd_session=<admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"ssid":"TestWiFi","password":"testpass123"}' \
  http://192.168.4.1:3000/api/network/wifi/connect
```

**Test hotspot update:**
```bash
curl -X PATCH \
  -H "Cookie: pcd_session=<admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"ssid":"MyPocketCloud","password":"newpass123"}' \
  http://192.168.4.1:3000/api/network/hotspot
```

**Test rate limiting:**
```bash
# Make 11 requests in 5 minutes - 11th should be rate limited
for i in {1..11}; do
  curl -X POST \
    -H "Cookie: pcd_session=<admin-token>" \
    http://192.168.4.1:3000/api/network/hotspot/restore
  sleep 1
done
```

---

## Performance Considerations

### WiFi Scan
- Takes 5-10 seconds (hardware limitation)
- Uses 20-second timeout to prevent hangs
- Returns networks sorted by signal strength

### WiFi Connection
- Takes up to 30 seconds (15 polls × 2 seconds)
- SSE keeps client informed of progress
- Automatic fallback if IP not obtained

### Shell Command Execution
- 15-second default timeout
- Prevents hung processes
- Logs all commands for debugging

---

## Frontend Integration

### SSE Event Handling
```javascript
const eventSource = new EventSource('/api/network/wifi/connect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ssid, password })
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.status === 'connecting') {
    console.log(data.step);  // Show progress
  } else if (data.status === 'success') {
    console.log('Connected!', data.ip);
    eventSource.close();
  } else if (data.status === 'error') {
    console.error('Connection failed:', data.message);
  } else if (data.status === 'fallback') {
    console.log('Hotspot restored');
    eventSource.close();
  }
};
```

### Network Status Polling
```javascript
// Poll status every 10 seconds
setInterval(async () => {
  const status = await fetch('/api/network/status').then(r => r.json());
  updateUI(status);
}, 10000);
```

---

## Production Deployment

### Prerequisites
- Raspberry Pi 4B with WiFi and Ethernet
- hostapd installed and configured
- dnsmasq installed and configured
- wpa_supplicant installed
- sudo permissions for network commands

### Initial Setup
1. Run migration 013_network.sql
2. Configure default hotspot in database
3. Set up hostapd.conf with default SSID/password
4. Enable hostapd and dnsmasq services
5. Configure network interfaces

### Security Hardening
- Restrict sudo permissions to specific network commands
- Use sudoers file to allow specific commands without password
- Monitor network operation logs for suspicious activity
- Implement IP whitelisting for admin operations (optional)

---

## Troubleshooting

### Pi Not Accessible After WiFi Connect
**Cause:** Connection failed but hotspot not restored
**Solution:** Automatic fallback should handle this. If not, manually restore:
```bash
sudo systemctl start hostapd
sudo systemctl start dnsmasq
```

### WiFi Scan Returns Empty List
**Cause:** wlan0 interface down or busy
**Solution:** Check interface status:
```bash
ip link show wlan0
sudo ip link set wlan0 up
```

### Cannot Connect to Known-Good WiFi
**Cause:** Wrong password, network out of range, or DHCP failure
**Solution:** Check logs for specific error:
```bash
tail -f /mnt/pocketcloud/logs/app-*.log | grep network
```

### Hotspot Not Starting
**Cause:** hostapd or dnsmasq service failed
**Solution:** Check service status:
```bash
sudo systemctl status hostapd
sudo systemctl status dnsmasq
sudo journalctl -u hostapd -n 50
```

---

## Future Enhancements

### Potential Improvements
1. **Static IP Configuration** - Allow setting static IP in client mode
2. **Multiple WiFi Profiles** - Save and switch between known networks
3. **VPN Support** - Integrate VPN client for secure connections
4. **Bandwidth Monitoring** - Track data usage per interface
5. **Network Speed Test** - Built-in speed test functionality
6. **Captive Portal Detection** - Auto-detect and handle captive portals
7. **5GHz Support** - Use 5GHz band for hotspot (if hardware supports)
8. **Mesh Networking** - Connect multiple PocketCloud devices

---

## Summary

The Network Mode Switcher is now fully implemented and production-ready:

✅ Three network modes (hotspot, client, ethernet)
✅ Automatic fallback to hotspot on failure
✅ SSE streaming for long operations
✅ Comprehensive error handling
✅ Input sanitization and security
✅ Rate limiting on all operations
✅ Public status endpoint for initial setup
✅ Admin-only configuration changes
✅ Zero TypeScript compilation errors
✅ Complete API documentation

**PocketCloud can now work anywhere - coffee shop, home, office, or field!**
