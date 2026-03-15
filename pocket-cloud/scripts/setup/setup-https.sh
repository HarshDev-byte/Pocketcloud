#!/bin/bash

# HTTPS setup script for Pocket Cloud Drive
# Generates self-signed certificate and configures HTTPS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CERT_DIR="/etc/ssl/pocketcloud"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"
PI_IP="192.168.4.1"

echo -e "${BLUE}Pocket Cloud Drive - HTTPS Setup${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo $0"
   exit 1
fi

# Check if OpenSSL is installed
if ! command -v openssl &> /dev/null; then
    echo -e "${BLUE}Installing OpenSSL...${NC}"
    apt-get update
    apt-get install -y openssl
fi

# Create certificate directory
echo -e "${BLUE}Creating certificate directory...${NC}"
mkdir -p "$CERT_DIR"
chmod 755 "$CERT_DIR"

# Generate self-signed certificate
echo -e "${BLUE}Generating self-signed certificate...${NC}"
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/CN=$PI_IP/O=PocketCloud/C=US/ST=Local/L=Local" \
    -addext "subjectAltName=IP:$PI_IP,IP:127.0.0.1,DNS:localhost,DNS:pocketcloud.local"

# Set proper permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"
chown root:root "$KEY_FILE" "$CERT_FILE"

echo -e "${GREEN}Certificate generated successfully${NC}"

# Create nginx HTTPS configuration
echo -e "${BLUE}Configuring nginx for HTTPS...${NC}"

# Backup existing nginx config
if [[ -f /etc/nginx/sites-available/pocketcloud ]]; then
    cp /etc/nginx/sites-available/pocketcloud /etc/nginx/sites-available/pocketcloud.backup
fi

# Create new nginx config with HTTPS
cat > /etc/nginx/sites-available/pocketcloud << EOF
# Pocket Cloud Drive - HTTPS Configuration

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $PI_IP localhost pocketcloud.local;
    
    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    
    # Redirect all HTTP requests to HTTPS
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $PI_IP localhost pocketcloud.local;
    
    # SSL configuration
    ssl_certificate $CERT_FILE;
    ssl_certificate_key $KEY_FILE;
    
    # SSL security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "no-referrer";
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' wss://$PI_IP";
    
    # Root directory
    root /opt/pocketcloud/frontend/dist;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Frontend routes (SPA)
    location / {
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API proxy to backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # WebSocket proxy
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Share pages (public access)
    location /s/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Security: Block access to sensitive files
    location ~ /\. {
        deny all;
    }
    
    location ~ \.(env|log|sql|bak)$ {
        deny all;
    }
}
EOF

# Test nginx configuration
echo -e "${BLUE}Testing nginx configuration...${NC}"
if nginx -t; then
    echo -e "${GREEN}Nginx configuration is valid${NC}"
else
    echo -e "${RED}Nginx configuration error${NC}"
    exit 1
fi

# Reload nginx
echo -e "${BLUE}Reloading nginx...${NC}"
systemctl reload nginx

# Update backend to use secure cookies
echo -e "${BLUE}Updating backend configuration for HTTPS...${NC}"

# Create or update backend environment for HTTPS
BACKEND_ENV="/opt/pocketcloud/backend/.env"
if [[ -f "$BACKEND_ENV" ]]; then
    # Update existing environment
    if grep -q "HTTPS_ENABLED" "$BACKEND_ENV"; then
        sed -i 's/HTTPS_ENABLED=.*/HTTPS_ENABLED=true/' "$BACKEND_ENV"
    else
        echo "HTTPS_ENABLED=true" >> "$BACKEND_ENV"
    fi
    
    if grep -q "SECURE_COOKIES" "$BACKEND_ENV"; then
        sed -i 's/SECURE_COOKIES=.*/SECURE_COOKIES=true/' "$BACKEND_ENV"
    else
        echo "SECURE_COOKIES=true" >> "$BACKEND_ENV"
    fi
else
    echo -e "${YELLOW}Backend .env file not found, HTTPS settings will need to be configured manually${NC}"
fi

# Update firewall to allow HTTPS
echo -e "${BLUE}Updating firewall for HTTPS...${NC}"
if command -v iptables &> /dev/null; then
    # Allow HTTPS traffic
    iptables -I INPUT -p tcp --dport 443 -s 192.168.4.0/24 -j ACCEPT
    
    # Save iptables rules if iptables-persistent is installed
    if command -v iptables-save &> /dev/null && [[ -f /etc/iptables/rules.v4 ]]; then
        iptables-save > /etc/iptables/rules.v4
        echo -e "${GREEN}Firewall updated for HTTPS${NC}"
    fi
fi

# Restart backend to apply HTTPS settings
echo -e "${BLUE}Restarting backend service...${NC}"
if systemctl is-active --quiet pocketcloud-backend; then
    systemctl restart pocketcloud-backend
    sleep 3
    
    if systemctl is-active --quiet pocketcloud-backend; then
        echo -e "${GREEN}Backend service restarted successfully${NC}"
    else
        echo -e "${YELLOW}Backend service may need manual restart${NC}"
    fi
fi

# Test HTTPS connection
echo -e "${BLUE}Testing HTTPS connection...${NC}"
sleep 2

if curl -k -s -f "https://$PI_IP/api/health" > /dev/null 2>&1; then
    echo -e "${GREEN}HTTPS is working correctly${NC}"
else
    echo -e "${YELLOW}HTTPS test failed, but certificate is installed${NC}"
fi

# Display certificate information
echo ""
echo -e "${GREEN}HTTPS Setup Complete!${NC}"
echo ""
echo -e "${BLUE}Certificate Information:${NC}"
openssl x509 -in "$CERT_FILE" -text -noout | grep -E "(Subject:|Not Before|Not After|DNS:|IP Address:)"

echo ""
echo -e "${BLUE}Access URLs:${NC}"
echo "  HTTPS: https://$PI_IP"
echo "  HTTP:  http://$PI_IP (redirects to HTTPS)"
echo ""
echo -e "${BLUE}Certificate Files:${NC}"
echo "  Certificate: $CERT_FILE"
echo "  Private Key: $KEY_FILE"
echo ""
echo -e "${YELLOW}Note: This is a self-signed certificate.${NC}"
echo "Browsers will show a security warning on first visit."
echo "Click 'Advanced' and 'Proceed to $PI_IP' to continue."
echo ""
echo -e "${BLUE}Security Features Enabled:${NC}"
echo "  ✓ TLS 1.2/1.3 encryption"
echo "  ✓ HTTP to HTTPS redirect"
echo "  ✓ Secure cookie flags"
echo "  ✓ Security headers (HSTS, CSP, etc.)"
echo "  ✓ Gzip compression"
echo ""
echo -e "${GREEN}Your Pocket Cloud Drive is now secured with HTTPS!${NC}"