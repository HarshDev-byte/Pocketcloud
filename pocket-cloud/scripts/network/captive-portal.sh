#!/bin/bash

# PocketCloud Captive Portal Setup Script
# Configures captive portal detection responses for automatic connection prompts

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Dry run mode
DRYRUN=${DRYRUN:-0}

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

# Dry run wrapper
run_cmd() {
    if [[ $DRYRUN -eq 1 ]]; then
        echo -e "${YELLOW}[DRYRUN]${NC} $*"
    else
        "$@"
    fi
}

# Signal handler for graceful shutdown
cleanup() {
    log_warning "Setup interrupted"
    exit 130
}
trap cleanup SIGINT SIGTERM

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

log_info "Setting up PocketCloud captive portal..."

# Create captive portal response directory
CAPTIVE_DIR="/var/www/captive"
log_info "Creating captive portal directory: $CAPTIVE_DIR"
run_cmd mkdir -p "$CAPTIVE_DIR"

# Apple captive portal detection responses
log_info "Creating Apple captive portal responses..."

# Apple hotspot-detect.html
run_cmd tee "$CAPTIVE_DIR/hotspot-detect.html" > /dev/null << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>PocketCloud</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: #f5f5f7;
        }
        .container { 
            max-width: 400px; 
            margin: 0 auto; 
            background: white; 
            padding: 30px; 
            border-radius: 12px; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        h1 { color: #1d1d1f; margin-bottom: 20px; }
        .button { 
            display: inline-block; 
            background: #007aff; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 8px; 
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 PocketCloud</h1>
        <p>Welcome to your personal cloud storage!</p>
        <a href="http://192.168.4.1" class="button">Access PocketCloud</a>
    </div>
</body>
</html>
EOF

# Apple library test success
run_cmd mkdir -p "$CAPTIVE_DIR/library/test"
run_cmd tee "$CAPTIVE_DIR/library/test/success.html" > /dev/null << 'EOF'
Success
EOF

# Android captive portal detection responses
log_info "Creating Android captive portal responses..."

# Android generate_204 (empty response with 204 status)
run_cmd tee "$CAPTIVE_DIR/generate_204" > /dev/null << 'EOF'
EOF

# Windows captive portal detection responses
log_info "Creating Windows captive portal responses..."

# Windows NCSI response
run_cmd tee "$CAPTIVE_DIR/ncsi.txt" > /dev/null << 'EOF'
Microsoft NCSI
EOF

# Create redirect page
run_cmd tee "$CAPTIVE_DIR/redirect.html" > /dev/null << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>PocketCloud - Redirecting</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=http://192.168.4.1">
    <style>
        body { 
            font-family: system-ui, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: #f0f0f0;
        }
        .spinner { 
            border: 4px solid #f3f3f3; 
            border-top: 4px solid #007aff; 
            border-radius: 50%; 
            width: 40px; 
            height: 40px; 
            animation: spin 1s linear infinite; 
            margin: 20px auto;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <h1>🌐 PocketCloud</h1>
    <div class="spinner"></div>
    <p>Redirecting to PocketCloud...</p>
    <p><a href="http://192.168.4.1">Click here if not redirected automatically</a></p>
</body>
</html>
EOF

# Set proper permissions
log_info "Setting file permissions..."
run_cmd chown -R www-data:www-data "$CAPTIVE_DIR"
run_cmd chmod -R 644 "$CAPTIVE_DIR"
run_cmd find "$CAPTIVE_DIR" -type d -exec chmod 755 {} \;

# Configure nginx for captive portal (if nginx is installed)
if command -v nginx >/dev/null 2>&1; then
    log_info "Configuring nginx for captive portal..."
    
    run_cmd tee /etc/nginx/sites-available/captive-portal > /dev/null << EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    server_name _;
    root $CAPTIVE_DIR;
    index hotspot-detect.html;
    
    # Apple captive portal detection
    location = /hotspot-detect.html {
        return 200 'Success';
        add_header Content-Type text/html;
    }
    
    location = /library/test/success.html {
        return 200 'Success';
        add_header Content-Type text/html;
    }
    
    # Android captive portal detection
    location = /generate_204 {
        return 204;
    }
    
    location = /connectivitycheck.gstatic.com/generate_204 {
        return 204;
    }
    
    # Windows captive portal detection
    location = /ncsi.txt {
        return 200 'Microsoft NCSI';
        add_header Content-Type text/plain;
    }
    
    # Redirect all other requests to PocketCloud
    location = /redirect {
        return 302 http://192.168.4.1;
    }
    
    # Serve captive portal page for all other requests
    location / {
        try_files \$uri \$uri/ /hotspot-detect.html;
    }
    
    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    
    # Enable the site
    run_cmd ln -sf /etc/nginx/sites-available/captive-portal /etc/nginx/sites-enabled/
    
    # Remove default nginx site
    run_cmd rm -f /etc/nginx/sites-enabled/default
    
    # Test nginx configuration
    if [[ $DRYRUN -eq 0 ]]; then
        if nginx -t; then
            log_success "Nginx configuration is valid"
        else
            log_error "Nginx configuration test failed"
            exit 1
        fi
    fi
else
    log_warning "Nginx not found. Captive portal files created but web server not configured."
fi

# Configure iptables rules for captive portal
log_info "Configuring iptables for captive portal..."

if [[ $DRYRUN -eq 0 ]]; then
    # Redirect all HTTP traffic from wlan0 to local web server
    iptables -t nat -C PREROUTING -i wlan0 -p tcp --dport 80 -j DNAT --to-destination 192.168.4.1:80 2>/dev/null || \
        iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 -j DNAT --to-destination 192.168.4.1:80
    
    # Redirect DNS queries to local DNS server
    iptables -t nat -C PREROUTING -i wlan0 -p udp --dport 53 -j DNAT --to-destination 192.168.4.1:53 2>/dev/null || \
        iptables -t nat -A PREROUTING -i wlan0 -p udp --dport 53 -j DNAT --to-destination 192.168.4.1:53
    
    iptables -t nat -C PREROUTING -i wlan0 -p tcp --dport 53 -j DNAT --to-destination 192.168.4.1:53 2>/dev/null || \
        iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 53 -j DNAT --to-destination 192.168.4.1:53
    
    # Save iptables rules
    iptables-save > /etc/iptables/rules.v4
    
    log_success "Iptables rules configured and saved"
else
    log_info "[DRYRUN] Would configure iptables rules for HTTP and DNS redirection"
fi

log_success "Captive portal setup completed!"
echo
log_info "Captive Portal Configuration:"
log_info "  Document root: $CAPTIVE_DIR"
log_info "  Apple detection: /hotspot-detect.html, /library/test/success.html"
log_info "  Android detection: /generate_204"
log_info "  Windows detection: /ncsi.txt"
log_info "  Redirect page: /redirect"
echo
log_info "When devices connect to the hotspot, they should automatically"
log_info "receive a captive portal prompt directing them to PocketCloud."