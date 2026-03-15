#!/bin/bash
# Pocket Cloud Drive - Node.js Setup Script
# Installs Node.js 20 LTS and pnpm for ARM64/ARMv7

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}[NODE]${NC} $1"; }
print_success() { echo -e "${GREEN}[NODE]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[NODE]${NC} $1"; }
print_error() { echo -e "${RED}[NODE]${NC} $1"; }

NODE_VERSION="20"
ARCH=$(uname -m)

detect_architecture() {
    print_step "Detecting system architecture..."
    
    case "$ARCH" in
        "aarch64")
            NODE_ARCH="arm64"
            print_step "Detected: ARM64 (aarch64)"
            ;;
        "armv7l")
            NODE_ARCH="armv7l"
            print_step "Detected: ARMv7 (armv7l)"
            ;;
        "x86_64")
            NODE_ARCH="x64"
            print_warning "Detected: x86_64 (not typical for Pi)"
            ;;
        *)
            print_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
    
    print_success "Architecture: $ARCH -> Node.js: $NODE_ARCH"
}

check_existing_node() {
    print_step "Checking for existing Node.js installation..."
    
    if command -v node >/dev/null 2>&1; then
        local current_version=$(node --version 2>/dev/null | sed 's/v//')
        local major_version=$(echo "$current_version" | cut -d. -f1)
        
        print_step "Found Node.js version: $current_version"
        
        if [[ "$major_version" == "$NODE_VERSION" ]]; then
            print_success "Node.js $NODE_VERSION is already installed"
            return 0
        else
            print_warning "Different Node.js version found: $current_version"
            print_step "Will install Node.js $NODE_VERSION"
        fi
    else
        print_step "Node.js not found, will install"
    fi
    
    return 1
}

remove_old_nodejs() {
    print_step "Removing old Node.js installations..."
    
    # Remove system Node.js packages
    apt-get remove -y nodejs npm node 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
    
    # Remove NodeSource repository if it exists
    rm -f /etc/apt/sources.list.d/nodesource.list
    rm -f /usr/share/keyrings/nodesource.gpg
    
    # Clean up any remaining files
    rm -rf /usr/local/lib/node_modules 2>/dev/null || true
    rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx 2>/dev/null || true
    
    print_success "Old Node.js installations removed"
}

install_nodejs_nodesource() {
    print_step "Installing Node.js $NODE_VERSION LTS via NodeSource..."
    
    # Install prerequisites
    apt-get update -qq
    apt-get install -y -qq curl gnupg2 software-properties-common
    
    # Download and install NodeSource setup script
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    
    # Install Node.js
    export DEBIAN_FRONTEND=noninteractive
    apt-get install -y -qq nodejs
    
    print_success "Node.js installed via NodeSource"
}

install_nodejs_binary() {
    print_step "Installing Node.js $NODE_VERSION LTS via binary download..."
    
    local node_url="https://nodejs.org/dist/latest-v${NODE_VERSION}.x/node-v${NODE_VERSION}*-linux-${NODE_ARCH}.tar.xz"
    local temp_dir="/tmp/nodejs-install"
    
    # Create temp directory
    mkdir -p "$temp_dir"
    cd "$temp_dir"
    
    # Download latest Node.js binary
    print_step "Downloading Node.js binary..."
    local download_url=$(curl -s "https://nodejs.org/dist/latest-v${NODE_VERSION}.x/" | grep -o "node-v${NODE_VERSION}[^\"]*linux-${NODE_ARCH}\.tar\.xz" | head -1)
    
    if [[ -z "$download_url" ]]; then
        print_error "Could not find Node.js binary for $NODE_ARCH"
        exit 1
    fi
    
    curl -fsSL "https://nodejs.org/dist/latest-v${NODE_VERSION}.x/$download_url" -o nodejs.tar.xz
    
    # Extract and install
    print_step "Extracting and installing..."
    tar -xf nodejs.tar.xz
    local extracted_dir=$(ls -d node-v${NODE_VERSION}*-linux-${NODE_ARCH})
    
    # Copy to system directories
    cp -r "$extracted_dir"/* /usr/local/
    
    # Create symlinks
    ln -sf /usr/local/bin/node /usr/bin/node
    ln -sf /usr/local/bin/npm /usr/bin/npm
    ln -sf /usr/local/bin/npx /usr/bin/npx
    
    # Cleanup
    cd /
    rm -rf "$temp_dir"
    
    print_success "Node.js installed via binary"
}

install_nodejs() {
    # Try NodeSource first, fallback to binary
    if install_nodejs_nodesource 2>/dev/null; then
        return 0
    else
        print_warning "NodeSource installation failed, trying binary installation..."
        install_nodejs_binary
    fi
}

install_pnpm() {
    print_step "Installing pnpm package manager..."
    
    # Install pnpm via npm
    npm install -g pnpm@latest
    
    # Create symlink if needed
    if [[ ! -f /usr/bin/pnpm ]] && [[ -f /usr/local/bin/pnpm ]]; then
        ln -sf /usr/local/bin/pnpm /usr/bin/pnpm
    fi
    
    print_success "pnpm installed successfully"
}

configure_npm() {
    print_step "Configuring npm settings..."
    
    # Set npm registry (use default)
    npm config set registry https://registry.npmjs.org/
    
    # Configure for Pi performance
    npm config set maxsockets 3
    npm config set progress false
    npm config set audit false
    npm config set fund false
    
    # Set cache directory
    npm config set cache /tmp/npm-cache
    
    print_success "npm configured for Pi performance"
}

verify_installation() {
    print_step "Verifying Node.js installation..."
    
    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        print_error "Node.js installation failed - command not found"
        exit 1
    fi
    
    local node_version=$(node --version)
    local node_major=$(echo "$node_version" | sed 's/v//' | cut -d. -f1)
    
    if [[ "$node_major" != "$NODE_VERSION" ]]; then
        print_error "Wrong Node.js version installed: $node_version (expected v$NODE_VERSION.x)"
        exit 1
    fi
    
    print_success "Node.js version: $node_version"
    
    # Check npm
    if ! command -v npm >/dev/null 2>&1; then
        print_error "npm installation failed - command not found"
        exit 1
    fi
    
    local npm_version=$(npm --version)
    print_success "npm version: $npm_version"
    
    # Check pnpm
    if ! command -v pnpm >/dev/null 2>&1; then
        print_error "pnpm installation failed - command not found"
        exit 1
    fi
    
    local pnpm_version=$(pnpm --version)
    print_success "pnpm version: $pnpm_version"
    
    # Test basic functionality
    print_step "Testing Node.js functionality..."
    
    local test_result=$(node -e "console.log('Node.js is working')" 2>&1)
    if [[ "$test_result" == "Node.js is working" ]]; then
        print_success "Node.js functionality test passed"
    else
        print_error "Node.js functionality test failed: $test_result"
        exit 1
    fi
}

optimize_for_pi() {
    print_step "Optimizing Node.js for Raspberry Pi..."
    
    # Set Node.js memory limits for Pi
    cat > /etc/environment << 'EOF'
# Node.js optimization for Raspberry Pi
NODE_OPTIONS="--max-old-space-size=512 --optimize-for-size"
UV_THREADPOOL_SIZE=2
EOF

    # Create npm configuration for pi user
    if id "pi" >/dev/null 2>&1; then
        local pi_home=$(getent passwd pi | cut -d: -f6)
        
        mkdir -p "$pi_home/.npm"
        cat > "$pi_home/.npmrc" << EOF
# npm configuration for Raspberry Pi
maxsockets=3
progress=false
audit=false
fund=false
cache=/tmp/npm-cache-pi
EOF
        
        chown -R pi:pi "$pi_home/.npm" "$pi_home/.npmrc" 2>/dev/null || true
        print_step "Created npm config for pi user"
    fi
    
    print_success "Node.js optimized for Pi performance"
}

cleanup_installation() {
    print_step "Cleaning up installation files..."
    
    # Clean npm cache
    npm cache clean --force 2>/dev/null || true
    
    # Clean apt cache
    apt-get clean
    apt-get autoremove -y
    
    # Remove temporary files
    rm -rf /tmp/npm-cache* /tmp/nodejs-* 2>/dev/null || true
    
    print_success "Installation cleanup completed"
}

main() {
    print_step "Starting Node.js installation..."
    
    detect_architecture
    
    if ! check_existing_node; then
        remove_old_nodejs
        install_nodejs
        install_pnpm
        configure_npm
        optimize_for_pi
    fi
    
    verify_installation
    cleanup_installation
    
    print_success "Node.js setup completed successfully"
    
    # Display versions
    echo
    print_step "Installed versions:"
    echo "  Node.js: $(node --version)"
    echo "  npm: $(npm --version)"
    echo "  pnpm: $(pnpm --version)"
    echo "  Architecture: $ARCH"
}

# Rollback instructions (as comments for reference):
# To rollback Node.js installation:
# 1. sudo apt-get remove nodejs npm
# 2. sudo rm -rf /usr/local/lib/node_modules
# 3. sudo rm /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx
# 4. sudo rm /usr/bin/node /usr/bin/npm /usr/bin/npx /usr/bin/pnpm
# 5. sudo rm /etc/apt/sources.list.d/nodesource.list
# 6. sudo rm /usr/share/keyrings/nodesource.gpg

main "$@"