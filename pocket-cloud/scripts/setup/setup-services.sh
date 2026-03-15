#!/bin/bash
# Pocket Cloud Drive - Services Setup Script
# Creates and enables systemd services

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}[SERVICES]${NC} $1"; }
print_success() { echo -e "${GREEN}[SERVICES]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[SERVICES]${NC} $1"; }
print_error() { echo -e "${RED}[SERVICES]${NC} $1"; }

APP_DIR="/opt/pocketcloud"

create_backend_service() {
    print_step "Creating Pocket Cloud Drive backend service..."
    
    cat > /etc/systemd/system/pocketcloud-backend.service << EOF
[Unit]
Description=Pocket Cloud Drive Backend Server
Documentation=https://github.com/pocketcloud/pocketcloud
After=network.target network-online.target
Wants=network-online.target
After=mnt-pocketcloud.mount
Requires=mnt-pocketcloud.mount

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=$APP_DIR/backend
ExecStart=/usr/bin/node dist/index.js
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StartLimitInterval=60s
StartLimitBurst=3

# Environment
Environment=NODE_ENV=production
Environment=NODE_OPTIONS="--max-old-space-size=512 --optimize-for-size"
EnvironmentFile=$APP_DIR/backend/.env

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR/backend/uploads /mnt/pocketcloud /var/log
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# Resource limits (important for Pi)
MemoryMax=512M
CPUQuota=80%
TasksMax=50

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pocketcloud-backend

[Install]
WantedBy=multi-user.target
EOF

    print_success "Backend service created"
}

create_nginx_service() {
    print_step "Creating nginx reverse proxy service..."
    
    # Install nginx if not present
    if ! command -v nginx >/dev/null 2>&1; then
        print_step "Installing nginx..."
        apt-get update -qq
        apt-get install -y -qq nginx
    fi
    
    # Create nginx configuration
    cat > /etc/nginx/sites-available/pocketcloud << 'EOF'
# Pocket Cloud Drive Nginx Configuration
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    server_name _;
    root /opt/pocketcloud/backend/public;
    index index.html;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for large file uploads
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # Buffer settings for uploads
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 50G;
    }
    
    # Static files
    location / {
        try_files $uri $uri/ /index.html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Disable cache for HTML files
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    
    # Security - hide sensitive files
    location ~ /\. {
        deny all;
    }
    
    location ~ /(package\.json|\.env|node_modules) {
        deny all;
    }
}
EOF

    # Enable site
    ln -sf /etc/nginx/sites-available/pocketcloud /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test nginx configuration
    if nginx -t; then
        print_success "Nginx configuration created and tested"
    else
        print_error "Nginx configuration test failed"
        exit 1
    fi
}

create_watchdog_service() {
    print_step "Creating system watchdog service..."
    
    cat > /etc/systemd/system/pocketcloud-watchdog.service << EOF
[Unit]
Description=Pocket Cloud Drive System Watchdog
After=pocketcloud-backend.service
Requires=pocketcloud-backend.service

[Service]
Type=simple
User=pi
Group=pi
ExecStart=/opt/pocketcloud/scripts/watchdog.sh
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

    # Create watchdog script
    cat > "$APP_DIR/scripts/watchdog.sh" << 'EOF'
#!/bin/bash
# Pocket Cloud Drive Watchdog Script
# Monitors system health and restarts services if needed

LOG_FILE="/var/log/pocketcloud-watchdog.log"
CHECK_INTERVAL=60  # seconds

log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

check_backend() {
    if ! curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
        log_message "Backend health check failed, restarting service"
        sudo systemctl restart pocketcloud-backend
        return 1
    fi
    return 0
}

check_storage() {
    if ! mountpoint -q /mnt/pocketcloud; then
        log_message "Storage not mounted, attempting to mount"
        sudo mount /mnt/pocketcloud
        return 1
    fi
    return 0
}

check_memory() {
    local mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    if [[ $mem_usage -gt 90 ]]; then
        log_message "High memory usage: ${mem_usage}%"
        return 1
    fi
    return 0
}

main() {
    log_message "Watchdog started"
    
    while true; do
        check_storage
        check_backend
        check_memory
        
        sleep $CHECK_INTERVAL
    done
}

main "$@"
EOF

    chmod +x "$APP_DIR/scripts/watchdog.sh"
    print_success "Watchdog service created"
}

create_backup_timer() {
    print_step "Creating automatic backup timer..."
    
    # Create backup service
    cat > /etc/systemd/system/pocketcloud-backup.service << EOF
[Unit]
Description=Pocket Cloud Drive Backup
After=pocketcloud-backend.service

[Service]
Type=oneshot
User=pi
Group=pi
ExecStart=$APP_DIR/scripts/backup.sh
StandardOutput=journal
StandardError=journal
EOF

    # Create backup timer (daily at 2 AM)
    cat > /etc/systemd/system/pocketcloud-backup.timer << EOF
[Unit]
Description=Daily Pocket Cloud Drive Backup
Requires=pocketcloud-backup.service

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=1800

[Install]
WantedBy=timers.target
EOF

    print_success "Backup timer created (daily at 2 AM)"
}

configure_log_rotation() {
    print_step "Configuring log rotation..."
    
    cat > /etc/logrotate.d/pocketcloud << EOF
# Pocket Cloud Drive log rotation
/var/log/pocketcloud*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    copytruncate
    su pi pi
}

# Journal logs for pocketcloud services
/var/log/journal/*/*pocketcloud* {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF

    print_success "Log rotation configured"
}

enable_services() {
    print_step "Enabling and starting services..."
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable network services
    systemctl enable hostapd
    systemctl enable dnsmasq
    
    # Enable web server
    systemctl enable nginx
    
    # Enable application services
    systemctl enable pocketcloud-backend
    systemctl enable pocketcloud-watchdog
    
    # Enable backup timer
    systemctl enable pocketcloud-backup.timer
    
    print_success "Services enabled"
}

start_services() {
    print_step "Starting services..."
    
    # Start network services
    if systemctl start hostapd; then
        print_success "hostapd started"
    else
        print_warning "hostapd failed to start (will work after reboot)"
    fi
    
    if systemctl start dnsmasq; then
        print_success "dnsmasq started"
    else
        print_warning "dnsmasq failed to start (will work after reboot)"
    fi
    
    # Start web server
    if systemctl start nginx; then
        print_success "nginx started"
    else
        print_error "nginx failed to start"
        systemctl status nginx --no-pager
    fi
    
    # Start application
    if systemctl start pocketcloud-backend; then
        print_success "Pocket Cloud Drive backend started"
    else
        print_error "Backend failed to start"
        systemctl status pocketcloud-backend --no-pager
        exit 1
    fi
    
    # Start watchdog
    if systemctl start pocketcloud-watchdog; then
        print_success "Watchdog started"
    else
        print_warning "Watchdog failed to start"
    fi
    
    # Start backup timer
    systemctl start pocketcloud-backup.timer
    print_success "Backup timer started"
}

verify_services() {
    print_step "Verifying service status..."
    
    local services=(
        "hostapd"
        "dnsmasq"
        "nginx"
        "pocketcloud-backend"
        "pocketcloud-watchdog"
    )
    
    local failed_services=()
    
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            print_success "$service is running"
        else
            print_warning "$service is not running"
            failed_services+=("$service")
        fi
    done
    
    # Check if backend is responding
    sleep 5
    if curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
        print_success "Backend API is responding"
    else
        print_warning "Backend API is not responding yet"
    fi
    
    # Check if nginx is serving content
    if curl -s http://localhost/ >/dev/null 2>&1; then
        print_success "Web server is responding"
    else
        print_warning "Web server is not responding yet"
    fi
    
    if [[ ${#failed_services[@]} -gt 0 ]]; then
        print_warning "Some services failed to start: ${failed_services[*]}"
        print_step "These services should start automatically after reboot"
    fi
}

create_service_management_script() {
    print_step "Creating service management script..."
    
    cat > "$APP_DIR/scripts/manage-services.sh" << 'EOF'
#!/bin/bash
# Pocket Cloud Drive Service Management Script

case "$1" in
    start)
        echo "Starting Pocket Cloud Drive services..."
        sudo systemctl start pocketcloud-backend
        sudo systemctl start pocketcloud-watchdog
        sudo systemctl start nginx
        ;;
    stop)
        echo "Stopping Pocket Cloud Drive services..."
        sudo systemctl stop pocketcloud-watchdog
        sudo systemctl stop pocketcloud-backend
        sudo systemctl stop nginx
        ;;
    restart)
        echo "Restarting Pocket Cloud Drive services..."
        sudo systemctl restart pocketcloud-backend
        sudo systemctl restart pocketcloud-watchdog
        sudo systemctl restart nginx
        ;;
    status)
        echo "Pocket Cloud Drive service status:"
        sudo systemctl status pocketcloud-backend --no-pager
        sudo systemctl status pocketcloud-watchdog --no-pager
        sudo systemctl status nginx --no-pager
        ;;
    logs)
        echo "Pocket Cloud Drive logs:"
        sudo journalctl -u pocketcloud-backend -f
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
EOF

    chmod +x "$APP_DIR/scripts/manage-services.sh"
    print_success "Service management script created"
}

main() {
    print_step "Starting services setup..."
    
    create_backend_service
    create_nginx_service
    create_watchdog_service
    create_backup_timer
    configure_log_rotation
    create_service_management_script
    enable_services
    start_services
    verify_services
    
    print_success "Services setup completed successfully"
    
    echo
    print_step "Service Management Commands:"
    echo "  Start:   sudo systemctl start pocketcloud-backend"
    echo "  Stop:    sudo systemctl stop pocketcloud-backend"
    echo "  Restart: sudo systemctl restart pocketcloud-backend"
    echo "  Status:  sudo systemctl status pocketcloud-backend"
    echo "  Logs:    sudo journalctl -u pocketcloud-backend -f"
    echo "  Manage:  $APP_DIR/scripts/manage-services.sh {start|stop|restart|status|logs}"
}

# Rollback instructions (as comments for reference):
# To rollback services setup:
# 1. sudo systemctl stop pocketcloud-backend pocketcloud-watchdog nginx
# 2. sudo systemctl disable pocketcloud-backend pocketcloud-watchdog nginx
# 3. sudo rm /etc/systemd/system/pocketcloud-*.service
# 4. sudo rm /etc/systemd/system/pocketcloud-*.timer
# 5. sudo rm /etc/nginx/sites-available/pocketcloud
# 6. sudo rm /etc/nginx/sites-enabled/pocketcloud
# 7. sudo systemctl daemon-reload

main "$@"