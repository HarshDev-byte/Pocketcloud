#!/bin/bash

# PocketCloud Interactive Setup Script - February 2026
# Ultra-detailed, beginner-friendly setup with step-by-step guidance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
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

log_step() {
    echo -e "${CYAN}🔧 $1${NC}"
}

log_important() {
    echo -e "${MAGENTA}⭐ $1${NC}"
}

# Wait for user input
wait_for_user() {
    echo
    echo -e "${YELLOW}Press ENTER to continue...${NC}"
    read -r
}

# Ask yes/no question
ask_yes_no() {
    local question="$1"
    local default="${2:-n}"
    
    while true; do
        if [[ "$default" == "y" ]]; then
            echo -e "${CYAN}$question (Y/n): ${NC}"
        else
            echo -e "${CYAN}$question (y/N): ${NC}"
        fi
        
        read -r answer
        
        # Use default if empty
        if [[ -z "$answer" ]]; then
            answer="$default"
        fi
        
        case "$answer" in
            [Yy]|[Yy][Ee][Ss])
                return 0
                ;;
            [Nn]|[Nn][Oo])
                return 1
                ;;
            *)
                echo "Please answer yes (y) or no (n)"
                ;;
        esac
    done
}

# Show welcome screen
show_welcome() {
    clear
    echo "=============================================="
    echo "🚀 PocketCloud Interactive Setup - Feb 2026"
    echo "=============================================="
    echo
    echo "Welcome! This script will help you set up your own"
    echo "personal cloud storage on your Raspberry Pi."
    echo
    echo "What you'll get:"
    echo "  ✅ Automatic file encryption (AES-256)"
    echo "  ✅ Access from any device on your network"
    echo "  ✅ Completely offline (no internet required)"
    echo "  ✅ All files stored on your USB drive"
    echo "  ✅ No monthly fees or subscriptions"
    echo
    echo "Time required: 30-60 minutes"
    echo "Difficulty: Beginner-friendly"
    echo
    log_important "This script will guide you through every step!"
    echo
    
    if ! ask_yes_no "Ready to start setting up PocketCloud?"; then
        echo "Setup cancelled. Run this script again when you're ready!"
        exit 0
    fi
}

# Check if we're on the right system
check_system_basics() {
    clear
    log_step "Step 1: Checking Your System"
    echo "=============================================="
    echo
    
    log_info "Checking if you're running this on a Raspberry Pi..."
    
    # Check if we're on Linux
    if [[ "$(uname)" != "Linux" ]]; then
        log_error "This setup only works on Linux systems (like Raspberry Pi OS)"
        echo
        echo "Are you running this on:"
        echo "  ❌ Windows"
        echo "  ❌ macOS"
        echo "  ❌ Other operating system"
        echo
        echo "You need to run this on your Raspberry Pi with Raspberry Pi OS installed."
        exit 1
    fi
    
    # Check architecture
    local arch=$(uname -m)
    echo "System architecture: $arch"
    
    if [[ "$arch" == "aarch64" ]]; then
        log_success "Perfect! You're running 64-bit Raspberry Pi OS"
    elif [[ "$arch" == "armv7l" ]]; then
        log_warning "You're running 32-bit Raspberry Pi OS"
        echo
        echo "PocketCloud works better on 64-bit systems."
        echo "Consider upgrading to Raspberry Pi OS 64-bit for better performance."
        echo
        if ! ask_yes_no "Continue with 32-bit system anyway?"; then
            echo "Please install Raspberry Pi OS 64-bit and try again."
            exit 1
        fi
    else
        log_warning "Unknown architecture: $arch"
        echo
        if ! ask_yes_no "This might not be a Raspberry Pi. Continue anyway?"; then
            exit 1
        fi
    fi
    
    # Check available memory
    local ram_mb=$(free -m | awk 'NR==2{print $2}')
    echo "Available RAM: ${ram_mb}MB"
    
    if [[ $ram_mb -ge 2048 ]]; then
        log_success "RAM is sufficient for PocketCloud"
    elif [[ $ram_mb -ge 1024 ]]; then
        log_warning "RAM is minimal but should work"
        echo "Consider upgrading to a Pi with more RAM for better performance."
    else
        log_error "Not enough RAM (need at least 1GB)"
        echo "PocketCloud requires at least 1GB of RAM to run properly."
        exit 1
    fi
    
    log_success "System check passed!"
    wait_for_user
}

# Check internet connection
check_internet() {
    clear
    log_step "Step 2: Checking Internet Connection"
    echo "=============================================="
    echo
    
    log_info "Checking if you have internet access..."
    echo "We need internet to download Node.js and install PocketCloud."
    echo "After setup, PocketCloud works completely offline."
    echo
    
    if ping -c 1 8.8.8.8 &> /dev/null; then
        log_success "Internet connection is working!"
    else
        log_error "No internet connection detected"
        echo
        echo "Please check:"
        echo "  🔌 Ethernet cable is connected"
        echo "  📶 Wi-Fi is connected and working"
        echo "  🌐 Your router/modem is working"
        echo
        echo "Try opening a website in your browser to test."
        echo
        if ask_yes_no "Have you fixed the internet connection?"; then
            if ping -c 1 8.8.8.8 &> /dev/null; then
                log_success "Great! Internet is working now."
            else
                log_error "Still no internet. Please fix this first."
                exit 1
            fi
        else
            echo "Please fix your internet connection and run this script again."
            exit 1
        fi
    fi
    
    wait_for_user
}

# Check for USB drive
check_usb_drive() {
    clear
    log_step "Step 3: Finding Your USB Drive"
    echo "=============================================="
    echo
    
    log_info "Looking for USB drives connected to your Pi..."
    echo
    
    # List USB drives
    local usb_drives=$(lsblk -d -o NAME,SIZE,MODEL,TRAN | grep -E "(usb|USB)" || true)
    
    if [[ -z "$usb_drives" ]]; then
        log_error "No USB drives found!"
        echo
        echo "Please:"
        echo "  1. Connect your USB drive to the Pi"
        echo "  2. Wait 10 seconds for it to be recognized"
        echo "  3. Run this script again"
        echo
        echo "USB drive requirements:"
        echo "  📦 At least 32GB capacity (128GB+ recommended)"
        echo "  🔌 USB 2.0 or USB 3.0"
        echo "  💾 Any brand (SanDisk, Kingston, etc.)"
        echo
        exit 1
    fi
    
    echo "Found USB drives:"
    echo "$usb_drives"
    echo
    
    log_warning "⚠️  IMPORTANT: The setup will erase everything on your USB drive!"
    echo
    echo "If you have important files on the USB drive:"
    echo "  1. Copy them to your computer first"
    echo "  2. Or use a different USB drive"
    echo "  3. Come back when you're ready"
    echo
    
    if ! ask_yes_no "Is it OK to erase everything on your USB drive?"; then
        echo
        echo "Please:"
        echo "  1. Backup any important files from your USB drive"
        echo "  2. Or connect a different USB drive"
        echo "  3. Run this script again when ready"
        exit 0
    fi
    
    log_success "USB drive check completed!"
    wait_for_user
}

# Install Node.js with detailed explanation
install_nodejs() {
    clear
    log_step "Step 4: Installing Node.js"
    echo "=============================================="
    echo
    
    log_info "Checking if Node.js is already installed..."
    
    if command -v node &> /dev/null; then
        local node_version=$(node -v)
        local major_version=$(echo $node_version | sed 's/v//' | cut -d. -f1)
        
        echo "Found Node.js version: $node_version"
        
        if [[ $major_version -ge 18 ]]; then
            log_success "Node.js is already installed and up to date!"
            wait_for_user
            return 0
        else
            log_warning "Node.js version is too old (need v18+)"
            echo "We'll update it to the latest version."
        fi
    else
        log_info "Node.js is not installed. We'll install it now."
    fi
    
    echo
    echo "What is Node.js?"
    echo "  🟢 Node.js is the runtime that PocketCloud needs to work"
    echo "  🟢 It's free, open-source software"
    echo "  🟢 Used by millions of applications worldwide"
    echo "  🟢 We'll install version 20 LTS (Long Term Support)"
    echo
    
    if ! ask_yes_no "Install/update Node.js now?" "y"; then
        echo "Node.js is required for PocketCloud. Exiting."
        exit 1
    fi
    
    echo
    log_info "Downloading Node.js installer..."
    echo "This will take 2-3 minutes depending on your internet speed."
    
    # Download and run NodeSource installer
    if curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -; then
        log_success "Node.js installer downloaded successfully!"
    else
        log_error "Failed to download Node.js installer"
        echo "Please check your internet connection and try again."
        exit 1
    fi
    
    echo
    log_info "Installing Node.js..."
    echo "This will take 3-5 minutes."
    
    if sudo apt install -y nodejs; then
        log_success "Node.js installed successfully!"
    else
        log_error "Failed to install Node.js"
        echo "Please check for error messages above and try again."
        exit 1
    fi
    
    # Verify installation
    echo
    log_info "Verifying Node.js installation..."
    
    local node_version=$(node -v)
    local npm_version=$(npm -v)
    
    echo "Node.js version: $node_version"
    echo "npm version: $npm_version"
    
    log_success "Node.js is ready!"
    wait_for_user
}

# Update system packages
update_system() {
    clear
    log_step "Step 5: Updating Your System"
    echo "=============================================="
    echo
    
    log_info "We need to update your Raspberry Pi's software packages."
    echo
    echo "Why update?"
    echo "  🔒 Security patches and bug fixes"
    echo "  ⚡ Better performance and compatibility"
    echo "  🛠️ Latest features and improvements"
    echo
    echo "This will take 5-15 minutes depending on how many updates are available."
    echo
    
    if ! ask_yes_no "Update system packages now?" "y"; then
        log_warning "Skipping system update (not recommended)"
        echo "You can update later with: sudo apt update && sudo apt upgrade -y"
    else
        echo
        log_info "Updating package list..."
        if sudo apt update; then
            log_success "Package list updated!"
        else
            log_error "Failed to update package list"
            echo "Continuing anyway..."
        fi
        
        echo
        log_info "Installing updates..."
        echo "This is the slow part - please be patient!"
        
        if sudo apt upgrade -y; then
            log_success "System updated successfully!"
        else
            log_error "Some updates failed"
            echo "Continuing anyway - this usually isn't a problem."
        fi
        
        echo
        log_info "Installing essential packages..."
        if sudo apt install -y curl git ufw htop; then
            log_success "Essential packages installed!"
        else
            log_warning "Some packages failed to install"
            echo "Continuing anyway..."
        fi
    fi
    
    wait_for_user
}

# Download PocketCloud
download_pocketcloud() {
    clear
    log_step "Step 6: Downloading PocketCloud"
    echo "=============================================="
    echo
    
    log_info "Downloading PocketCloud from the internet..."
    echo
    echo "What we're downloading:"
    echo "  📦 PocketCloud application code"
    echo "  🔧 Setup and management scripts"
    echo "  📚 Documentation and guides"
    echo "  🛡️ Security and encryption modules"
    echo
    
    # Check if already downloaded
    if [[ -d "pocketcloud" ]]; then
        log_warning "PocketCloud directory already exists"
        echo
        if ask_yes_no "Remove existing directory and download fresh copy?" "y"; then
            rm -rf pocketcloud
            log_info "Removed existing directory"
        else
            log_info "Using existing PocketCloud directory"
            cd pocketcloud
            wait_for_user
            return 0
        fi
    fi
    
    echo
    log_info "Downloading from GitHub..."
    echo "This will take 1-2 minutes."
    
    # Note: Replace with actual repository URL
    if git clone https://github.com/your-repo/pocketcloud.git; then
        log_success "PocketCloud downloaded successfully!"
    else
        log_error "Failed to download PocketCloud"
        echo
        echo "This could be because:"
        echo "  🌐 Internet connection issues"
        echo "  🔗 Repository URL has changed"
        echo "  📦 Git is not installed"
        echo
        echo "Please check your internet connection and try again."
        exit 1
    fi
    
    # Enter the directory
    cd pocketcloud
    log_info "Entered PocketCloud directory"
    
    wait_for_user
}

# Setup USB storage with detailed guidance
setup_usb_storage() {
    clear
    log_step "Step 7: Setting Up USB Storage"
    echo "=============================================="
    echo
    
    log_info "Now we'll prepare your USB drive for PocketCloud."
    echo
    echo "What this step does:"
    echo "  🔍 Finds your USB drive"
    echo "  💾 Formats it with the ext4 filesystem (Linux-optimized)"
    echo "  📁 Creates a mount point at /mnt/pocketcloud"
    echo "  🔧 Configures automatic mounting on boot"
    echo "  🔒 Sets proper permissions for security"
    echo
    
    log_warning "⚠️  LAST CHANCE: This will erase everything on your USB drive!"
    echo
    
    if ! ask_yes_no "Continue with USB drive setup?" "y"; then
        echo "USB storage setup is required for PocketCloud. Exiting."
        exit 1
    fi
    
    echo
    log_info "Running USB storage setup script..."
    echo "You'll be asked to select your USB drive and confirm the formatting."
    echo
    
    if sudo bash setup/setup-usb-storage.sh; then
        log_success "USB storage setup completed!"
    else
        log_error "USB storage setup failed"
        echo
        echo "Common issues:"
        echo "  🔌 USB drive not connected properly"
        echo "  💾 USB drive is faulty"
        echo "  🔒 Permission issues"
        echo
        echo "Please check your USB drive and try again."
        exit 1
    fi
    
    wait_for_user
}

# Install PocketCloud application
install_pocketcloud() {
    clear
    log_step "Step 8: Installing PocketCloud"
    echo "=============================================="
    echo
    
    log_info "Now we'll install PocketCloud on your system."
    echo
    echo "What this step does:"
    echo "  👤 Creates a 'pocketcloud' user account"
    echo "  📁 Copies files to /opt/pocketcloud"
    echo "  📦 Installs Node.js dependencies"
    echo "  🔗 Links storage to your USB drive"
    echo "  🚀 Sets up automatic startup service"
    echo "  🔥 Configures firewall rules"
    echo "  ▶️  Starts PocketCloud"
    echo
    echo "This will take 5-10 minutes."
    echo
    
    if ! ask_yes_no "Install PocketCloud now?" "y"; then
        echo "Installation is required to use PocketCloud. Exiting."
        exit 1
    fi
    
    echo
    log_info "Running PocketCloud installer..."
    echo "Please wait while we set everything up..."
    
    if sudo bash setup/install.sh; then
        log_success "PocketCloud installed successfully!"
    else
        log_error "PocketCloud installation failed"
        echo
        echo "Please check the error messages above."
        echo "Common issues:"
        echo "  💾 Not enough disk space"
        echo "  🔌 USB drive not properly mounted"
        echo "  🌐 Internet connection issues (for npm packages)"
        echo "  🔒 Permission issues"
        echo
        exit 1
    fi
    
    wait_for_user
}

# Test the installation
test_installation() {
    clear
    log_step "Step 9: Testing Your Installation"
    echo "=============================================="
    echo
    
    log_info "Let's make sure everything is working correctly..."
    echo
    
    # Check if service is running
    if systemctl is-active --quiet pocketcloud; then
        log_success "PocketCloud service is running!"
    else
        log_error "PocketCloud service is not running"
        echo
        echo "Let's try to start it..."
        if sudo systemctl start pocketcloud; then
            sleep 3
            if systemctl is-active --quiet pocketcloud; then
                log_success "PocketCloud service started successfully!"
            else
                log_error "Service still not running"
                echo "Check logs with: sudo journalctl -u pocketcloud -n 20"
                exit 1
            fi
        else
            log_error "Failed to start PocketCloud service"
            exit 1
        fi
    fi
    
    # Check if port is listening
    echo
    log_info "Checking if PocketCloud is listening on port 3000..."
    sleep 2
    
    if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
        log_success "Port 3000 is active!"
    else
        log_warning "Port 3000 not detected yet (service might still be starting)"
        echo "Waiting 10 seconds..."
        sleep 10
        
        if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
            log_success "Port 3000 is now active!"
        else
            log_error "Port 3000 is not responding"
            echo "Check logs with: sudo journalctl -u pocketcloud -n 20"
            exit 1
        fi
    fi
    
    # Test HTTP response
    echo
    log_info "Testing web interface..."
    
    if curl -s http://localhost:3000 > /dev/null; then
        log_success "Web interface is responding!"
    else
        log_warning "Web interface not responding yet"
        echo "This sometimes takes a minute. Let's wait..."
        sleep 15
        
        if curl -s http://localhost:3000 > /dev/null; then
            log_success "Web interface is now responding!"
        else
            log_error "Web interface is not working"
            echo "Check logs with: sudo journalctl -u pocketcloud -n 20"
            exit 1
        fi
    fi
    
    log_success "All tests passed! PocketCloud is working correctly!"
    wait_for_user
}

# Show access information
show_access_info() {
    clear
    log_step "Step 10: How to Access Your PocketCloud"
    echo "=============================================="
    echo
    
    log_success "🎉 Congratulations! PocketCloud is now running!"
    echo
    
    # Get IP addresses
    local ip_addresses=$(hostname -I)
    
    echo "📱 Access PocketCloud from:"
    echo
    echo "  🖥️  On this Pi:"
    echo "     http://localhost:3000"
    echo
    echo "  📱 From your phone/laptop/tablet:"
    for ip in $ip_addresses; do
        echo "     http://$ip:3000"
    done
    echo
    
    log_important "Write down these addresses! You'll need them to access PocketCloud."
    echo
    
    echo "🔐 First-time setup:"
    echo "  1. Open one of the URLs above in your web browser"
    echo "  2. Click 'Create Account'"
    echo "  3. Choose a username and strong password"
    echo "  4. Start uploading files!"
    echo
    
    echo "📱 Mobile access:"
    echo "  • Make sure your phone/tablet is on the same Wi-Fi network"
    echo "  • Use the IP address URLs (not localhost)"
    echo "  • Add to home screen for easy access"
    echo
    
    wait_for_user
}

# Show final information and tips
show_final_info() {
    clear
    echo "=============================================="
    log_success "🎉 PocketCloud Setup Complete!"
    echo "=============================================="
    echo
    
    echo "✅ What you now have:"
    echo "  🔒 Automatic file encryption (AES-256-GCM)"
    echo "  📱 Access from any device on your network"
    echo "  💾 All files stored on your USB drive"
    echo "  🚀 Starts automatically when Pi boots"
    echo "  🔧 Management tools for maintenance"
    echo
    
    echo "🛠️  Useful commands:"
    echo "  📊 Check status:    bash tools/system-status.sh"
    echo "  💾 Create backup:   sudo bash tools/backup-pocketcloud.sh"
    echo "  📋 View logs:       sudo journalctl -u pocketcloud -f"
    echo "  🔄 Restart:         sudo systemctl restart pocketcloud"
    echo
    
    echo "📚 Documentation:"
    echo "  📖 Complete guide: docs/COMPLETE_SETUP_GUIDE_2026.md"
    echo "  ⚡ Quick start:    docs/QUICKSTART.txt"
    echo "  🔧 Troubleshooting: Check the guides above"
    echo
    
    echo "🔒 Security reminders:"
    echo "  • Your password cannot be recovered if forgotten"
    echo "  • Files are encrypted and tied to your password"
    echo "  • Only access from trusted devices"
    echo "  • Create regular backups"
    echo "  • Keep your Pi physically secure"
    echo
    
    echo "💡 Tips:"
    echo "  • Test uploading a file to make sure everything works"
    echo "  • Add PocketCloud to your phone's home screen"
    echo "  • Create your first backup after uploading files"
    echo "  • Check system status weekly"
    echo
    
    log_important "Your personal cloud is ready! Enjoy secure, offline file storage!"
    echo
    
    if ask_yes_no "Would you like to open PocketCloud in the browser now?" "y"; then
        echo
        log_info "Opening PocketCloud in browser..."
        
        # Try to open browser
        if command -v firefox &> /dev/null; then
            firefox http://localhost:3000 &
        elif command -v chromium-browser &> /dev/null; then
            chromium-browser http://localhost:3000 &
        else
            echo "Please open your web browser and go to: http://localhost:3000"
        fi
    fi
    
    echo
    echo "Thank you for using PocketCloud! 🚀"
    echo
}

# Main setup flow
main() {
    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        log_error "Don't run this script as root (with sudo)"
        echo "Run it as a regular user: bash setup/interactive-setup.sh"
        exit 1
    fi
    
    # Check if we're in the right directory
    if [[ ! -f "setup/check-requirements.sh" ]]; then
        log_error "Please run this script from the PocketCloud directory"
        echo "Example: cd pocketcloud && bash setup/interactive-setup.sh"
        exit 1
    fi
    
    # Run setup steps
    show_welcome
    check_system_basics
    check_internet
    check_usb_drive
    install_nodejs
    update_system
    # download_pocketcloud  # Skip this since we're already in the directory
    setup_usb_storage
    install_pocketcloud
    test_installation
    show_access_info
    show_final_info
}

# Run main function
main "$@"