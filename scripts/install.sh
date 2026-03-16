#!/bin/bash
set -euo pipefail

# PocketCloud Drive Installer
# One-command installation on existing Raspberry Pi OS

SCRIPT_VERSION="1.0.0"
POCKETCLOUD_REPO="https://github.com/HarshDev-byte/Pocketcloud.git"
INSTALL_DIR="/opt/pocketcloud"
LOG_FILE="/var/log/pocketcloud-install.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Progress tracking
STEP=0
TOTAL_STEPS=8

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

progress() {
    ((STEP++))
    local message="$1"
    local duration="${2:-}"
    
    if [[ -n "$duration" ]]; then
        echo -e "${CYAN}[$STEP/$TOTAL_STEPS]${NC} $message ${GREEN}✓${NC} ${duration}s" | tee -a "$LOG_FILE"
    else
        echo -e "${CYAN}[$STEP/$TOTAL_STEPS]${NC} $message..." | tee -a "$LOG_FILE"
    fi
}

# Check if running on Raspberry Pi
check_hardware() {
    log "Checking hardware compatibility..."
    
    # Check if running on Raspberry Pi
    if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
        error "This installer only works on Raspberry Pi hardware"
    fi
    
    # Check Pi model (Pi 4 or 5 required)
    local pi_model=$(grep "Raspberry Pi" /proc/cpuinfo | head -1 | sed 's/.*Raspberry Pi \([0-9]\).*/\1/')
    if [[ "$pi_model" -lt 4 ]]; then
        error "Raspberry Pi 4 or newer required (detected: Pi $pi_model)"
    fi
    
    success "Hardware compatible: Raspberry Pi $pi_model"
}

# Check system requirements
check_system() {
    log "Checking system requirements..."
    
    # Check OS
    if ! grep -q "Debian\|Raspbian" /etc/os-release; then
        error "Debian-based OS required (Raspberry Pi OS recommended)"
    fi
    
    # Check RAM (minimum 2GB)
    local ram_mb=$(free -m | awk '/^Mem:/{print $2}')
    if [[ "$ram_mb" -lt 1800 ]]; then
        error "Minimum 2GB RAM required (detected: ${ram_mb}MB)"
    fi
    
    # Check disk space (minimum 8GB free)
    local free_space=$(df / | awk 'NR==2{print $4}')
    local free_gb=$((free_space / 1024 / 1024))
    if [[ "$free_gb" -lt 8 ]]; then
        error "Minimum 8GB free disk space required (available: ${free_gb}GB)"
    fi
    
    # Check if already installed
    if [[ -d "$INSTALL_DIR" ]] && [[ -f "$INSTALL_DIR/.installed" ]]; then
        warn "PocketCloud appears to already be installed"
        echo "To reinstall, remove $INSTALL_DIR and run this script again"
        echo "Or run: sudo rm -rf $INSTALL_DIR"
        exit 1
    fi
    
    success "System requirements met (RAM: ${ram_mb}MB, Free: ${free_gb}GB)"
}

# Show installation summary
show_summary() {
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🥧 PocketCloud Drive Installer v$SCRIPT_VERSION"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    echo "This will install PocketCloud Drive on your Raspberry Pi:"
    echo
    echo "• WiFi hotspot (PocketCloud-XXXX)"
    echo "• Web interface at http://192.168.4.1"
    echo "• File storage and streaming server"
    echo "• WebDAV server for native OS mounting"
    echo "• Real-time sync and sharing"
    echo "• Hardware optimization for Pi"
    echo
    echo "Installation will take approximately 5-10 minutes."
    echo "Your Pi will reboot when complete."
    echo
    echo -n "Proceed with installation? [Y/n] "
    read -r response
    
    if [[ "$response" =~ ^[Nn]$ ]]; then
        echo "Installation cancelled"
        exit 0
    fi
    
    echo
    echo "Starting installation..."
    echo "Log file: $LOG_FILE"
    echo
}

# Install dependencies
install_dependencies() {
    local start_time=$(date +%s)
    progress "Installing dependencies"
    
    # Update package lists
    apt-get update -qq
    
    # Install required packages
    apt-get install -y -qq \
        curl \
        git \
        build-essential \
        python3 \
        python3-pip \
        hostapd \
        dnsmasq \
        iptables-persistent \
        sqlite3 \
        ffmpeg \
        imagemagick \
        nginx \
        supervisor \
        ufw \
        fail2ban
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    progress "Installing dependencies" "$duration"
}

# Clone repository
clone_repository() {
    local start_time=$(date +%s)
    progress "Downloading PocketCloud"
    
    # Create pocketcloud user
    if ! id "pocketcloud" &>/dev/null; then
        useradd -r -s /bin/bash -d "$INSTALL_DIR" pocketcloud
    fi
    
    # Clone repository
    git clone "$POCKETCLOUD_REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    # Set ownership
    chown -R pocketcloud:pocketcloud "$INSTALL_DIR"
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    progress "Downloading PocketCloud" "$duration"
}
# Run setup scripts
run_setup_scripts() {
    cd "$INSTALL_DIR"
    
    # Network setup
    local start_time=$(date +%s)
    progress "Configuring WiFi hotspot"
    if [[ -f "pocket-cloud/scripts/setup/setup-network.sh" ]]; then
        bash pocket-cloud/scripts/setup/setup-network.sh
    else
        warn "Network setup script not found, skipping..."
    fi
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    progress "Configuring WiFi hotspot" "$duration"
    
    # Storage setup (already done separately)
    start_time=$(date +%s)
    progress "Verifying storage setup"
    if [[ ! -d "/mnt/pocketcloud" ]]; then
        warn "Storage not set up, running USB storage setup..."
        bash scripts/setup-usb-storage.sh
    fi
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    progress "Verifying storage setup" "$duration"
    
    # Node.js installation
    start_time=$(date +%s)
    progress "Installing Node.js"
    if [[ -f "pocket-cloud/scripts/setup/setup-node.sh" ]]; then
        bash pocket-cloud/scripts/setup/setup-node.sh
    else
        # Install Node.js directly
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    progress "Installing Node.js" "$duration"
    
    # Application setup
    start_time=$(date +%s)
    progress "Installing PocketCloud"
    if [[ -f "pocket-cloud/scripts/setup/setup-app.sh" ]]; then
        bash pocket-cloud/scripts/setup/setup-app.sh
    else
        # Install application directly
        cd "$INSTALL_DIR/pocket-cloud/backend"
        npm install
        cd "$INSTALL_DIR/pocket-cloud/frontend"
        npm install
    fi
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    progress "Installing PocketCloud" "$duration"
    
    # Build frontend
    start_time=$(date +%s)
    progress "Building frontend"
    cd "$INSTALL_DIR/pocket-cloud/frontend"
    npm run build
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    progress "Building frontend" "$duration"
    
    # Services setup
    start_time=$(date +%s)
    progress "Starting services"
    cd "$INSTALL_DIR"
    if [[ -f "pocket-cloud/scripts/setup/install-services-new.sh" ]]; then
        bash pocket-cloud/scripts/setup/install-services-new.sh
    else
        warn "Service setup script not found, manual configuration needed"
    fi
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    progress "Starting services" "$duration"
    
    # Hardware optimization
    start_time=$(date +%s)
    progress "Running optimization"
    if [[ -f "pocket-cloud/scripts/optimization/optimize-pi.sh" ]]; then
        bash pocket-cloud/scripts/optimization/optimize-pi.sh
    else
        warn "Optimization script not found, skipping..."
    fi
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    progress "Running optimization" "$duration"
}

# Generate unique configuration
generate_config() {
    log "Generating unique configuration..."
    
    # Get MAC address for unique WiFi name
    local mac=$(cat /sys/class/net/wlan0/address | tr -d ':' | tail -c 5 | tr '[:lower:]' '[:upper:]')
    local wifi_name="PocketCloud-${mac}"
    
    # Generate random WiFi password
    local wifi_password=$(openssl rand -base64 12 | tr -d "=+/" | cut -c1-12)
    
    # Update hostapd configuration
    sed -i "s/ssid=PocketCloud/ssid=$wifi_name/" /etc/hostapd/hostapd.conf
    sed -i "s/wpa_passphrase=.*/wpa_passphrase=$wifi_password/" /etc/hostapd/hostapd.conf
    
    # Save configuration for display
    cat > "$INSTALL_DIR/.connection-info" << EOF
WIFI_NAME=$wifi_name
WIFI_PASSWORD=$wifi_password
WEB_URL=http://192.168.4.1
ADMIN_URL=http://192.168.4.1/admin
EOF
    
    success "Configuration generated (WiFi: $wifi_name)"
}

# Final health check
health_check() {
    log "Running final health check..."
    
    # Check if services are running
    local services=("pocketcloud-backend" "pocketcloud-frontend" "hostapd" "dnsmasq")
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            success "$service is running"
        else
            warn "$service is not running (will start on reboot)"
        fi
    done
    
    # Check if ports are available
    local ports=(80 3000 53 67)
    for port in "${ports[@]}"; do
        if netstat -tuln | grep -q ":$port "; then
            success "Port $port is available"
        else
            warn "Port $port may be in use"
        fi
    done
    
    # Mark as installed
    touch "$INSTALL_DIR/.installed"
    echo "$(date): PocketCloud installed successfully" >> "$INSTALL_DIR/.installed"
    
    success "Health check complete"
}

# Show completion message
show_completion() {
    # Load connection info
    source "$INSTALL_DIR/.connection-info"
    
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 PocketCloud Drive Installation Complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    echo "╔══════════════════════════════════════╗"
    echo "║  PocketCloud Drive is ready!         ║"
    echo "║                                      ║"
    echo "║  WiFi:     $WIFI_NAME          ║"
    echo "║  Password: $WIFI_PASSWORD            ║"
    echo "║  Open:     $WEB_URL        ║"
    echo "║  Admin:    $ADMIN_URL  ║"
    echo "╚══════════════════════════════════════╝"
    echo
    echo "Next steps:"
    echo "1. Your Pi will reboot in 10 seconds"
    echo "2. Connect any device to the '$WIFI_NAME' WiFi network"
    echo "3. Open $WEB_URL in your browser"
    echo "4. Complete the setup wizard"
    echo
    echo "For support: https://github.com/pocketcloud/pocketcloud/issues"
    echo "Documentation: https://github.com/pocketcloud/pocketcloud/wiki"
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Countdown to reboot
    for i in {10..1}; do
        echo -ne "\rRebooting in $i seconds... (Ctrl+C to cancel)"
        sleep 1
    done
    
    echo
    echo "Rebooting now..."
    reboot
}

# Cleanup on error
cleanup_on_error() {
    if [[ $? -ne 0 ]]; then
        echo
        error "Installation failed. Check $LOG_FILE for details."
        echo "To retry: sudo bash $0"
        echo "To clean up: sudo rm -rf $INSTALL_DIR"
    fi
}

trap cleanup_on_error EXIT

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root. Use: sudo bash $0"
    fi
}

# Main installation function
main() {
    # Initialize log file
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$(date): Starting PocketCloud installation" > "$LOG_FILE"
    
    check_root
    check_hardware
    check_system
    show_summary
    
    install_dependencies
    clone_repository
    run_setup_scripts
    generate_config
    health_check
    show_completion
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "PocketCloud Drive Installer v$SCRIPT_VERSION"
        echo
        echo "Usage: $0 [options]"
        echo
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --version, -v  Show version information"
        echo "  --check        Check system compatibility only"
        echo
        echo "Installation:"
        echo "  curl -fsSL http://pocketcloud.sh/install.sh | sudo bash"
        echo "  or"
        echo "  sudo bash install.sh"
        exit 0
        ;;
    --version|-v)
        echo "PocketCloud Drive Installer v$SCRIPT_VERSION"
        exit 0
        ;;
    --check)
        check_root
        check_hardware
        check_system
        echo "✓ System is compatible with PocketCloud Drive"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac