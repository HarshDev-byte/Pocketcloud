#!/bin/bash
# Pocket Cloud Drive - Service Installation Script
# Installs and enables all systemd services

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}[INSTALL]${NC} $1"; }
print_success() { echo -e "${GREEN}[INSTALL]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[INSTALL]${NC} $1"; }
print_error() { echo -e "${RED}[INSTALL]${NC} $1"; }

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SYSTEMD_DIR="$PROJECT_ROOT/systemd"
SYSTEM_SYSTEMD_DIR="/etc/systemd/system"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    print_error "This script must be run as root (use sudo)"
    exit 1
fi

copy_service_files() {
    print_step "Copying systemd service files..."
    
    local service_files=(
        "pocketcloud-backend.service"
        "pocketcloud-frontend.service"
        "pocketcloud-cleanup.service"
        "pocketcloud-cleanup.timer"
        "pocketcloud-watchdog.service"
        "mnt-pocketcloud.mount"
    )
    
    for file in "${service_files[@]}"; do
        local source="$SYSTEMD_DIR/$file"
        local dest="$SYSTEM_SYSTEMD_DIR/$file"
        
        if [[ -f "$source" ]]; then
            cp "$source" "$dest"
            print_step "Copied: $file"
        else
            print_error "Service file not found: $source"
            exit 1
        fi
    done
    
    print_success "All service files copied"
}

update_mount_unit() {
    print_step "Updating mount unit with actual USB device..."
    
    # Try to find the PocketCloud labeled device
    local device_path=""
    
    # First try by label
    if [[ -e "/dev/disk/by-label/PocketCloud" ]]; then
        device_path="/dev/disk/by-label/PocketCloud"
        print_step "Found device by label: $device_path"
    else
        # Try to find by UUID from fstab
        local uuid=$(grep "/mnt/pocketcloud" /etc/fstab 2>/dev/null | grep -o "UUID=[^[:space:]]*" | cut -d= -f2 || echo "")
        
        if [[ -n "$uuid" ]] && [[ -e "/dev/disk/by-uuid/$uuid" ]]; then
            device_path="/dev/disk/by-uuid/$uuid"
            print_step "Found device by UUID: $device_path"
        else
            print_warning "Could not find PocketCloud device, using fstab entry"
            # Disable the mount unit and rely on fstab
            sed -i 's/^What=.*/What=\/dev\/disk\/by-label\/PocketCloud/' "$SYSTEM_SYSTEMD_DIR/mnt-pocketcloud.mount"
            return
        fi
    fi
    
    # Update the mount unit with the correct device path
    sed -i "s|^What=.*|What=$device_path|" "$SYSTEM_SYSTEMD_DIR/mnt-pocketcloud.mount"
    print_success "Mount unit updated with device: $device_path"
}

reload_systemd() {
    print_step "Reloading systemd daemon..."
    
    systemctl daemon-reload
    
    print_success "Systemd daemon reloaded"
}

enable_services() {
    print_step "Enabling systemd services..."
    
    local services=(
        "mnt-pocketcloud.mount"
        "pocketcloud-backend.service"
        "pocketcloud-frontend.service"
        "pocketcloud-watchdog.service"
        "pocketcloud-cleanup.timer"
    )
    
    for service in "${services[@]}"; do
        if systemctl enable "$service"; then
            print_success "Enabled: $service"
        else
            print_error "Failed to enable: $service"
            exit 1
        fi
    done
    
    print_success "All services enabled"
}

start_services() {
    print_step "Starting systemd services..."
    
    # Start mount first
    if systemctl start mnt-pocketcloud.mount; then
        print_success "Started: mnt-pocketcloud.mount"
    else
        print_warning "Failed to start mount (may work after reboot)"
    fi
    
    # Wait a moment for mount to settle
    sleep 2
    
    # Start backend
    if systemctl start pocketcloud-backend.service; then
        print_success "Started: pocketcloud-backend.service"
    else
        print_error "Failed to start backend service"
        systemctl status pocketcloud-backend.service --no-pager
        exit 1
    fi
    
    # Start frontend
    if systemctl start pocketcloud-frontend.service; then
        print_success "Started: pocketcloud-frontend.service"
    else
        print_warning "Failed to start frontend service"
        systemctl status pocketcloud-frontend.service --no-pager
    fi
    
    # Start watchdog
    if systemctl start pocketcloud-watchdog.service; then
        print_success "Started: pocketcloud-watchdog.service"
    else
        print_warning "Failed to start watchdog service"
    fi
    
    # Start cleanup timer
    if systemctl start pocketcloud-cleanup.timer; then
        print_success "Started: pocketcloud-cleanup.timer"
    else
        print_warning "Failed to start cleanup timer"
    fi
    
    print_success "Service startup completed"
}

verify_services() {
    print_step "Verifying service status..."
    
    local services=(
        "mnt-pocketcloud.mount"
        "pocketcloud-backend.service"
        "pocketcloud-frontend.service"
        "pocketcloud-watchdog.service"
        "pocketcloud-cleanup.timer"
    )
    
    echo
    for service in "${services[@]}"; do
        local status=$(systemctl is-active "$service" 2>/dev/null || echo "inactive")
        local enabled=$(systemctl is-enabled "$service" 2>/dev/null || echo "disabled")
        
        if [[ "$status" == "active" ]]; then
            print_success "$service: $status ($enabled)"
        else
            print_warning "$service: $status ($enabled)"
        fi
    done
    
    echo
    print_step "Service verification completed"
}

test_api_health() {
    print_step "Testing API health..."
    
    # Wait for backend to be ready
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
            print_success "Backend API is responding"
            return 0
        fi
        
        ((attempt++))
        sleep 1
    done
    
    print_warning "Backend API is not responding after $max_attempts seconds"
    return 1
}

create_service_aliases() {
    print_step "Creating service management aliases..."
    
    # Create convenience scripts
    cat > /usr/local/bin/pocketcloud << 'EOF'
#!/bin/bash
# Pocket Cloud Drive service management

case "$1" in
    start)
        sudo systemctl start pocketcloud-backend pocketcloud-frontend pocketcloud-watchdog
        ;;
    stop)
        sudo systemctl stop pocketcloud-watchdog pocketcloud-backend pocketcloud-frontend
        ;;
    restart)
        sudo systemctl restart pocketcloud-backend pocketcloud-frontend pocketcloud-watchdog
        ;;
    status)
        sudo systemctl status pocketcloud-backend pocketcloud-frontend pocketcloud-watchdog --no-pager
        ;;
    logs)
        sudo journalctl -u pocketcloud-backend -f
        ;;
    health)
        curl -s http://localhost:3000/api/health | jq . 2>/dev/null || curl -s http://localhost:3000/api/health
        ;;
    *)
        echo "Usage: pocketcloud {start|stop|restart|status|logs|health}"
        exit 1
        ;;
esac
EOF

    chmod +x /usr/local/bin/pocketcloud
    print_success "Created 'pocketcloud' command"
}

display_service_info() {
    print_step "Service installation summary:"
    
    echo
    echo "Installed Services:"
    echo "  • pocketcloud-backend.service  - Main API server"
    echo "  • pocketcloud-frontend.service - Static file server"
    echo "  • pocketcloud-watchdog.service - Health monitoring"
    echo "  • pocketcloud-cleanup.timer    - Daily maintenance"
    echo "  • mnt-pocketcloud.mount        - USB storage mount"
    echo
    echo "Management Commands:"
    echo "  • pocketcloud start            - Start all services"
    echo "  • pocketcloud stop             - Stop all services"
    echo "  • pocketcloud restart          - Restart all services"
    echo "  • pocketcloud status           - Show service status"
    echo "  • pocketcloud logs             - Follow backend logs"
    echo "  • pocketcloud health           - Check API health"
    echo
    echo "Individual Service Commands:"
    echo "  • systemctl status pocketcloud-backend"
    echo "  • journalctl -u pocketcloud-backend -f"
    echo "  • systemctl restart pocketcloud-backend"
    echo
}

main() {
    print_step "Installing Pocket Cloud Drive systemd services..."
    
    copy_service_files
    update_mount_unit
    reload_systemd
    enable_services
    start_services
    verify_services
    test_api_health
    create_service_aliases
    display_service_info
    
    print_success "Service installation completed successfully!"
    
    echo
    print_step "Next steps:"
    echo "1. Reboot to ensure all services start properly: sudo reboot"
    echo "2. Check service status after reboot: pocketcloud status"
    echo "3. Access the web interface: http://192.168.4.1"
}

main "$@"