#!/bin/bash

# PocketCloud Installation Script for Raspberry Pi OS
# Automated installation with USB storage verification

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Check system requirements
check_system() {
    log_info "Checking system requirements..."
    
    # Check OS
    if [[ ! -f /etc/os-release ]]; then
        log_error "Cannot detect operating system"
        exit 1
    fi
    
    . /etc/os-release
    if [[ "$ID" != "raspbian" && "$ID" != "debian" && "$ID" != "ubuntu" ]]; then
        log_warning "Unsupported OS detected: $PRETTY_NAME"
        log_warning "PocketCloud is designed for Raspberry Pi OS, Debian, or Ubuntu"
        echo "Continue anyway? (y/N): "
        read -r continue_install
        if [[ ! "$continue_install" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Check architecture
    local arch=$(uname -m)
    if [[ "$arch" != "aarch64" && "$arch" != "x86_64" ]]; then
        log_warning "Architecture $arch may not be fully supported"
        log_warning "Recommended: aarch64 (Pi 4 64-bit) or x86_64"
    fi
    
    log_success "System check passed"
}

# Check Node.js installation
check_nodejs() {
    log_info "Checking Node.js installation..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        log_info "Please install Node.js 18+ first:"
        log_info "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
        log_info "sudo apt install -y nodejs"
        exit 1
    fi
    
    local node_version=$(node -v | sed 's/v//')
    local major_version=$(echo $node_version | cut -d. -f1)
    
    if [[ $major_version -lt 18 ]]; then
        log_error "Node.js version $node_version is too old"
        log_error "PocketCloud requires Node.js 18 or higher"
        exit 1
    fi
    
    log_success "Node.js $node_version detected"
}

# Check USB storage
check_usb_storage() {
    log_info "Checking USB storage setup..."
    
    # Check if mount point exists
    if [[ ! -d "/mnt/pocketcloud" ]]; then
        log_error "USB storage not set up"
        log_info "Please run the USB setup script first:"
        log_info "sudo bash setup-usb-storage.sh"
        exit 1
    fi
    
    # Check if mounted
    if ! mountpoint -q /mnt/pocketcloud; then
        log_error "USB storage not mounted at /mnt/pocketcloud"
        log_info "Please check your USB drive and fstab configuration"
        exit 1
    fi
    
    # Check filesystem type
    local fstype=$(df -T /mnt/pocketcloud | tail -1 | awk '{print $2}')
    if [[ "$fstype" != "ext4" && "$fstype" != "ext3" ]]; then
        log_warning "Filesystem is $fstype (ext4 recommended)"
    fi
    
    # Check write access
    local test_file="/mnt/pocketcloud/.pocketcloud-install-test"
    if ! echo "test" > "$test_file" 2>/dev/null; then
        log_error "Cannot write to USB storage"
        log_info "Please check permissions on /mnt/pocketcloud"
        exit 1
    fi
    rm -f "$test_file"
    
    # Check free space
    local free_space=$(df /mnt/pocketcloud | tail -1 | awk '{print $4}')
    local free_gb=$((free_space / 1024 / 1024))
    
    if [[ $free_gb -lt 1 ]]; then
        log_error "Insufficient free space on USB drive ($free_gb GB)"
        log_error "At least 1GB free space required"
        exit 1
    fi
    
    log_success "USB storage ready ($free_gb GB free)"
}

# Create PocketCloud user
create_user() {
    log_info "Creating PocketCloud user..."
    
    if id "pocketcloud" &>/dev/null; then
        log_warning "User 'pocketcloud' already exists"
    else
        useradd -r -s /bin/false -d /opt/pocketcloud pocketcloud
        log_success "User 'pocketcloud' created"
    fi
}

# Install PocketCloud
install_pocketcloud() {
    log_info "Installing PocketCloud..."
    
    # Create installation directory
    mkdir -p /opt/pocketcloud
    
    # Copy files (assuming script is run from PocketCloud directory)
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    # Copy application files
    cp -r "$script_dir"/* /opt/pocketcloud/ 2>/dev/null || {
        log_error "Failed to copy files. Make sure you're running this from the PocketCloud directory"
        exit 1
    }
    
    # Set ownership
    chown -R pocketcloud:pocketcloud /opt/pocketcloud
    
    # Set permissions
    chmod +x /opt/pocketcloud/setup/*.sh
    chmod +x /opt/pocketcloud/tools/*.sh
    chmod +x /opt/pocketcloud/scripts/*.sh 2>/dev/null || true
    
    log_success "Files copied to /opt/pocketcloud"
}

# Install dependencies
install_dependencies() {
    log_info "Installing Node.js dependencies..."
    
    cd /opt/pocketcloud
    
    # Install production dependencies as pocketcloud user
    sudo -u pocketcloud npm install --production --no-audit --no-fund
    
    log_success "Dependencies installed"
}

# Configure storage
configure_storage() {
    log_info "Configuring storage..."
    
    # Create data directory on USB drive
    mkdir -p /mnt/pocketcloud/pocketcloud-data
    chown pocketcloud:pocketcloud /mnt/pocketcloud/pocketcloud-data
    chmod 755 /mnt/pocketcloud/pocketcloud-data
    
    # Create symlink from app directory to USB storage
    if [[ -L /opt/pocketcloud/data ]]; then
        rm /opt/pocketcloud/data
    elif [[ -d /opt/pocketcloud/data ]]; then
        mv /opt/pocketcloud/data /opt/pocketcloud/data.backup
        log_warning "Existing data directory backed up to data.backup"
    fi
    
    ln -s /mnt/pocketcloud/pocketcloud-data /opt/pocketcloud/data
    chown -h pocketcloud:pocketcloud /opt/pocketcloud/data
    
    # Create storage directory on USB drive
    mkdir -p /mnt/pocketcloud/pocketcloud-storage
    chown pocketcloud:pocketcloud /mnt/pocketcloud/pocketcloud-storage
    chmod 755 /mnt/pocketcloud/pocketcloud-storage
    
    # Create symlink for storage
    if [[ -L /opt/pocketcloud/storage ]]; then
        rm /opt/pocketcloud/storage
    elif [[ -d /opt/pocketcloud/storage ]]; then
        mv /opt/pocketcloud/storage /opt/pocketcloud/storage.backup
        log_warning "Existing storage directory backed up to storage.backup"
    fi
    
    ln -s /mnt/pocketcloud/pocketcloud-storage /opt/pocketcloud/storage
    chown -h pocketcloud:pocketcloud /opt/pocketcloud/storage
    
    log_success "Storage configured on USB drive"
}

# Install systemd service
install_service() {
    log_info "Installing systemd service..."
    
    # Copy service file
    cp /opt/pocketcloud/config/pocketcloud.service /etc/systemd/system/
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable service
    systemctl enable pocketcloud
    
    log_success "Systemd service installed and enabled"
}

# Configure firewall
configure_firewall() {
    log_info "Configuring firewall..."
    
    if command -v ufw &> /dev/null; then
        # Allow PocketCloud port
        ufw allow 3000/tcp comment "PocketCloud"
        log_success "Firewall configured (port 3000 allowed)"
    else
        log_warning "UFW not installed - firewall not configured"
        log_info "You may need to manually configure your firewall to allow port 3000"
    fi
}

# Start service
start_service() {
    log_info "Starting PocketCloud service..."
    
    systemctl start pocketcloud
    
    # Wait a moment for service to start
    sleep 3
    
    # Check if service is running
    if systemctl is-active --quiet pocketcloud; then
        log_success "PocketCloud service started successfully"
    else
        log_error "Failed to start PocketCloud service"
        log_info "Check logs with: sudo journalctl -u pocketcloud -n 20"
        exit 1
    fi
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    # Check if port is listening
    if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
        log_success "PocketCloud is listening on port 3000"
    else
        log_warning "Port 3000 not detected (service may still be starting)"
    fi
    
    # Check health endpoint
    sleep 2
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        log_success "Health check passed"
    else
        log_warning "Health check failed (service may still be starting)"
    fi
    
    # Show service status
    systemctl status pocketcloud --no-pager -l
}

# Show completion message
show_completion() {
    echo
    echo "=============================================="
    log_success "PocketCloud Installation Complete!"
    echo "=============================================="
    echo
    echo "🌐 Access PocketCloud:"
    echo "   Local:   http://localhost:3000"
    echo "   Network: http://$(hostname -I | awk '{print $1}'):3000"
    echo
    echo "📋 Useful Commands:"
    echo "   Status:  sudo systemctl status pocketcloud"
    echo "   Logs:    sudo journalctl -u pocketcloud -f"
    echo "   Restart: sudo systemctl restart pocketcloud"
    echo "   Stop:    sudo systemctl stop pocketcloud"
    echo
    echo "📁 Important Paths:"
    echo "   Application: /opt/pocketcloud"
    echo "   Data:        /mnt/pocketcloud/pocketcloud-data"
    echo "   Storage:     /mnt/pocketcloud/pocketcloud-storage"
    echo
    echo "🔐 Next Steps:"
    echo "   1. Open http://localhost:3000 in your browser"
    echo "   2. Complete the first-time setup"
    echo "   3. Create your admin account"
    echo "   4. Start uploading files!"
    echo
    echo "📖 For help, see QUICKSTART.txt or RASPBERRY_PI_SETUP.md"
    echo
}

# Main installation function
main() {
    echo "=============================================="
    echo "🚀 PocketCloud Installation Script"
    echo "=============================================="
    echo
    
    check_root
    check_system
    check_nodejs
    check_usb_storage
    create_user
    install_pocketcloud
    install_dependencies
    configure_storage
    install_service
    configure_firewall
    start_service
    verify_installation
    show_completion
}

# Run main function
main "$@"