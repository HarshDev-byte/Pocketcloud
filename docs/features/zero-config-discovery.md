# Zero-Configuration Device Discovery System

## Overview

PocketCloud Drive implements a comprehensive zero-configuration device discovery system that enables users on ANY operating system to find and connect to their PocketCloud device instantly - no typing IP addresses, no manual configuration required.

The system implements three discovery methods in a fallback chain, ensuring maximum compatibility across all platforms and network conditions.

## Discovery Methods (Fallback Chain)

### METHOD 1: DNS Captive Portal (Universal - Works on ALL devices)

**How it works:**
1. dnsmasq resolves ALL domains to 192.168.4.1
2. When devices connect to PocketCloud WiFi, captive portal detection triggers
3. Operating systems show "Sign in to network" notifications
4. Users tap the notification → automatically opens PocketCloud app
5. Zero user effort required

**Supported Platforms:**
- ✅ iOS (all versions) - "Sign in to WiFi network" popup
- ✅ Android (all versions) - "Sign in to network" notification  
- ✅ macOS - Captive portal popup in Safari
- ✅ Windows - Network sign-in prompt
- ✅ Linux - NetworkManager captive portal detection

**Implementation:**
- `scripts/setup-captive-portal.sh` - Configures dnsmasq and iptables
- `backend/src/routes/captive.routes.ts` - Handles captive portal probes
- Intercepts captive portal detection URLs from all major OS vendors

### METHOD 2: mDNS/Bonjour (macOS, Linux, Windows 10+)

**How it works:**
1. Avahi daemon advertises PocketCloud services on the network
2. Devices with mDNS support can resolve `pocketcloud.local`
3. Users can access `http://pocketcloud.local` directly
4. Works seamlessly with zero configuration

**Supported Platforms:**
- ✅ macOS (built-in Bonjour support)
- ✅ Linux (with avahi-daemon)
- ✅ Windows 10+ (built-in mDNS support)
- ✅ iOS/Android (many apps support mDNS)

**Implementation:**
- `scripts/setup-mdns.sh` - Configures avahi-daemon
- `/etc/avahi/services/pocketcloud.service` - Service definition
- Advertises `_pocketcloud._tcp` and `_http._tcp` services

### METHOD 3: Network Scan Fallback (All platforms)

**How it works:**
1. Clients try `http://pocketcloud.local/api/ping` (mDNS)
2. Fall back to `http://192.168.4.1/api/ping` (fixed IP)
3. Scan 192.168.4.2-20 for `/api/ping` responses
4. Cache successful discoveries for future use

**Supported Platforms:**
- ✅ All platforms with HTTP client support
- ✅ Command line tools (curl)
- ✅ Desktop applications
- ✅ Mobile apps
- ✅ Web browsers (with CORS)

**Implementation:**
- `backend/src/routes/discovery.routes.ts` - Discovery API endpoints
- `scripts/discover-pocketcloud.sh` - Reference client implementation
- Returns device identity and capabilities

## API Endpoints

### Discovery Endpoints

```
GET /api/ping
```
Primary discovery handshake endpoint. Returns:
```json
{
  "service": "pocketcloud",
  "version": "1.0.0",
  "name": "PocketCloud Drive",
  "hostname": "pocketcloud.local",
  "ip": "192.168.4.1",
  "ssid": "PocketCloud-XXXX",
  "features": ["files", "sharing", "streaming", "admin"],
  "auth": "required",
  "setupRequired": false,
  "storage": {
    "total": 1099511627776,
    "used": 50000000000,
    "free": 1049511627776
  },
  "endpoints": {
    "web": "http://192.168.4.1",
    "api": "http://192.168.4.1/api",
    "websocket": "ws://192.168.4.1/ws"
  }
}
```

```
GET /api/health
```
Lightweight connectivity test:
```json
{
  "service": "pocketcloud",
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Well-Known Endpoints

```
GET /.well-known/pocketcloud.json
```
Comprehensive device identity for companion apps:
```json
{
  "name": "PocketCloud Drive",
  "type": "pocketcloud", 
  "version": "1.0.0",
  "model": "Raspberry Pi 4B",
  "ip": "192.168.4.1",
  "hostname": "pocketcloud.local",
  "ssid": "PocketCloud-XXXX",
  "storage": { "total": 1099511627776, "free": 950000000000 },
  "users": 3,
  "uptime": 86400,
  "features": ["file_storage", "media_streaming", "real_time_sync"],
  "security": { "authRequired": true, "httpsEnabled": false }
}
```

### Captive Portal Endpoints

The system handles captive portal detection from all major operating systems:

- **iOS/macOS**: `/hotspot-detect.html`, `/library/test/success.html`
- **Android**: `/generate_204`, `/gen_204`
- **Windows**: `/ncsi.txt`, `/connecttest.txt`
- **Firefox**: `/canonical.html`
- **Linux**: `/nm-check.txt`

All captive portal probes redirect to the main PocketCloud interface.

## QR Code System

### WiFi Connection QR Code
```
WIFI:T:WPA;S:PocketCloud-XXXX;P:pocketcloud123;;
```
Scanning this QR code automatically connects devices to the PocketCloud WiFi network.

### Web App QR Code
```
http://192.168.4.1
```
Scanning this opens PocketCloud directly in the browser.

### Combined Setup QR Code
```
pocketcloud://setup?ssid=PocketCloud-XXXX&password=pocketcloud123&url=http://192.168.4.1&name=PocketCloud%20Drive
```
Custom protocol for PocketCloud mobile apps to configure everything automatically.

### QR Code Generation
```bash
# Generate and display QR codes
./scripts/print-qr.sh

# Creates printable label with all QR codes
# Output: /tmp/pocketcloud-qr/label.html
```

## Client Implementation Examples

### Bash/Shell (Linux/macOS/Windows WSL)
```bash
# Use the reference implementation
./scripts/discover-pocketcloud.sh

# Or implement the discovery chain manually:
# 1. Try mDNS
curl -s http://pocketcloud.local:3000/api/ping

# 2. Try fixed IP  
curl -s http://192.168.4.1:3000/api/ping

# 3. Network scan
for i in {2..20}; do
  curl -s --connect-timeout 1 http://192.168.4.$i:3000/api/ping
done
```

### JavaScript (Web/Node.js)
```javascript
async function discoverPocketCloud() {
  const methods = [
    'http://pocketcloud.local:3000/api/ping',
    'http://192.168.4.1:3000/api/ping',
    ...Array.from({length: 19}, (_, i) => 
      `http://192.168.4.${i+2}:3000/api/ping`)
  ];
  
  for (const url of methods) {
    try {
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(2000) 
      });
      const data = await response.json();
      if (data.service === 'pocketcloud') {
        return { url, device: data };
      }
    } catch (error) {
      continue; // Try next method
    }
  }
  
  throw new Error('No PocketCloud devices found');
}
```

### Python
```python
import requests
import json

def discover_pocketcloud():
    methods = [
        'http://pocketcloud.local:3000/api/ping',
        'http://192.168.4.1:3000/api/ping'
    ] + [f'http://192.168.4.{i}:3000/api/ping' for i in range(2, 21)]
    
    for url in methods:
        try:
            response = requests.get(url, timeout=2)
            data = response.json()
            if data.get('service') == 'pocketcloud':
                return {'url': url, 'device': data}
        except:
            continue
    
    raise Exception('No PocketCloud devices found')
```

### Swift (iOS)
```swift
func discoverPocketCloud() async throws -> PocketCloudDevice {
    let methods = [
        "http://pocketcloud.local:3000/api/ping",
        "http://192.168.4.1:3000/api/ping"
    ] + (2...20).map { "http://192.168.4.\($0):3000/api/ping" }
    
    for urlString in methods {
        guard let url = URL(string: urlString) else { continue }
        
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let device = try JSONDecoder().decode(PocketCloudDevice.self, from: data)
            if device.service == "pocketcloud" {
                return device
            }
        } catch {
            continue
        }
    }
    
    throw DiscoveryError.noDevicesFound
}
```

## Testing the Discovery System

### Test on iOS
1. Connect to PocketCloud WiFi
2. iOS shows "Sign in to WiFi network" notification
3. Tap notification → Safari opens with PocketCloud
4. Alternatively: Open Safari, go to any website → redirects to PocketCloud

### Test on Android  
1. Connect to PocketCloud WiFi
2. Android shows "Sign in to network" notification
3. Tap notification → Chrome opens with PocketCloud
4. Alternatively: Open Chrome, go to any website → redirects to PocketCloud

### Test on macOS
1. Connect to PocketCloud WiFi → Captive portal popup appears
2. Or open Terminal: `ping pocketcloud.local` → resolves to 192.168.4.1
3. Or open Safari: `http://pocketcloud.local` → opens PocketCloud

### Test on Windows
1. Connect to PocketCloud WiFi → "Sign in" notification appears
2. Or open Command Prompt: `nslookup pocketcloud.local` → resolves to 192.168.4.1
3. Or open browser: `http://pocketcloud.local` → opens PocketCloud

### Test on Ubuntu/Linux
1. Connect to PocketCloud WiFi → NetworkManager may show captive portal
2. Or Terminal: `avahi-resolve -n pocketcloud.local` → resolves to 192.168.4.1
3. Or browser: `http://pocketcloud.local` → opens PocketCloud

## Network Configuration

### dnsmasq Configuration
```
# Captive portal - resolve ALL domains to 192.168.4.1
address=/#/192.168.4.1

# Specific overrides for captive portal detection
address=/captive.apple.com/192.168.4.1
address=/clients3.google.com/192.168.4.1
address=/www.msftconnecttest.com/192.168.4.1
address=/detectportal.firefox.com/192.168.4.1

# Local hostname
address=/pocketcloud.local/192.168.4.1
```

### Avahi Service Definition
```xml
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">PocketCloud Drive on %h</name>
  <service>
    <type>_pocketcloud._tcp</type>
    <port>3000</port>
    <txt-record>version=1.0.0</txt-record>
    <txt-record>features=files,sharing,streaming</txt-record>
  </service>
</service-group>
```

### iptables Rules
```bash
# Redirect all HTTP traffic to PocketCloud
iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 -j DNAT --to-destination 192.168.4.1:3000
iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 443 -j DNAT --to-destination 192.168.4.1:3000
```

## Troubleshooting

### Captive Portal Not Triggering
1. Check dnsmasq is running: `systemctl status dnsmasq`
2. Test DNS resolution: `nslookup google.com 192.168.4.1`
3. Verify iptables rules: `iptables -t nat -L`
4. Check device captive portal settings (may be disabled)

### mDNS Not Working
1. Check avahi-daemon: `systemctl status avahi-daemon`
2. Test service advertisement: `avahi-browse _pocketcloud._tcp`
3. Test hostname resolution: `avahi-resolve -n pocketcloud.local`
4. Verify firewall allows mDNS (port 5353 UDP)

### Network Scan Failing
1. Check PocketCloud is running: `curl http://192.168.4.1:3000/api/ping`
2. Verify network connectivity: `ping 192.168.4.1`
3. Check firewall rules on client device
4. Ensure client is on correct network (192.168.4.0/24)

### General Issues
1. Restart networking services: `sudo systemctl restart dnsmasq hostapd avahi-daemon`
2. Check logs: `journalctl -u dnsmasq -u hostapd -u avahi-daemon`
3. Verify WiFi is broadcasting: `iwlist scan | grep PocketCloud`
4. Test from different device types

## Security Considerations

### Captive Portal Security
- Only redirects to local PocketCloud instance (192.168.4.1)
- No external network access until authentication
- DNS resolution limited to local network
- iptables rules prevent unauthorized access

### mDNS Security  
- Services only advertised on local network interface
- No sensitive information in TXT records
- Standard Bonjour/Avahi security practices
- Can be disabled if not needed

### Discovery API Security
- CORS headers allow cross-origin discovery
- No authentication required for discovery endpoints
- Rate limiting applied to prevent abuse
- Only returns public device information

## Performance Optimization

### Pi 4B Optimizations
- Efficient DNS caching (1000 entries)
- Minimal iptables rules for performance
- Avahi configured for low resource usage
- Discovery endpoints optimized for speed

### Network Efficiency
- Short DNS TTL for captive portal (60s)
- Compressed HTTP responses
- Minimal JSON payloads
- Connection timeouts to prevent hanging

### Client Optimizations
- Parallel discovery attempts where possible
- Caching of successful discoveries
- Short timeouts for failed attempts
- Progressive fallback (fast methods first)

## Future Enhancements

### Planned Features
- **Bluetooth LE discovery** for mobile apps
- **NFC tags** for instant connection
- **UPnP/SSDP support** for Windows compatibility
- **Custom mobile apps** with native discovery
- **Desktop companion apps** with system tray integration

### Advanced Discovery
- **Network topology mapping** to find devices behind routers
- **Cloud-assisted discovery** for remote access setup
- **Mesh network support** for multiple PocketCloud devices
- **IPv6 support** for modern networks

This zero-configuration discovery system ensures that users can find and connect to their PocketCloud device instantly on any platform, providing an AirDrop-like experience that works universally across all operating systems and device types.