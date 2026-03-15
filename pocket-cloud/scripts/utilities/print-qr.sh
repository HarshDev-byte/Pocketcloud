#!/bin/bash

# Generate and print QR codes for PocketCloud WiFi and web access
# Creates QR codes that can be scanned to connect to WiFi and open the app

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Install qrencode if not present
if ! command -v qrencode >/dev/null 2>&1; then
    log_info "Installing qrencode..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y qrencode
    elif command -v brew >/dev/null 2>&1; then
        brew install qrencode
    else
        log_error "Please install qrencode manually"
        exit 1
    fi
fi

# Get WiFi configuration
SSID="PocketCloud-XXXX"
PASSWORD="pocketcloud123"

if [[ -f /etc/hostapd/hostapd.conf ]]; then
    SSID=$(grep "^ssid=" /etc/hostapd/hostapd.conf | cut -d'=' -f2 || echo "PocketCloud-XXXX")
    PASSWORD=$(grep "^wpa_passphrase=" /etc/hostapd/hostapd.conf | cut -d'=' -f2 || echo "pocketcloud123")
fi

# Get device name
DEVICE_NAME=${DEVICE_NAME:-"PocketCloud Drive"}

log_info "Generating QR codes for PocketCloud..."
echo "======================================"
echo

# 1. WiFi Connection QR Code
log_info "1. WiFi Connection QR Code"
echo "   SSID: $SSID"
echo "   Password: $PASSWORD"
echo

WIFI_QR="WIFI:T:WPA;S:$SSID;P:$PASSWORD;;"

echo "WiFi QR Code (scan to connect):"
qrencode -t ANSIUTF8 "$WIFI_QR"
echo

# 2. Web App QR Code  
log_info "2. Web App QR Code"
echo "   URL: http://192.168.4.1"
echo

WEB_QR="http://192.168.4.1"

echo "Web App QR Code (scan to open):"
qrencode -t ANSIUTF8 "$WEB_QR"
echo

# 3. Combined Setup QR Code (custom format)
log_info "3. Combined Setup QR Code"
echo "   Contains: WiFi + Web URL + Device Info"
echo

SETUP_QR="pocketcloud://setup?ssid=$SSID&password=$PASSWORD&url=http://192.168.4.1&name=$DEVICE_NAME"

echo "Setup QR Code (for PocketCloud apps):"
qrencode -t ANSIUTF8 "$SETUP_QR"
echo

# 4. Generate printable versions
log_info "Generating printable QR codes..."

# Create output directory
mkdir -p /tmp/pocketcloud-qr

# Generate PNG files for printing
qrencode -o /tmp/pocketcloud-qr/wifi.png -s 8 "$WIFI_QR"
qrencode -o /tmp/pocketcloud-qr/webapp.png -s 8 "$WEB_QR"  
qrencode -o /tmp/pocketcloud-qr/setup.png -s 8 "$SETUP_QR"

log_success "QR code images saved to /tmp/pocketcloud-qr/"

# Generate printable label HTML
cat > /tmp/pocketcloud-qr/label.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>PocketCloud QR Codes</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .qr-section { 
            border: 2px solid #333; 
            margin: 20px 0; 
            padding: 15px; 
            text-align: center;
            page-break-inside: avoid;
        }
        .qr-code { margin: 10px 0; }
        .device-info { 
            background: #f0f0f0; 
            padding: 10px; 
            margin: 10px 0; 
            border-radius: 5px;
        }
        h1 { color: #333; text-align: center; }
        h2 { color: #666; }
        .instructions { font-size: 14px; color: #666; margin-top: 10px; }
        @media print {
            body { margin: 0; }
            .qr-section { page-break-after: always; }
        }
    </style>
</head>
<body>
    <h1>📱 $DEVICE_NAME</h1>
    
    <div class="device-info">
        <strong>Device:</strong> $DEVICE_NAME<br>
        <strong>Network:</strong> $SSID<br>
        <strong>URL:</strong> http://192.168.4.1<br>
        <strong>Generated:</strong> $(date)
    </div>

    <div class="qr-section">
        <h2>📶 Connect to WiFi</h2>
        <div class="qr-code">
            <img src="wifi.png" alt="WiFi QR Code" style="width: 200px; height: 200px;">
        </div>
        <div><strong>Network:</strong> $SSID</div>
        <div><strong>Password:</strong> $PASSWORD</div>
        <div class="instructions">
            Scan with your phone's camera to connect to WiFi automatically
        </div>
    </div>

    <div class="qr-section">
        <h2>🌐 Open Web App</h2>
        <div class="qr-code">
            <img src="webapp.png" alt="Web App QR Code" style="width: 200px; height: 200px;">
        </div>
        <div><strong>URL:</strong> http://192.168.4.1</div>
        <div class="instructions">
            Scan to open PocketCloud in your browser
        </div>
    </div>

    <div class="qr-section">
        <h2>⚡ Quick Setup</h2>
        <div class="qr-code">
            <img src="setup.png" alt="Setup QR Code" style="width: 200px; height: 200px;">
        </div>
        <div class="instructions">
            Scan with PocketCloud mobile app for instant setup
        </div>
    </div>

    <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #999;">
        PocketCloud Drive - Personal Cloud Storage<br>
        Stick this label on your device for easy access
    </div>
</body>
</html>
EOF

log_success "Printable label created: /tmp/pocketcloud-qr/label.html"

# Generate text versions for terminal display
cat > /tmp/pocketcloud-qr/qr-codes.txt << EOF
PocketCloud Drive QR Codes
==========================

Device: $DEVICE_NAME
Network: $SSID  
Password: $PASSWORD
URL: http://192.168.4.1
Generated: $(date)

WiFi Connection:
$WIFI_QR

Web App:  
$WEB_QR

Setup (for apps):
$SETUP_QR

Instructions:
1. Print the label.html file and stick it on your device
2. Users can scan the WiFi QR to connect automatically  
3. Users can scan the Web QR to open PocketCloud
4. Mobile apps can scan the Setup QR for instant configuration

EOF

log_success "Text file created: /tmp/pocketcloud-qr/qr-codes.txt"

echo
echo "📋 Summary:"
echo "==========="
echo "✅ WiFi QR Code: Connects to $SSID"
echo "✅ Web App QR Code: Opens http://192.168.4.1"  
echo "✅ Setup QR Code: For mobile app configuration"
echo "✅ Printable label: /tmp/pocketcloud-qr/label.html"
echo "✅ PNG files: /tmp/pocketcloud-qr/*.png"
echo
echo "💡 Usage:"
echo "   - Print label.html and stick on device"
echo "   - Share QR codes with users for easy access"
echo "   - No more typing IP addresses or WiFi passwords!"
echo
echo "🖨️  To print:"
echo "   Open /tmp/pocketcloud-qr/label.html in browser and print"