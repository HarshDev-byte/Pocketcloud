#!/bin/bash

# PocketCloud Setup Launcher - February 2026
# Guides users to the right setup method for their needs

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

log_important() {
    echo -e "${CYAN}⭐ $1${NC}"
}

# Show welcome and options
show_welcome() {
    clear
    echo "=============================================="
    echo "🚀 PocketCloud Setup - February 2026"
    echo "=============================================="
    echo
    echo "Welcome! Choose your setup method:"
    echo
    echo "1. 🎯 INTERACTIVE SETUP (Recommended for beginners)"
    echo "   • Step-by-step guidance with explanations"
    echo "   • Beginner-friendly with detailed help"
    echo "   • Checks everything and explains what's happening"
    echo "   • Takes 45-90 minutes"
    echo
    echo "2. ⚡ QUICK SETUP (For experienced users)"
    echo "   • Runs all setup scripts automatically"
    echo "   • Minimal prompts and explanations"
    echo "   • Assumes you know what you're doing"
    echo "   • Takes 15-30 minutes"
    echo
    echo "3. 🔧 MANUAL SETUP (For experts)"
    echo "   • Run individual setup scripts yourself"
    echo "   • Full control over each step"
    echo "   • Troubleshoot issues as they arise"
    echo "   • Time varies"
    echo
    echo "4. 📚 DOCUMENTATION (Read first!)"
    echo "   • View setup guides and documentation"
    echo "   • Troubleshooting help"
    echo "   • Visual guides and checklists"
    echo
    echo "5. ❌ EXIT"
    echo
}

# Get user choice
get_user_choice() {
    while true; do
        echo -e "${CYAN}Enter your choice (1-5): ${NC}"
        read -r choice
        
        case "$choice" in
            1)
                return 1
                ;;
            2)
                return 2
                ;;
            3)
                return 3
                ;;
            4)
                return 4
                ;;
            5)
                return 5
                ;;
            *)
                echo "Please enter a number between 1 and 5"
                ;;
        esac
    done
}

# Interactive setup
run_interactive_setup() {
    clear
    log_important "Starting Interactive Setup..."
    echo
    echo "This will guide you through every step with detailed explanations."
    echo "Perfect for first-time users or if you want to understand what's happening."
    echo
    echo "The interactive setup will:"
    echo "  🔍 Check your system thoroughly"
    echo "  📚 Explain each step in detail"
    echo "  ❓ Ask for confirmation before making changes"
    echo "  🆘 Provide help if something goes wrong"
    echo
    
    if [[ -f "setup/interactive-setup.sh" ]]; then
        bash setup/interactive-setup.sh
    else
        log_warning "Interactive setup script not found!"
        echo "Falling back to quick setup..."
        run_quick_setup
    fi
}

# Quick setup
run_quick_setup() {
    clear
    log_important "Starting Quick Setup..."
    echo
    echo "This will run all setup steps automatically with minimal prompts."
    echo "Recommended for users who have set up PocketCloud before."
    echo
    
    log_info "Running system requirements check..."
    if [[ -f "setup/check-requirements.sh" ]]; then
        bash setup/check-requirements.sh
    else
        log_warning "Requirements check script not found, continuing anyway..."
    fi
    
    echo
    log_info "Setting up USB storage..."
    if [[ -f "setup/setup-usb-storage.sh" ]]; then
        sudo bash setup/setup-usb-storage.sh
    else
        log_warning "USB setup script not found!"
        exit 1
    fi
    
    echo
    log_info "Installing PocketCloud..."
    if [[ -f "setup/install.sh" ]]; then
        sudo bash setup/install.sh
    else
        log_warning "Installation script not found!"
        exit 1
    fi
    
    echo
    log_success "Quick setup complete!"
    show_access_info
}

# Manual setup
run_manual_setup() {
    clear
    log_important "Manual Setup Instructions"
    echo
    echo "Run these commands in order:"
    echo
    echo "1. Check system requirements:"
    echo "   bash setup/check-requirements.sh"
    echo
    echo "2. Set up USB storage (requires sudo):"
    echo "   sudo bash setup/setup-usb-storage.sh"
    echo
    echo "3. Install PocketCloud (requires sudo):"
    echo "   sudo bash setup/install.sh"
    echo
    echo "4. Check system status:"
    echo "   bash tools/system-status.sh"
    echo
    echo "Individual script help:"
    echo "   bash setup/check-requirements.sh --help"
    echo "   bash setup/setup-usb-storage.sh --help"
    echo "   bash setup/install.sh --help"
    echo
    echo "Troubleshooting:"
    echo "   View logs: sudo journalctl -u pocketcloud -n 50"
    echo "   Check status: sudo systemctl status pocketcloud"
    echo
}

# Show documentation
show_documentation() {
    clear
    log_important "PocketCloud Documentation"
    echo
    echo "📚 Available Documentation:"
    echo
    
    if [[ -f "docs/COMPLETE_SETUP_GUIDE_2026.md" ]]; then
        echo "📖 Complete Setup Guide (RECOMMENDED):"
        echo "   docs/COMPLETE_SETUP_GUIDE_2026.md"
        echo "   • Ultra-detailed setup instructions"
        echo "   • Hardware shopping list"
        echo "   • Step-by-step with screenshots"
        echo
    fi
    
    if [[ -f "docs/PRE_SETUP_CHECKLIST.md" ]]; then
        echo "✅ Pre-Setup Checklist:"
        echo "   docs/PRE_SETUP_CHECKLIST.md"
        echo "   • What to buy and prepare"
        echo "   • Printable checklist"
        echo
    fi
    
    if [[ -f "docs/VISUAL_SETUP_GUIDE.md" ]]; then
        echo "🎨 Visual Setup Guide:"
        echo "   docs/VISUAL_SETUP_GUIDE.md"
        echo "   • ASCII diagrams and visual instructions"
        echo "   • Perfect for visual learners"
        echo
    fi
    
    if [[ -f "docs/QUICKSTART.txt" ]]; then
        echo "⚡ Quick Start Guide:"
        echo "   docs/QUICKSTART.txt"
        echo "   • Brief setup instructions"
        echo "   • For experienced users"
        echo
    fi
    
    if [[ -f "docs/TROUBLESHOOTING_2026.md" ]]; then
        echo "🔧 Troubleshooting Guide:"
        echo "   docs/TROUBLESHOOTING_2026.md"
        echo "   • Common problems and solutions"
        echo "   • Error message explanations"
        echo
    fi
    
    echo "📁 Management Tools:"
    echo "   tools/system-status.sh     - Check system health"
    echo "   tools/backup-pocketcloud.sh - Create backups"
    echo
    echo "🌐 Online Resources:"
    echo "   • Raspberry Pi Forums: https://www.raspberrypi.org/forums/"
    echo "   • Reddit: r/raspberry_pi"
    echo
    
    echo
    echo "💡 Recommendation:"
    echo "   1. Read docs/COMPLETE_SETUP_GUIDE_2026.md first"
    echo "   2. Print docs/PRE_SETUP_CHECKLIST.md"
    echo "   3. Run Interactive Setup (option 1)"
    echo
}

# Show access information
show_access_info() {
    echo
    log_success "🎉 PocketCloud is ready!"
    echo
    
    # Get IP addresses
    local ip_addresses=$(hostname -I 2>/dev/null || echo "")
    
    echo "🌐 Access your PocketCloud:"
    echo "   On this Pi: http://localhost:3000"
    
    for ip in $ip_addresses; do
        echo "   From network: http://$ip:3000"
    done
    
    echo
    echo "📱 Next steps:"
    echo "   1. Open PocketCloud in your web browser"
    echo "   2. Create your account"
    echo "   3. Upload your first files"
    echo "   4. Access from your phone/laptop"
    echo
    echo "🔧 Management:"
    echo "   Check status: bash tools/system-status.sh"
    echo "   Create backup: sudo bash tools/backup-pocketcloud.sh"
    echo
}

# Main function
main() {
    # Check if we're in the right directory
    if [[ ! -d "setup" || ! -d "tools" ]]; then
        log_warning "Please run this script from the PocketCloud directory"
        echo
        echo "Example:"
        echo "  cd pocketcloud"
        echo "  bash setup.sh"
        echo
        exit 1
    fi
    
    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        log_warning "Don't run this script as root (with sudo)"
        echo "Run it as a regular user: bash setup.sh"
        exit 1
    fi
    
    # Main menu loop
    while true; do
        show_welcome
        get_user_choice
        choice=$?
        
        case $choice in
            1)
                run_interactive_setup
                break
                ;;
            2)
                run_quick_setup
                break
                ;;
            3)
                run_manual_setup
                echo
                echo "Press ENTER to return to menu..."
                read -r
                ;;
            4)
                show_documentation
                echo
                echo "Press ENTER to return to menu..."
                read -r
                ;;
            5)
                echo "Goodbye!"
                exit 0
                ;;
        esac
    done
}

# Check for command line arguments
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    echo "PocketCloud Setup Script - February 2026"
    echo
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  --help, -h          Show this help message"
    echo "  --interactive       Run interactive setup directly"
    echo "  --quick             Run quick setup directly"
    echo "  --requirements      Run only requirements check"
    echo "  --usb-storage       Run only USB storage setup"
    echo "  --install           Run only PocketCloud installation"
    echo "  --status            Run only system status check"
    echo "  --docs              Show documentation menu"
    echo
    echo "Interactive menu (no arguments):"
    echo "  Provides guided setup with multiple options"
    echo
    exit 0
elif [[ "$1" == "--interactive" ]]; then
    run_interactive_setup
elif [[ "$1" == "--quick" ]]; then
    run_quick_setup
elif [[ "$1" == "--requirements" ]]; then
    bash setup/check-requirements.sh
elif [[ "$1" == "--usb-storage" ]]; then
    sudo bash setup/setup-usb-storage.sh
elif [[ "$1" == "--install" ]]; then
    sudo bash setup/install.sh
elif [[ "$1" == "--status" ]]; then
    bash tools/system-status.sh
elif [[ "$1" == "--docs" ]]; then
    show_documentation
else
    # Run interactive menu
    main "$@"
fi