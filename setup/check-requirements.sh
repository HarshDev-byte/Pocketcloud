#!/bin/bash

# PocketCloud Requirements Check Script
# Verifies system meets all requirements before installation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((CHECKS_PASSED++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((CHECKS_WARNING++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((CHECKS_FAILED++))
}

# Check operating system
check_os() {
    echo "🖥️  Operating System Check"
    echo "=========================="
    
    if [[ ! -f /etc/os-release ]]; then
        log_error "Cannot detect operating system"
        return
    fi
    
    . /etc/os-release
    
    echo "Detected: $PRETTY_NAME"
    echo "Architecture: $(uname -m)"
    
    if [[ "$ID" == "raspbian" || "$ID" == "debian" || "$ID" == "ubuntu" ]]; then
        log_success "Operating system supported"
    else
        log_error "Unsupported operating system: $PRETTY_NAME"
        echo "         Supported: Raspberry Pi OS, Debian, Ubuntu"
    fi
    
    # Check architecture
    local arch=$(uname -m)
    if [[ "$arch" == "aarch64" || "$arch" == "x86_64" ]]; then
        log_success "Architecture supported: $arch"
    else
        log_warning "Architecture may not be fully supported: $arch"
        echo "         Recommended: aarch64 (Pi 4 64-bit) or x86_64"
    fi
    
    echo
}

# Check hardware resources
check_hardware() {
    echo "🔧 Hardware Resources Check"
    echo "==========================="
    
    # Check RAM
    local ram_mb=$(free -m | awk 'NR==2{print $2}')
    echo "RAM: ${ram_mb}MB"
    
    if [[ $ram_mb -ge 2048 ]]; then
        log_success "RAM sufficient: ${ram_mb}MB (recommended: 2GB+)"
    elif [[ $ram_mb -ge 1024 ]]; then
        log_warning "RAM minimal: ${ram_mb}MB (recommended: 2GB+)"
    else
        log_error "RAM insufficient: ${ram_mb}MB (minimum: 1GB)"
    fi
    
    # Check CPU cores
    local cpu_cores=$(nproc)
    echo "CPU cores: $cpu_cores"
    
    if [[ $cpu_cores -ge 2 ]]; then
        log_success "CPU cores sufficient: $cpu_cores"
    else
        log_warning "Single core CPU detected (multi-core recommended)"
    fi
    
    # Check disk space on root
    local root_free=$(df / | tail -1 | awk '{print $4}')
    local root_free_gb=$((root_free / 1024 / 1024))
    echo "Root filesystem free space: ${root_free_gb}GB"
    
    if [[ $root_free_gb -ge 4 ]]; then
        log_success "Root filesystem space sufficient: ${root_free_gb}GB"
    elif [[ $root_free_gb -ge 2 ]]; then
        log_warning "Root filesystem space minimal: ${root_free_gb}GB (recommended: 4GB+)"
    else
        log_error "Root filesystem space insufficient: ${root_free_gb}GB (minimum: 2GB)"
    fi
    
    echo
}

# Check Node.js
check_nodejs() {
    echo "🟢 Node.js Check"
    echo "================"
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js not installed"
        echo "         Install with: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
        echo "                       sudo apt install -y nodejs"
        return
    fi
    
    local node_version=$(node -v)
    local major_version=$(echo $node_version | sed 's/v//' | cut -d. -f1)
    
    echo "Node.js version: $node_version"
    
    if [[ $major_version -ge 18 ]]; then
        log_success "Node.js version supported: $node_version"
    else
        log_error "Node.js version too old: $node_version (required: v18+)"
        echo "         Update with: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
        echo "                      sudo apt install -y nodejs"
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        local npm_version=$(npm -v)
        echo "npm version: $npm_version"
        log_success "npm available: $npm_version"
    else
        log_error "npm not available"
    fi
    
    echo
}

# Check USB storage
check_usb_storage() {
    echo "💾 USB Storage Check"
    echo "==================="
    
    # Check if mount point exists
    if [[ -d "/mnt/pocketcloud" ]]; then
        log_success "Mount point exists: /mnt/pocketcloud"
        
        # Check if mounted
        if mountpoint -q /mnt/pocketcloud; then
            log_success "USB storage is mounted"
            
            # Check filesystem type
            local fstype=$(df -T /mnt/pocketcloud | tail -1 | awk '{print $2}')
            echo "Filesystem type: $fstype"
            
            if [[ "$fstype" == "ext4" ]]; then
                log_success "Filesystem type optimal: ext4"
            elif [[ "$fstype" == "ext3" ]]; then
                log_warning "Filesystem type supported: ext3 (ext4 recommended)"
            else
                log_warning "Filesystem type not optimal: $fstype (ext4 recommended)"
            fi
            
            # Check free space
            local free_space=$(df /mnt/pocketcloud | tail -1 | awk '{print $4}')
            local free_gb=$((free_space / 1024 / 1024))
            echo "Free space: ${free_gb}GB"
            
            if [[ $free_gb -ge 10 ]]; then
                log_success "Free space sufficient: ${free_gb}GB"
            elif [[ $free_gb -ge 1 ]]; then
                log_warning "Free space minimal: ${free_gb}GB (recommended: 10GB+)"
            else
                log_error "Free space insufficient: ${free_gb}GB (minimum: 1GB)"
            fi
            
            # Check write access
            local test_file="/mnt/pocketcloud/.pocketcloud-test-$"
            if echo "test" > "$test_file" 2>/dev/null; then
                rm -f "$test_file"
                log_success "Write access confirmed"
            else
                log_error "No write access to USB storage"
            fi
            
        else
            log_error "USB storage not mounted at /mnt/pocketcloud"
            echo "         Run: sudo bash setup/setup-usb-storage.sh"
        fi
    else
        log_error "Mount point not found: /mnt/pocketcloud"
        echo "         Run: sudo bash setup/setup-usb-storage.sh"
    fi
    
    # List available USB devices
    echo
    echo "Available USB storage devices:"
    lsblk -d -o NAME,SIZE,MODEL,TRAN | grep -E "(usb|USB)" || echo "No USB devices detected"
    
    echo
}

# Check network
check_network() {
    echo "🌐 Network Check"
    echo "==============="
    
    # Check if port 3000 is available
    if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
        log_warning "Port 3000 is already in use"
        echo "         Stop the service using port 3000 or change PocketCloud port"
    else
        log_success "Port 3000 is available"
    fi
    
    # Check firewall
    if command -v ufw &> /dev/null; then
        local ufw_status=$(ufw status | head -1)
        echo "UFW status: $ufw_status"
        
        if [[ "$ufw_status" == *"active"* ]]; then
            log_success "UFW firewall is active"
            
            # Check if port 3000 is allowed
            if ufw status | grep -q "3000"; then
                log_success "Port 3000 is allowed in firewall"
            else
                log_warning "Port 3000 not allowed in firewall"
                echo "         Will be configured during installation"
            fi
        else
            log_warning "UFW firewall is inactive"
        fi
    else
        log_warning "UFW not installed (firewall management recommended)"
    fi
    
    # Check internet connectivity (for installation)
    if ping -c 1 8.8.8.8 &> /dev/null; then
        log_success "Internet connectivity available"
    else
        log_warning "No internet connectivity (required for Node.js package installation)"
    fi
    
    echo
}

# Check system services
check_services() {
    echo "⚙️  System Services Check"
    echo "========================"
    
    # Check systemd
    if command -v systemctl &> /dev/null; then
        log_success "systemd available"
    else
        log_error "systemd not available (required for service management)"
    fi
    
    # Check if PocketCloud service already exists
    if systemctl list-unit-files | grep -q pocketcloud; then
        log_warning "PocketCloud service already exists"
        
        if systemctl is-active --quiet pocketcloud; then
            log_warning "PocketCloud service is currently running"
            echo "         Stop with: sudo systemctl stop pocketcloud"
        fi
    else
        log_success "No conflicting PocketCloud service found"
    fi
    
    echo
}

# Show summary
show_summary() {
    echo "📊 Requirements Check Summary"
    echo "============================"
    echo
    echo "✅ Checks passed: $CHECKS_PASSED"
    echo "⚠️  Warnings: $CHECKS_WARNING"
    echo "❌ Checks failed: $CHECKS_FAILED"
    echo
    
    if [[ $CHECKS_FAILED -eq 0 ]]; then
        if [[ $CHECKS_WARNING -eq 0 ]]; then
            log_success "All requirements met! Ready to install PocketCloud."
            echo
            echo "🚀 Next steps:"
            echo "   1. Set up USB storage: sudo bash setup/setup-usb-storage.sh"
            echo "   2. Install PocketCloud: sudo bash setup/install.sh"
        else
            log_warning "Requirements mostly met with some warnings."
            echo
            echo "🚀 You can proceed with installation, but consider addressing warnings:"
            echo "   1. Set up USB storage: sudo bash setup/setup-usb-storage.sh"
            echo "   2. Install PocketCloud: sudo bash setup/install.sh"
        fi
    else
        log_error "Some requirements are not met. Please fix the issues above before installing."
        echo
        echo "🔧 Common fixes:"
        echo "   • Install Node.js 18+: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs"
        echo "   • Set up USB storage: sudo bash setup/setup-usb-storage.sh"
        echo "   • Free up disk space: sudo apt autoremove && sudo apt autoclean"
    fi
    
    echo
}

# Main function
main() {
    echo "=============================================="
    echo "🔍 PocketCloud Requirements Check"
    echo "=============================================="
    echo
    
    check_os
    check_hardware
    check_nodejs
    check_usb_storage
    check_network
    check_services
    show_summary
}

# Run main function
main "$@"