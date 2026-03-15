#!/bin/bash

# Install script for pcd-ctl CLI tool
# Works on both macOS and Linux (Pi)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_SOURCE="$SCRIPT_DIR/../cli/pcd-ctl.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*" >&2
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    else
        echo "unknown"
    fi
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        return 0
    else
        return 1
    fi
}

# Install on macOS
install_macos() {
    log_info "Installing pcd-ctl for macOS..."
    
    # Determine install location
    local install_dir
    if [[ -d "/usr/local/bin" ]] && [[ -w "/usr/local/bin" ]]; then
        install_dir="/usr/local/bin"
    elif [[ -d "$HOME/bin" ]]; then
        install_dir="$HOME/bin"
    else
        # Create ~/bin if it doesn't exist
        mkdir -p "$HOME/bin"
        install_dir="$HOME/bin"
        
        # Add to PATH if not already there
        local shell_rc
        if [[ "$SHELL" == *"zsh"* ]]; then
            shell_rc="$HOME/.zshrc"
        else
            shell_rc="$HOME/.bashrc"
        fi
        
        if [[ -f "$shell_rc" ]] && ! grep -q "$HOME/bin" "$shell_rc"; then
            echo 'export PATH="$HOME/bin:$PATH"' >> "$shell_rc"
            log_info "Added $HOME/bin to PATH in $shell_rc"
            log_warning "Please restart your terminal or run: source $shell_rc"
        fi
    fi
    
    # Copy and make executable
    cp "$CLI_SOURCE" "$install_dir/pcd-ctl"
    chmod +x "$install_dir/pcd-ctl"
    log_success "Installed pcd-ctl to $install_dir/pcd-ctl"
    
    # Install bash completion if possible
    local completion_dir
    if [[ -d "/usr/local/etc/bash_completion.d" ]]; then
        completion_dir="/usr/local/etc/bash_completion.d"
    elif [[ -d "/opt/homebrew/etc/bash_completion.d" ]]; then
        completion_dir="/opt/homebrew/etc/bash_completion.d"
    else
        completion_dir="$HOME/.bash_completion.d"
        mkdir -p "$completion_dir"
    fi
    
    create_bash_completion "$completion_dir/pcd-ctl"
    log_success "Installed bash completion to $completion_dir/pcd-ctl"
}

# Install on Linux
install_linux() {
    log_info "Installing pcd-ctl for Linux..."
    
    local install_dir="/usr/local/bin"
    local completion_dir="/etc/bash_completion.d"
    
    # Check if we need sudo
    if [[ ! -w "$install_dir" ]]; then
        if ! command -v sudo >/dev/null 2>&1; then
            log_error "Need write access to $install_dir but sudo not available"
            log_error "Please run as root or install sudo"
            exit 1
        fi
        
        log_info "Installing to system directory (requires sudo)..."
        sudo cp "$CLI_SOURCE" "$install_dir/pcd-ctl"
        sudo chmod +x "$install_dir/pcd-ctl"
        log_success "Installed pcd-ctl to $install_dir/pcd-ctl"
        
        # Install bash completion
        if [[ -d "$completion_dir" ]]; then
            create_bash_completion "/tmp/pcd-ctl-completion"
            sudo mv "/tmp/pcd-ctl-completion" "$completion_dir/pcd-ctl"
            log_success "Installed bash completion to $completion_dir/pcd-ctl"
        fi
    else
        # Can write directly
        cp "$CLI_SOURCE" "$install_dir/pcd-ctl"
        chmod +x "$install_dir/pcd-ctl"
        log_success "Installed pcd-ctl to $install_dir/pcd-ctl"
        
        # Install bash completion
        if [[ -d "$completion_dir" ]] && [[ -w "$completion_dir" ]]; then
            create_bash_completion "$completion_dir/pcd-ctl"
            log_success "Installed bash completion to $completion_dir/pcd-ctl"
        fi
    fi
}

# Create bash completion script
create_bash_completion() {
    local completion_file="$1"
    
    cat > "$completion_file" << 'EOF'
# Bash completion for pcd-ctl

_pcd_ctl_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    
    # Main commands
    local commands="init status logs users storage backup wifi update health temp help"
    
    # Subcommands
    local users_cmds="list create delete"
    local storage_cmds="info clean"
    local backup_cmds="now list restore"
    local wifi_cmds="list password ssid"
    
    case "${COMP_CWORD}" in
        1)
            COMPREPLY=($(compgen -W "${commands}" -- ${cur}))
            return 0
            ;;
        2)
            case "${prev}" in
                users)
                    COMPREPLY=($(compgen -W "${users_cmds}" -- ${cur}))
                    return 0
                    ;;
                storage)
                    COMPREPLY=($(compgen -W "${storage_cmds}" -- ${cur}))
                    return 0
                    ;;
                backup)
                    COMPREPLY=($(compgen -W "${backup_cmds}" -- ${cur}))
                    return 0
                    ;;
                wifi)
                    COMPREPLY=($(compgen -W "${wifi_cmds}" -- ${cur}))
                    return 0
                    ;;
                logs)
                    COMPREPLY=($(compgen -W "--follow -f" -- ${cur}))
                    return 0
                    ;;
            esac
            ;;
    esac
    
    return 0
}

complete -F _pcd_ctl_completion pcd-ctl
EOF
}

# Check dependencies
check_dependencies() {
    local missing=()
    
    if ! command -v curl >/dev/null 2>&1; then
        missing+=("curl")
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        missing+=("jq")
    fi
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_warning "Missing dependencies: ${missing[*]}"
        echo
        echo "Please install them:"
        case "$(detect_os)" in
            macos)
                echo "  brew install ${missing[*]}"
                ;;
            linux)
                echo "  Ubuntu/Debian: sudo apt install ${missing[*]}"
                echo "  CentOS/RHEL: sudo yum install ${missing[*]}"
                echo "  Alpine: sudo apk add ${missing[*]}"
                ;;
        esac
        echo
        read -p "Continue installation anyway? [y/N]: " continue_install
        if [[ ! "$continue_install" =~ ^[Yy]$ ]]; then
            log_info "Installation cancelled"
            exit 1
        fi
    fi
}

# Main installation
main() {
    echo "Pocket Cloud Drive CLI Installer"
    echo "================================"
    echo
    
    # Check if source file exists
    if [[ ! -f "$CLI_SOURCE" ]]; then
        log_error "Source file not found: $CLI_SOURCE"
        log_error "Please run this script from the project root directory"
        exit 1
    fi
    
    # Check dependencies
    check_dependencies
    
    # Detect OS and install
    local os
    os=$(detect_os)
    
    case "$os" in
        macos)
            install_macos
            ;;
        linux)
            install_linux
            ;;
        *)
            log_error "Unsupported operating system: $OSTYPE"
            log_error "This installer supports macOS and Linux only"
            exit 1
            ;;
    esac
    
    echo
    log_success "Installation completed successfully!"
    echo
    echo "Next steps:"
    echo "1. Run 'pcd-ctl init' to configure the CLI"
    echo "2. Run 'pcd-ctl status' to test the connection"
    echo "3. Run 'pcd-ctl help' to see all available commands"
    echo
    
    # Test if command is available
    if command -v pcd-ctl >/dev/null 2>&1; then
        log_success "pcd-ctl is now available in your PATH"
    else
        log_warning "pcd-ctl may not be in your PATH yet"
        log_warning "You may need to restart your terminal or update your PATH"
    fi
}

main "$@"