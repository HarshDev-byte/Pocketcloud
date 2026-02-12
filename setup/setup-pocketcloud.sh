#!/bin/bash

# PocketCloud Complete Setup Script for Raspberry Pi
# This script sets up the entire PocketCloud project with drive verification

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
MOUNT_POINT="/mnt/pocketcloud-storage"
PROJECT_DIR="/home/pi/pocketcloud"
SERVICE_NAME="pocketcloud"
USER="pi"
NODE_VERSION="18"

# Functions
print_header() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║        🚀 PocketCloud Complete Setup for Raspberry Pi        ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${PURPLE}[INFO]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_pi() {
    print_step "Checking if running on Raspberry Pi..."
    
    if [ ! -f /proc/device-tree/model ]; then
        print_warning "Not running on Raspberry Pi - continuing anyway"
        return 0
    fi
    
    PI_MODEL=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0')
    print_success "Running on: $PI_MODEL"
    
    # Check if Pi 4 for better performance recommendations
    if echo "$PI_MODEL" | grep -q "Raspberry Pi 4"; then
        print_info "Pi 4 detected - will use optimized settings"
        export PI_VERSION=4
    else
        print_info "Older Pi detected - will use conservative settings"
        export PI_VERSION=3
    fi
}

verify_usb_drive() {
    print_step "Verifying USB drive setup..."
    
    if ! mountpoint -q "$MOUNT_POINT"; then
        print_error "USB drive is not mounted at $MOUNT_POINT"
        echo "Please run ./setup/setup-usb-storage.sh first to set up your USB drive"
        exit 1
    fi
    
    # Check required directories
    REQUIRED_DIRS=("uploads" "encrypted" "thumbnails" "temp" "backups")
    for dir in "${REQUIRED_DIRS[@]}"; do
        if [ ! -d "$MOUNT_POINT/$dir" ]; then
            print_error "Required directory missing: $MOUNT_POINT/$dir"
            echo "Please run ./setup/setup-usb-storage.sh to create the proper directory structure"
            exit 1
        fi
    done
    
    # Check write permissions
    TEST_FILE="$MOUNT_POINT/.setup_test_$$"
    if ! echo "test" > "$TEST_FILE" 2>/dev/null; then
        print_error "Cannot write to USB drive at $MOUNT_POINT"
        echo "Please check drive permissions and mount status"
        exit 1
    fi
    rm -f "$TEST_FILE"
    
    # Get drive info
    DRIVE_SIZE=$(df -h "$MOUNT_POINT" | tail -1 | awk '{print $2}')
    DRIVE_USED=$(df -h "$MOUNT_POINT" | tail -1 | awk '{print $3}')
    DRIVE_AVAIL=$(df -h "$MOUNT_POINT" | tail -1 | awk '{print $4}')
    
    print_success "USB drive verified: $DRIVE_SIZE total, $DRIVE_AVAIL available"
}

update_system() {
    print_step "Updating system packages..."
    
    apt update
    apt upgrade -y
    
    print_success "System updated"
}

install_nodejs() {
    print_step "Installing Node.js $NODE_VERSION..."
    
    # Check if Node.js is already installed with correct version
    if command -v node >/dev/null 2>&1; then
        CURRENT_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$CURRENT_VERSION" = "$NODE_VERSION" ]; then
            print_success "Node.js $NODE_VERSION already installed"
            return 0
        fi
    fi
    
    # Install Node.js
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
    
    # Verify installation
    NODE_VER=$(node --version)
    NPM_VER=$(npm --version)
    
    print_success "Node.js installed: $NODE_VER, npm: $NPM_VER"
}

install_system_dependencies() {
    print_step "Installing system dependencies..."
    
    # Essential packages
    apt install -y \
        git \
        sqlite3 \
        build-essential \
        python3-dev \
        curl \
        wget \
        unzip \
        htop \
        iotop \
        nginx \
        logrotate
    
    # FFmpeg for media processing
    apt install -y ffmpeg
    
    # Install PM2 globally
    npm install -g pm2
    
    print_success "System dependencies installed"
}

setup_project_directory() {
    print_step "Setting up project directory..."
    
    # Ensure we're in the right directory
    if [ ! -f "package.json" ] && [ ! -d "backend" ]; then
        print_error "Not in PocketCloud project directory!"
        echo "Please run this script from the PocketCloud project root directory"
        exit 1
    fi
    
    # Get current directory
    CURRENT_DIR=$(pwd)
    
    # If not in expected location, create symlink
    if [ "$CURRENT_DIR" != "$PROJECT_DIR" ]; then
        if [ ! -d "$PROJECT_DIR" ]; then
            print_info "Creating project directory at $PROJECT_DIR"
            mkdir -p "$(dirname "$PROJECT_DIR")"
            ln -sf "$CURRENT_DIR" "$PROJECT_DIR"
        fi
    fi
    
    # Set ownership
    chown -R "$USER:$USER" "$CURRENT_DIR"
    
    print_success "Project directory configured"
}

install_project_dependencies() {
    print_step "Installing project dependencies..."
    
    # Install backend dependencies
    print_info "Installing backend dependencies..."
    cd backend
    sudo -u "$USER" npm install --production
    
    # Install frontend dependencies and build
    print_info "Installing frontend dependencies..."
    cd ../frontend
    sudo -u "$USER" npm install
    
    print_info "Building frontend..."
    sudo -u "$USER" npm run build
    
    # Copy built files to backend public directory
    mkdir -p ../backend/public
    cp -r dist/* ../backend/public/
    chown -R "$USER:$USER" ../backend/public
    
    cd ..
    
    print_success "Project dependencies installed and frontend built"
}

create_environment_config() {
    print_step "Creating environment configuration..."
    
    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
        else
            cat > .env << 'EOF'
# PocketCloud Environment Configuration

# Storage paths (USB drive)
STORAGE_PATH=/mnt/pocketcloud-storage/uploads
ENCRYPTED_PATH=/mnt/pocketcloud-storage/encrypted
THUMBNAIL_PATH=/mnt/pocketcloud-storage/thumbnails
TEMP_PATH=/mnt/pocketcloud-storage/temp
BACKUP_PATH=/mnt/pocketcloud-storage/backups

# Database path (USB drive for persistence)
DATABASE_PATH=/mnt/pocketcloud-storage/pocketcloud.db

# Server configuration
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# Security (CHANGE THESE!)
SESSION_SECRET=change-this-super-secret-session-key-now
ENCRYPTION_KEY=change-this-32-char-encryption-key

# Pi-specific optimizations
MAX_CONCURRENT_UPLOADS=2
THUMBNAIL_QUALITY=80
VIDEO_TRANSCODE_PRESET=ultrafast
MEMORY_LIMIT=512MB
EOF
        fi
    fi
    
    # Generate random secrets if they're still default
    if grep -q "change-this" .env; then
        print_info "Generating secure random secrets..."
        
        # Generate session secret
        SESSION_SECRET=$(openssl rand -base64 32)
        sed -i "s/change-this-super-secret-session-key-now/$SESSION_SECRET/" .env
        
        # Generate encryption key (32 characters)
        ENCRYPTION_KEY=$(openssl rand -base64 24)
        sed -i "s/change-this-32-char-encryption-key/$ENCRYPTION_KEY/" .env
    fi
    
    # Set Pi-specific optimizations based on model
    if [ "${PI_VERSION:-3}" = "4" ]; then
        sed -i 's/MAX_CONCURRENT_UPLOADS=2/MAX_CONCURRENT_UPLOADS=3/' .env
        sed -i 's/MEMORY_LIMIT=512MB/MEMORY_LIMIT=1GB/' .env
    fi
    
    chown "$USER:$USER" .env
    chmod 600 .env
    
    print_success "Environment configuration created"
}

create_storage_config() {
    print_step "Creating storage configuration..."
    
    # Create storage config for backend
    cat > backend/src/config/storage.js << 'EOF'
module.exports = {
  STORAGE_PATH: '/mnt/pocketcloud-storage/uploads',
  ENCRYPTED_PATH: '/mnt/pocketcloud-storage/encrypted',
  THUMBNAIL_PATH: '/mnt/pocketcloud-storage/thumbnails',
  TEMP_PATH: '/mnt/pocketcloud-storage/temp',
  BACKUP_PATH: '/mnt/pocketcloud-storage/backups',
  
  // File settings
  MAX_FILE_SIZE: '500MB',
  ALLOWED_EXTENSIONS: [
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
    // Videos
    '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm',
    // Audio
    '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a',
    // Documents
    '.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt',
    // Archives
    '.zip', '.rar', '.7z', '.tar', '.gz'
  ],
  
  // Thumbnail settings
  THUMBNAIL_SIZES: {
    small: { width: 150, height: 150 },
    medium: { width: 300, height: 300 },
    large: { width: 800, height: 600 }
  },
  
  // Performance settings for Pi
  CONCURRENT_OPERATIONS: 2,
  MEMORY_LIMIT: '512MB',
  TEMP_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
  
  // Cleanup settings
  AUTO_CLEANUP: true,
  CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  TEMP_FILE_MAX_AGE: 2 * 60 * 60 * 1000, // 2 hours
};
EOF
    
    chown "$USER:$USER" backend/src/config/storage.js
    
    print_success "Storage configuration created"
}

initialize_database() {
    print_step "Initializing database..."
    
    # Create database directory
    mkdir -p "$MOUNT_POINT/database"
    chown "$USER:$USER" "$MOUNT_POINT/database"
    
    # Initialize database
    cd backend
    
    # Check if database initialization script exists
    if [ -f "src/config/database.js" ]; then
        print_info "Running database initialization..."
        sudo -u "$USER" node -e "
        const { initDatabase } = require('./src/config/database');
        initDatabase().then(() => {
          console.log('Database initialized successfully');
          process.exit(0);
        }).catch(err => {
          console.error('Database initialization failed:', err);
          process.exit(1);
        });
        "
    else
        print_warning "Database initialization script not found - will be created on first run"
    fi
    
    cd ..
    
    print_success "Database initialized"
}

create_systemd_service() {
    print_step "Creating systemd service..."
    
    # Determine memory limit based on Pi version
    MEMORY_LIMIT="1G"
    if [ "${PI_VERSION:-3}" = "3" ]; then
        MEMORY_LIMIT="512M"
    fi
    
    cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=PocketCloud Personal Cloud Storage
After=network.target
Wants=network.target
RequiresMountsFor=$MOUNT_POINT

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$PROJECT_DIR/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

# Environment
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=$PROJECT_DIR/.env

# Resource limits for Pi
LimitNOFILE=65536
MemoryLimit=$MEMORY_LIMIT

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$MOUNT_POINT
ReadWritePaths=/tmp
ReadWritePaths=/var/log

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    print_success "Systemd service created and enabled"
}

setup_nginx() {
    print_step "Configuring Nginx reverse proxy..."
    
    # Create Nginx configuration
    cat > /etc/nginx/sites-available/pocketcloud << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Increase upload size
    client_max_body_size 500M;
    client_body_timeout 300s;
    client_header_timeout 300s;
    
    # Proxy to Node.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for large uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # Serve static files directly (if needed)
    location /static/ {
        alias /home/pi/pocketcloud/backend/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
EOF
    
    # Enable site and disable default
    ln -sf /etc/nginx/sites-available/pocketcloud /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test Nginx configuration
    if nginx -t; then
        systemctl enable nginx
        print_success "Nginx configured successfully"
    else
        print_error "Nginx configuration test failed"
        return 1
    fi
}

setup_logging() {
    print_step "Setting up logging..."
    
    # Create log directory
    mkdir -p /var/log/pocketcloud
    chown "$USER:$USER" /var/log/pocketcloud
    
    # Create logrotate configuration
    cat > /etc/logrotate.d/pocketcloud << 'EOF'
/var/log/pocketcloud/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 pi pi
    postrotate
        systemctl reload pocketcloud > /dev/null 2>&1 || true
    endscript
}
EOF
    
    print_success "Logging configured"
}

create_maintenance_scripts() {
    print_step "Creating maintenance scripts..."
    
    # Create backup script
    cat > /home/pi/backup-pocketcloud.sh << 'EOF'
#!/bin/bash
# PocketCloud Backup Script

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/mnt/pocketcloud-storage/backups"
DB_PATH="/mnt/pocketcloud-storage/pocketcloud.db"

echo "Starting PocketCloud backup at $(date)"

# Backup database
if [ -f "$DB_PATH" ]; then
    sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/db_backup_$BACKUP_DATE.db"
    echo "Database backed up: db_backup_$BACKUP_DATE.db"
fi

# Create full backup (excluding temp files)
tar -czf "$BACKUP_DIR/full_backup_$BACKUP_DATE.tar.gz" \
    --exclude="*/temp/*" \
    --exclude="*/backups/*" \
    /mnt/pocketcloud-storage/

echo "Full backup created: full_backup_$BACKUP_DATE.tar.gz"

# Keep only last 7 backups
cd "$BACKUP_DIR"
ls -t db_backup_*.db | tail -n +8 | xargs -r rm
ls -t full_backup_*.tar.gz | tail -n +4 | xargs -r rm

echo "Backup completed at $(date)"
EOF
    
    chmod +x /home/pi/backup-pocketcloud.sh
    chown "$USER:$USER" /home/pi/backup-pocketcloud.sh
    
    # Create cleanup script
    cat > /home/pi/cleanup-pocketcloud.sh << 'EOF'
#!/bin/bash
# PocketCloud Cleanup Script

echo "Starting PocketCloud cleanup at $(date)"

# Clean temp directory
find /mnt/pocketcloud-storage/temp -type f -mtime +1 -delete
echo "Cleaned temp files older than 1 day"

# Vacuum database
sqlite3 /mnt/pocketcloud-storage/pocketcloud.db "VACUUM;"
echo "Database vacuumed"

# Clean old logs
find /var/log/pocketcloud -name "*.log" -mtime +7 -delete
echo "Cleaned old log files"

echo "Cleanup completed at $(date)"
EOF
    
    chmod +x /home/pi/cleanup-pocketcloud.sh
    chown "$USER:$USER" /home/pi/cleanup-pocketcloud.sh
    
    print_success "Maintenance scripts created"
}

setup_cron_jobs() {
    print_step "Setting up automated tasks..."
    
    # Create cron jobs for pi user
    sudo -u "$USER" crontab -l 2>/dev/null > /tmp/crontab_backup || true
    
    # Add backup job (daily at 2 AM)
    echo "0 2 * * * /home/pi/backup-pocketcloud.sh >> /var/log/pocketcloud/backup.log 2>&1" >> /tmp/crontab_backup
    
    # Add cleanup job (daily at 3 AM)
    echo "0 3 * * * /home/pi/cleanup-pocketcloud.sh >> /var/log/pocketcloud/cleanup.log 2>&1" >> /tmp/crontab_backup
    
    # Add drive monitoring (every 6 hours)
    echo "0 */6 * * * /home/pi/pocketcloud/monitor-usb-drive.sh >> /var/log/pocketcloud/monitor.log 2>&1" >> /tmp/crontab_backup
    
    # Install crontab
    sudo -u "$USER" crontab /tmp/crontab_backup
    rm /tmp/crontab_backup
    
    print_success "Automated tasks configured"
}

start_services() {
    print_step "Starting services..."
    
    # Start and enable Nginx
    systemctl start nginx
    systemctl enable nginx
    
    # Start PocketCloud service
    systemctl start "$SERVICE_NAME"
    
    # Wait a moment for services to start
    sleep 5
    
    print_success "Services started"
}

verify_installation() {
    print_step "Verifying installation..."
    
    # Check if PocketCloud service is running
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_success "PocketCloud service is running"
    else
        print_error "PocketCloud service is not running"
        systemctl status "$SERVICE_NAME" --no-pager
        return 1
    fi
    
    # Check if Nginx is running
    if systemctl is-active --quiet nginx; then
        print_success "Nginx is running"
    else
        print_warning "Nginx is not running"
    fi
    
    # Check if port 3000 is listening
    if netstat -tlnp | grep -q ":3000"; then
        print_success "PocketCloud is listening on port 3000"
    else
        print_error "PocketCloud is not listening on port 3000"
        return 1
    fi
    
    # Test HTTP response
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|302"; then
        print_success "PocketCloud is responding to HTTP requests"
    else
        print_warning "PocketCloud may not be responding correctly"
    fi
    
    print_success "Installation verification completed"
}

print_summary() {
    echo
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║                 🎉 SETUP COMPLETE! 🎉                       ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Get Pi IP address
    PI_IP=$(hostname -I | awk '{print $1}')
    
    echo "📊 Installation Summary:"
    echo "  • Project Directory: $PROJECT_DIR"
    echo "  • Storage Location: $MOUNT_POINT"
    echo "  • Database: $MOUNT_POINT/pocketcloud.db"
    echo "  • Service: $SERVICE_NAME (enabled & running)"
    echo "  • Nginx: Reverse proxy configured"
    echo "  • Logs: /var/log/pocketcloud/"
    echo
    echo "🌐 Access Your PocketCloud:"
    echo "  • Local: http://localhost"
    echo "  • Network: http://$PI_IP"
    echo "  • Direct: http://$PI_IP:3000"
    echo
    echo "🔧 Management Commands:"
    echo "  • Check status: sudo systemctl status $SERVICE_NAME"
    echo "  • View logs: sudo journalctl -u $SERVICE_NAME -f"
    echo "  • Restart: sudo systemctl restart $SERVICE_NAME"
    echo "  • Monitor drive: ./monitor-usb-drive.sh"
    echo
    echo "📁 Storage Usage:"
    df -h "$MOUNT_POINT"
    echo
    echo "🔄 Automated Tasks:"
    echo "  • Daily backup at 2:00 AM"
    echo "  • Daily cleanup at 3:00 AM"
    echo "  • Drive monitoring every 6 hours"
    echo
    echo "🎯 Next Steps:"
    echo "  1. Open http://$PI_IP in your browser"
    echo "  2. Complete the initial setup wizard"
    echo "  3. Create your admin account"
    echo "  4. Start uploading files!"
    echo
    echo "🎉 Your PocketCloud is ready to use!"
}

# Main execution
main() {
    print_header
    
    check_root
    check_pi
    verify_usb_drive
    update_system
    install_nodejs
    install_system_dependencies
    setup_project_directory
    install_project_dependencies
    create_environment_config
    create_storage_config
    initialize_database
    create_systemd_service
    setup_nginx
    setup_logging
    create_maintenance_scripts
    setup_cron_jobs
    start_services
    verify_installation
    print_summary
}

# Handle command line arguments
case "${1:-}" in
    --skip-update)
        SKIP_UPDATE=true
        main
        ;;
    --help|-h)
        echo "PocketCloud Setup Script"
        echo ""
        echo "Usage:"
        echo "  $0              Run complete setup"
        echo "  $0 --skip-update Skip system update"
        echo "  $0 --help       Show this help"
        ;;
    *)
        main
        ;;
esac