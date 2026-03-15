#!/bin/bash

# PocketCloud Drive Universal Linux Installer
# Works on: Ubuntu 20.04+, Kali Linux 2023+, Debian 11+, Raspberry Pi OS
# Installs both CLI and GTK components

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
POCKETCLOUD_IP="${POCKETCLOUD_IP:-192.168.4.1}"
POCKETCLOUD_PORT="${POCKETCLOUD_PORT:-3000}"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="$HOME/.config/pocketcloud"

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        ARCH_SUFFIX="x64"
        ;;
    aarch64|arm64)
        ARCH_SUFFIX="arm64"
        ;;
    armv7l)
        ARCH_SUFFIX="arm64"  # Use arm64 binary for armv7l
        ;;
    *)
        echo -e "${RED}Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

# Functions
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

check_requirements() {
    log_info "Checking system requirements..."
    
    # Check if running on supported distribution
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case $ID in
            ubuntu|debian|kali|raspbian)
                log_success "Supported distribution: $PRETTY_NAME"
                ;;
            *)
                log_warning "Untested distribution: $PRETTY_NAME"
                log_warning "Installation may work but is not officially supported"
                ;;
        esac
    else
        log_warning "Cannot detect distribution"
    fi
    
    # Check for required commands
    for cmd in curl wget; do
        if ! command -v $cmd >/dev/null 2>&1; then
            log_error "$cmd is required but not installed"
            exit 1
        fi
    done
}

install_dependencies() {
    log_info "Installing dependencies..."
    
    # Detect package manager
    if command -v apt >/dev/null 2>&1; then
        PKG_MANAGER="apt"
        UPDATE_CMD="apt update"
        INSTALL_CMD="apt install -y"
    elif command -v yum >/dev/null 2>&1; then
        PKG_MANAGER="yum"
        UPDATE_CMD="yum update"
        INSTALL_CMD="yum install -y"
    elif command -v pacman >/dev/null 2>&1; then
        PKG_MANAGER="pacman"
        UPDATE_CMD="pacman -Sy"
        INSTALL_CMD="pacman -S --noconfirm"
    else
        log_error "No supported package manager found"
        exit 1
    fi
    
    # Update package lists
    log_info "Updating package lists..."
    sudo $UPDATE_CMD
    
    # Install base dependencies
    case $PKG_MANAGER in
        apt)
            sudo $INSTALL_CMD \
                davfs2 \
                python3-gi \
                gir1.2-appindicator3-0.1 \
                gir1.2-notify-0.7 \
                gir1.2-gtk-4.0 \
                gir1.2-adwaita-1 \
                avahi-utils \
                curl \
                wget
            ;;
        yum)
            sudo $INSTALL_CMD \
                davfs2 \
                python3-gobject \
                libappindicator-gtk3 \
                libnotify \
                gtk4 \
                avahi-tools \
                curl \
                wget
            ;;
        pacman)
            sudo $INSTALL_CMD \
                davfs2 \
                python-gobject \
                libappindicator-gtk3 \
                libnotify \
                gtk4 \
                avahi \
                curl \
                wget
            ;;
    esac
    
    log_success "Dependencies installed"
}

download_cli() {
    log_info "Downloading PocketCloud CLI..."
    
    # Try to download from PocketCloud device first
    CLI_URL="http://${POCKETCLOUD_IP}:${POCKETCLOUD_PORT}/downloads/pcd-linux-${ARCH_SUFFIX}"
    
    if curl -f -s --connect-timeout 5 "$CLI_URL" -o /tmp/pcd 2>/dev/null; then
        log_success "Downloaded CLI from PocketCloud device"
    else
        log_warning "Could not download from PocketCloud device, using fallback"
        # Fallback URL (would be hosted elsewhere in production)
        CLI_URL="https://github.com/pocketcloud/releases/latest/download/pcd-linux-${ARCH_SUFFIX}"
        
        if ! curl -f -L "$CLI_URL" -o /tmp/pcd; then
            log_error "Failed to download CLI binary"
            exit 1
        fi
    fi
    
    # Make executable and install
    chmod +x /tmp/pcd
    sudo mv /tmp/pcd "$INSTALL_DIR/pcd"
    
    log_success "CLI installed to $INSTALL_DIR/pcd"
}

download_gtk_app() {
    log_info "Downloading GTK application..."
    
    # Try to download from PocketCloud device first
    GTK_URL="http://${POCKETCLOUD_IP}:${POCKETCLOUD_PORT}/downloads/pocketcloud-tray.py"
    
    if curl -f -s --connect-timeout 5 "$GTK_URL" -o /tmp/pocketcloud-tray.py 2>/dev/null; then
        log_success "Downloaded GTK app from PocketCloud device"
    else
        log_warning "Could not download from PocketCloud device, using local copy"
        # Use the local copy we created
        cp "$(dirname "$0")/../pocketcloud-gtk/pocketcloud-tray.py" /tmp/pocketcloud-tray.py
    fi
    
    # Make executable and install
    chmod +x /tmp/pocketcloud-tray.py
    sudo mv /tmp/pocketcloud-tray.py "$INSTALL_DIR/pocketcloud-tray"
    
    log_success "GTK app installed to $INSTALL_DIR/pocketcloud-tray"
}

setup_davfs2() {
    log_info "Setting up davfs2 configuration..."
    
    # Create davfs2 config directory
    mkdir -p "$HOME/.davfs2"
    
    # Add PocketCloud to secrets file
    SECRETS_FILE="$HOME/.davfs2/secrets"
    WEBDAV_URL="http://${POCKETCLOUD_IP}:${POCKETCLOUD_PORT}/webdav"
    
    # Check if entry already exists
    if ! grep -q "$WEBDAV_URL" "$SECRETS_FILE" 2>/dev/null; then
        echo "$WEBDAV_URL admin" >> "$SECRETS_FILE"
        chmod 600 "$SECRETS_FILE"
        log_success "Added WebDAV credentials to davfs2"
    else
        log_info "WebDAV credentials already configured"
    fi
    
    # Create mount point
    MOUNT_POINT="$HOME/pocketcloud"
    mkdir -p "$MOUNT_POINT"
    
    # Ask about fstab entry
    echo
    read -p "Add PocketCloud to /etc/fstab for auto-mount? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        FSTAB_ENTRY="$WEBDAV_URL $MOUNT_POINT davfs user,rw,noauto 0 0"
        
        if ! sudo grep -q "$WEBDAV_URL" /etc/fstab 2>/dev/null; then
            echo "$FSTAB_ENTRY" | sudo tee -a /etc/fstab >/dev/null
            log_success "Added PocketCloud to /etc/fstab"
        else
            log_info "PocketCloud already in /etc/fstab"
        fi
    fi
}

setup_autostart() {
    log_info "Setting up autostart..."
    
    # Create autostart directory
    AUTOSTART_DIR="$HOME/.config/autostart"
    mkdir -p "$AUTOSTART_DIR"
    
    # Copy desktop file
    DESKTOP_FILE="$AUTOSTART_DIR/pocketcloud.desktop"
    
    if [ -f "$(dirname "$0")/../pocketcloud-gtk/pocketcloud.desktop" ]; then
        cp "$(dirname "$0")/../pocketcloud-gtk/pocketcloud.desktop" "$DESKTOP_FILE"
    else
        # Create desktop file
        cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Type=Application
Name=PocketCloud Drive
Comment=PocketCloud Drive system tray application
Exec=$INSTALL_DIR/pocketcloud-tray
Icon=pocketcloud
StartupNotify=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=10
Categories=Network;FileTransfer;
Keywords=cloud;storage;sync;webdav;
EOF
    fi
    
    log_success "Autostart configured"
}

create_config() {
    log_info "Creating initial configuration..."
    
    # Create config directory
    mkdir -p "$CONFIG_DIR"
    
    # Create config file
    CONFIG_FILE="$CONFIG_DIR/config.json"
    
    if [ ! -f "$CONFIG_FILE" ]; then
        cat > "$CONFIG_FILE" << EOF
{
  "host": "pocketcloud.local",
  "ip": "$POCKETCLOUD_IP",
  "port": $POCKETCLOUD_PORT,
  "username": "admin",
  "token": null,
  "chunkSize": 10,
  "debug": false,
  "stealthMode": false,
  "encryptionEnabled": false
}
EOF
        log_success "Created configuration file"
    else
        log_info "Configuration file already exists"
    fi
}

test_installation() {
    log_info "Testing installation..."
    
    # Test CLI
    if "$INSTALL_DIR/pcd" --version >/dev/null 2>&1; then
        log_success "CLI is working"
    else
        log_error "CLI test failed"
        return 1
    fi
    
    # Test GTK app (just check if it can be executed)
    if python3 -c "import gi; gi.require_version('Gtk', '4.0')" 2>/dev/null; then
        log_success "GTK dependencies are working"
    else
        log_warning "GTK dependencies may not be fully installed"
    fi
    
    return 0
}

show_completion_message() {
    echo
    log_success "PocketCloud Drive installation completed!"
    echo
    echo -e "${BLUE}Available commands:${NC}"
    echo "  pcd connect                 - Connect to PocketCloud"
    echo "  pcd ls                      - List files"
    echo "  pcd put <file>              - Upload file"
    echo "  pcd get <file>              - Download file"
    echo "  pcd sync <folder>           - Sync folder"
    echo "  pcd mount                   - Mount as filesystem"
    echo "  pcd status                  - Show system status"
    echo
    echo -e "${BLUE}GTK System Tray:${NC}"
    echo "  pocketcloud-tray            - Start system tray app"
    echo "  (Will auto-start on next login)"
    echo
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Run: pcd connect"
    echo "  2. Or start tray app: pocketcloud-tray &"
    echo "  3. Or reboot to auto-start tray app"
    echo
    echo -e "${BLUE}WebDAV Mount:${NC}"
    echo "  Mount point: $HOME/pocketcloud"
    echo "  Manual mount: mount $HOME/pocketcloud"
    echo
}

# Main installation process
main() {
    echo -e "${BLUE}PocketCloud Drive Linux Installer${NC}"
    echo "=================================="
    echo
    
    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        log_error "Do not run this script as root"
        exit 1
    fi
    
    check_requirements
    install_dependencies
    download_cli
    download_gtk_app
    setup_davfs2
    setup_autostart
    create_config
    
    if test_installation; then
        show_completion_message
    else
        log_error "Installation test failed"
        exit 1
    fi
}

# Run main function
main "$@"