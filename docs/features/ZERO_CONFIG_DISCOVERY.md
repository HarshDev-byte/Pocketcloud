# Zero-Config Discovery

When any device connects to PocketCloud WiFi OR the same LAN, they find PocketCloud automatically. No IP address needed. iOS shows a notification. Android shows a sign-in prompt. macOS shows it in Finder sidebar. Windows in Network folder.

The product just appears. That is magic.

## Overview

Zero-Config Discovery makes PocketCloud automatically discoverable through three mechanisms:

1. **Captive Portal Detection** - Auto-prompts when connecting to WiFi
2. **mDNS/Bonjour** - Makes `pocketcloud.local` work everywhere
3. **Discovery API** - Provides service information for clients

## Part A: Captive Portal Detection

When devices connect to PocketCloud's WiFi hotspot, they automatically perform "captive portal detection" by probing known URLs. We intercept these probes and redirect to PocketCloud, triggering the "Sign in to network" popup.

### Supported Platforms

#### iOS/macOS (Apple)
- Probes: `/hotspot-detect.html`, `/library/test/success.html`
- Behavior: Shows "Sign in to Network" notification
- Response: Returns success HTML or redirects to PocketCloud

#### Android (AOSP)
- Probes: `/generate_204`, `connectivitycheck.gstatic.com`
- Behavior: Shows "Sign in to network" system notification
- Response: Returns HTTP 204 No Content (exact requirement)

#### Windows
- Probes: `/ncsi.txt`, `/connecttest.txt`, `/redirect`
- Behavior: Opens captive portal browser automatically
- Response: Returns NCSI text or redirects to PocketCloud

#### Firefox
- Probes: `/canonical.html`
- Behavior: Detects captive portal
- Response: Redirects to PocketCloud

#### Linux (NetworkManager)
- Probes: `/nm-check.txt`
- Behavior: Detects network status
- Response: Returns "NetworkManager is online"

### Implementation

All captive portal routes are handled in `backend/src/routes/captive.routes.ts` and mounted FIRST in the Express app (before rate limiting and other middleware).

```typescript
// Captive portal routes MUST BE FIRST
app.use('/', captiveRouter);
```

### Known Captive Portal Domains

The system recognizes and redirects these domains:
- `captive.apple.com`
- `www.apple.com`
- `connectivitycheck.gstatic.com`
- `connectivitycheck.android.com`
- `www.msftconnecttest.com`
- `www.msftncsi.com`
- `detectportal.firefox.com`
- `nmcheck.gnome.org`
- `network-test.debian.org`

## Part B: mDNS/Bonjour (pocketcloud.local)

mDNS (Multicast DNS) allows devices to discover services on the local network without DNS servers. This makes `pocketcloud.local` work automatically.

### Setup

Run the mDNS setup script:

```bash
sudo ./scripts/03-setup-mdns.sh
```

This script:
1. Installs Avahi daemon (mDNS implementation)
2. Creates service advertisement file
3. Sets hostname to `pocketcloud`
4. Enables and starts Avahi

### Advertised Services

PocketCloud advertises three services:

#### 1. Custom PocketCloud Service
- Type: `_pocketcloud._tcp`
- Port: 3000
- TXT Records:
  - `version=1.0`
  - `path=/`
  - `features=files,sharing,streaming,webdav,encryption`

#### 2. HTTP Service
- Type: `_http._tcp`
- Port: 3000
- TXT Records:
  - `path=/`

#### 3. WebDAV Service
- Type: `_webdav._tcp`
- Port: 3000
- TXT Records:
  - `path=/webdav`

### Platform Support

#### macOS
- ✅ `pocketcloud.local` works in browser
- ✅ Shows in Finder sidebar under "Network"
- ✅ Native Bonjour support

#### iOS/iPadOS
- ✅ `pocketcloud.local` works in Safari
- ✅ Shows in Files app under "Network"
- ✅ Native Bonjour support

#### Windows 10/11
- ✅ `pocketcloud.local` works (built-in mDNS)
- ✅ Shows in Network folder (if WebDAV configured)
- ⚠️ Older Windows may need Bonjour Print Services

#### Linux
- ✅ `pocketcloud.local` works with Avahi
- ✅ Most modern distros have Avahi pre-installed
- ✅ Works in file managers that support mDNS

#### Android
- ⚠️ Limited mDNS support (app-dependent)
- ✅ Chrome browser supports `.local` domains
- ✅ Some file manager apps support mDNS

### Testing mDNS

```bash
# Test hostname resolution
ping pocketcloud.local

# Browse all services
avahi-browse -a

# Browse PocketCloud services specifically
avahi-browse _pocketcloud._tcp

# Resolve service details
avahi-resolve -n pocketcloud.local
```

## Part C: Discovery API

The Discovery API provides service information for client applications to auto-configure.

### GET /api/ping

Primary discovery endpoint. No authentication required.

**Response:**
```json
{
  "service": "pocketcloud",
  "version": "1.0.0",
  "name": "PocketCloud",
  "hostname": "pocketcloud.local",
  "features": [
    "files",
    "sharing",
    "streaming",
    "webdav",
    "encryption",
    "sync",
    "photo-backup",
    "webhooks",
    "api-keys",
    "analytics",
    "pipeline",
    "health-monitor"
  ],
  "storage": {
    "freeBytes": 64424509440,
    "totalBytes": 128849018880,
    "percentUsed": 50
  },
  "network": {
    "hotspotActive": true,
    "wifiConnected": false,
    "ethernetConnected": false,
    "accessUrls": [
      "http://192.168.4.1",
      "http://pocketcloud.local"
    ]
  },
  "requiresAuth": true,
  "setupComplete": true
}
```

**Use Cases:**
- Client apps scan for PocketCloud on network
- Health monitoring tools check service status
- Setup wizards detect if setup is complete

### GET /.well-known/pocketcloud.json

Well-known URI for service discovery. No authentication required.

**Response:**
```json
{
  "name": "PocketCloud Drive",
  "version": "1.0.0",
  "api": "/api",
  "webdav": "/webdav",
  "websocket": "/ws",
  "docs": "https://github.com/pocketcloud/docs"
}
```

**Use Cases:**
- Standard discovery mechanism
- API endpoint discovery
- Service capability detection

### GET /api/connect-info

Connection information for authenticated users. Requires authentication.

**Response:**
```json
{
  "accessUrls": [
    "http://192.168.4.1",
    "http://pocketcloud.local",
    "http://192.168.1.100"
  ],
  "hotspot": {
    "ssid": "PocketCloud"
  },
  "qrContent": "http://192.168.4.1",
  "wifiQr": "WIFI:T:WPA;S:PocketCloud;P:;;;"
}
```

**Use Cases:**
- Generate QR codes for easy sharing
- Display connection instructions
- WiFi QR code generation (without password for security)

**Security Note:** WiFi password is never returned via API for security reasons.

## Client Implementation Examples

### iOS/Swift

```swift
import Network

class PocketCloudDiscovery {
    let browser = NWBrowser(for: .bonjour(type: "_pocketcloud._tcp", domain: nil), using: .tcp)
    
    func startDiscovery() {
        browser.stateUpdateHandler = { state in
            if case .ready = state {
                print("Discovery started")
            }
        }
        
        browser.browseResultsChangedHandler = { results, changes in
            for result in results {
                if case .service(let name, let type, let domain, _) = result.endpoint {
                    print("Found PocketCloud: \(name)")
                    self.connectTo(result)
                }
            }
        }
        
        browser.start(queue: .main)
    }
}
```

### Android/Kotlin

```kotlin
class PocketCloudDiscovery(private val context: Context) {
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    
    private val discoveryListener = object : NsdManager.DiscoveryListener {
        override fun onServiceFound(service: NsdServiceInfo) {
            if (service.serviceType == "_pocketcloud._tcp.") {
                nsdManager.resolveService(service, resolveListener)
            }
        }
        
        // ... other methods
    }
    
    fun startDiscovery() {
        nsdManager.discoverServices(
            "_pocketcloud._tcp",
            NsdManager.PROTOCOL_DNS_SD,
            discoveryListener
        )
    }
}
```

### JavaScript/Web

```javascript
// Simple HTTP discovery
async function discoverPocketCloud() {
  const possibleUrls = [
    'http://pocketcloud.local:3000',
    'http://192.168.4.1:3000',
    'http://192.168.1.1:3000'
  ];
  
  for (const url of possibleUrls) {
    try {
      const response = await fetch(`${url}/api/ping`, {
        timeout: 2000
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.service === 'pocketcloud') {
          return { url, info: data };
        }
      }
    } catch (error) {
      // Try next URL
    }
  }
  
  return null;
}
```

## Network Configuration

### DNS Configuration (dnsmasq)

For captive portal detection to work properly, DNS must redirect captive portal domains to PocketCloud.

Add to `/etc/dnsmasq.conf`:

```conf
# Redirect captive portal detection domains
address=/captive.apple.com/192.168.4.1
address=/www.apple.com/192.168.4.1
address=/connectivitycheck.gstatic.com/192.168.4.1
address=/connectivitycheck.android.com/192.168.4.1
address=/www.msftconnecttest.com/192.168.4.1
address=/www.msftncsi.com/192.168.4.1
address=/detectportal.firefox.com/192.168.4.1

# Local hostname
address=/pocketcloud.local/192.168.4.1
```

### Firewall Configuration

Ensure mDNS traffic is allowed:

```bash
# Allow mDNS (port 5353 UDP)
sudo ufw allow 5353/udp

# Allow HTTP (port 3000)
sudo ufw allow 3000/tcp
```

## Testing

### Test Captive Portal Detection

#### iOS/macOS
1. Connect to PocketCloud WiFi
2. Wait for "Sign in to Network" notification
3. Tap notification
4. Should open PocketCloud in Safari

#### Android
1. Connect to PocketCloud WiFi
2. Wait for "Sign in to network" notification
3. Tap notification
4. Should open PocketCloud in browser

#### Windows
1. Connect to PocketCloud WiFi
2. Captive portal browser should open automatically
3. Should show PocketCloud interface

### Test mDNS Resolution

```bash
# Test hostname resolution
ping pocketcloud.local

# Should resolve to 192.168.4.1 or local IP
# PING pocketcloud.local (192.168.4.1) 56(84) bytes of data.

# Test in browser
curl http://pocketcloud.local:3000/api/ping

# Should return JSON with service info
```

### Test Discovery API

```bash
# Test ping endpoint
curl http://192.168.4.1:3000/api/ping

# Should return:
# {
#   "service": "pocketcloud",
#   "version": "1.0.0",
#   ...
# }

# Test well-known endpoint
curl http://192.168.4.1:3000/.well-known/pocketcloud.json

# Should return API paths
```

### Test Captive Portal Responses

```bash
# Test Android detection (must return 204)
curl -I http://192.168.4.1:3000/generate_204

# Should return:
# HTTP/1.1 204 No Content

# Test Apple detection
curl http://192.168.4.1:3000/hotspot-detect.html

# Should return success HTML or redirect

# Test Windows detection
curl http://192.168.4.1:3000/ncsi.txt

# Should return:
# Microsoft NCSI
```

## Troubleshooting

### mDNS Not Working

**Problem:** `pocketcloud.local` doesn't resolve

**Solutions:**
1. Check Avahi is running: `sudo systemctl status avahi-daemon`
2. Restart Avahi: `sudo systemctl restart avahi-daemon`
3. Check hostname: `hostname` should return `pocketcloud`
4. Check service file: `cat /etc/avahi/services/pocketcloud.service`
5. Browse services: `avahi-browse -a` should show PocketCloud

### Captive Portal Not Appearing

**Problem:** No "Sign in to network" notification

**Solutions:**
1. Check DNS is redirecting: `nslookup captive.apple.com` should return 192.168.4.1
2. Check dnsmasq is running: `sudo systemctl status dnsmasq`
3. Restart dnsmasq: `sudo systemctl restart dnsmasq`
4. Check routes are registered: Captive routes must be FIRST in Express
5. Test manually: `curl http://192.168.4.1:3000/generate_204`

### Discovery API Not Responding

**Problem:** `/api/ping` returns error

**Solutions:**
1. Check server is running: `sudo systemctl status pocketcloud`
2. Check port is open: `sudo netstat -tlnp | grep 3000`
3. Check firewall: `sudo ufw status`
4. Test locally: `curl http://localhost:3000/api/ping`
5. Check logs: `sudo journalctl -u pocketcloud -f`

## Acceptance Criteria

✅ iPhone connects to PocketCloud WiFi → "Sign in to Network" notification appears  
✅ Tapping notification opens PocketCloud in Safari browser  
✅ Android connects → "Sign in to network" system notification appears  
✅ Windows connects → captive portal browser opens automatically  
✅ macOS: browser opens OR Finder shows pocketcloud.local in network  
✅ `ping pocketcloud.local` → resolves to 192.168.4.1  
✅ GET /api/ping → JSON with service info, no auth needed  
✅ `avahi-browse _pocketcloud._tcp` → shows PocketCloud service  
✅ GET /.well-known/pocketcloud.json → correct API paths  
✅ `curl -I http://192.168.4.1/generate_204` → HTTP/1.1 204 No Content (exact)

## Benefits

### For Users
- **Zero Configuration**: No IP addresses to remember
- **Automatic Discovery**: Device appears when connected
- **Native Integration**: Shows in OS file browsers
- **Instant Access**: Captive portal prompts immediately

### For Developers
- **Standard Protocols**: Uses mDNS, HTTP, well-known URIs
- **Cross-Platform**: Works on all major platforms
- **Easy Integration**: Simple REST API for discovery
- **Extensible**: Can add more service types

### Competitive Advantage
Commercial NAS devices often require manual IP configuration or proprietary apps. PocketCloud appears automatically like AirDrop or Chromecast - true zero-config experience.
