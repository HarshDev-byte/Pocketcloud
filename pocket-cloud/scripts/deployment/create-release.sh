#!/bin/bash

# Pocket Cloud Drive Release Creation Script
# This script packages a complete release for distribution

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build"
RELEASE_DIR="$PROJECT_ROOT/releases"
DOWNLOADS_DIR="/mnt/pocketcloud/downloads"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Check if running on macOS (required for building Mac clients)
if [[ "$OSTYPE" != "darwin"* ]]; then
    log_error "This script must be run on macOS to build all client platforms"
    exit 1
fi

# Check required tools
check_dependencies() {
    log_info "Checking dependencies..."
    
    local missing_deps=()
    
    # Check Node.js and pnpm
    if ! command -v node &> /dev/null; then
        missing_deps+=("node")
    fi
    
    if ! command -v pnpm &> /dev/null; then
        missing_deps+=("pnpm")
    fi
    
    # Check electron-builder
    if ! command -v electron-builder &> /dev/null; then
        missing_deps+=("electron-builder")
    fi
    
    # Check rsync for deployment
    if ! command -v rsync &> /dev/null; then
        missing_deps+=("rsync")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        log_info "Install missing dependencies and try again"
        exit 1
    fi
    
    log_success "All dependencies found"
}

# Get version from package.json
get_version() {
    local version=$(node -p "require('$PROJECT_ROOT/backend/package.json').version")
    echo "$version"
}

# Bump version in all package.json files
bump_version() {
    local new_version="$1"
    
    if [ -z "$new_version" ]; then
        log_error "No version specified"
        exit 1
    fi
    
    log_info "Bumping version to $new_version..."
    
    # Update backend package.json
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('$PROJECT_ROOT/backend/package.json', 'utf8'));
        pkg.version = '$new_version';
        fs.writeFileSync('$PROJECT_ROOT/backend/package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    
    # Update frontend package.json
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('$PROJECT_ROOT/frontend/package.json', 'utf8'));
        pkg.version = '$new_version';
        fs.writeFileSync('$PROJECT_ROOT/frontend/package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    
    # Update desktop client package.json files
    for client_dir in "$PROJECT_ROOT"/../pocketcloud-mac "$PROJECT_ROOT"/../pocketcloud-win; do
        if [ -d "$client_dir" ]; then
            node -e "
                const fs = require('fs');
                const pkg = JSON.parse(fs.readFileSync('$client_dir/package.json', 'utf8'));
                pkg.version = '$new_version';
                fs.writeFileSync('$client_dir/package.json', JSON.stringify(pkg, null, 2) + '\n');
            "
        fi
    done
    
    log_success "Version bumped to $new_version"
}

# Build backend
build_backend() {
    log_info "Building backend..."
    
    cd "$PROJECT_ROOT/backend"
    
    # Install dependencies
    pnpm install --prod
    
    # Build TypeScript
    pnpm run build
    
    log_success "Backend built successfully"
}

# Build frontend
build_frontend() {
    log_info "Building frontend..."
    
    cd "$PROJECT_ROOT/frontend"
    
    # Install dependencies
    pnpm install
    
    # Build for production
    pnpm run build
    
    log_success "Frontend built successfully"
}

# Build Mac desktop client
build_mac_client() {
    local mac_dir="$PROJECT_ROOT/../pocketcloud-mac"
    
    if [ ! -d "$mac_dir" ]; then
        log_warning "Mac client directory not found, skipping Mac build"
        return
    fi
    
    log_info "Building Mac desktop client..."
    
    cd "$mac_dir"
    
    # Install dependencies
    pnpm install
    
    # Build for both architectures
    pnpm run build:mac-universal
    
    # Copy built files to release directory
    mkdir -p "$RELEASE_DIR/clients"
    cp dist/*.dmg "$RELEASE_DIR/clients/" 2>/dev/null || true
    
    log_success "Mac client built successfully"
}

# Build Windows desktop client (cross-compile from Mac)
build_windows_client() {
    local win_dir="$PROJECT_ROOT/../pocketcloud-win"
    
    if [ ! -d "$win_dir" ]; then
        log_warning "Windows client directory not found, skipping Windows build"
        return
    fi
    
    log_info "Building Windows desktop client..."
    
    cd "$win_dir"
    
    # Install dependencies
    pnpm install
    
    # Build for Windows
    pnpm run build:win
    
    # Copy built files to release directory
    mkdir -p "$RELEASE_DIR/clients"
    cp dist/*.exe "$RELEASE_DIR/clients/" 2>/dev/null || true
    
    log_success "Windows client built successfully"
}

# Package server release
package_server_release() {
    local version="$1"
    local release_name="pocketcloud-v${version}"
    local release_path="$RELEASE_DIR/${release_name}.tar.gz"
    
    log_info "Packaging server release..."
    
    # Create temporary directory for packaging
    local temp_dir=$(mktemp -d)
    local package_dir="$temp_dir/$release_name"
    
    mkdir -p "$package_dir"
    
    # Copy backend files
    cp -r "$PROJECT_ROOT/backend/dist" "$package_dir/backend"
    cp -r "$PROJECT_ROOT/backend/node_modules" "$package_dir/backend/"
    cp "$PROJECT_ROOT/backend/package.json" "$package_dir/backend/"
    
    # Copy frontend build
    cp -r "$PROJECT_ROOT/frontend/dist" "$package_dir/frontend"
    
    # Copy database migrations
    mkdir -p "$package_dir/backend/src/db"
    cp -r "$PROJECT_ROOT/backend/src/db/migrations" "$package_dir/backend/src/db/"
    
    # Copy scripts
    cp -r "$PROJECT_ROOT/scripts" "$package_dir/"
    
    # Copy configuration files
    cp "$PROJECT_ROOT/.env.example" "$package_dir/"
    cp "$PROJECT_ROOT/README.md" "$package_dir/"
    
    # Create release archive
    cd "$temp_dir"
    tar -czf "$release_path" "$release_name"
    
    # Clean up
    rm -rf "$temp_dir"
    
    log_success "Server release packaged: $release_path"
    echo "$release_path"
}

# Generate checksums
generate_checksums() {
    local release_path="$1"
    
    log_info "Generating checksums..."
    
    # SHA256 checksum
    local sha256=$(shasum -a 256 "$release_path" | cut -d' ' -f1)
    echo "$sha256" > "${release_path}.sha256"
    
    # MD5 checksum (for compatibility)
    local md5=$(md5 -q "$release_path")
    echo "$md5" > "${release_path}.md5"
    
    log_success "Checksums generated"
    echo "SHA256: $sha256"
    echo "MD5: $md5"
}

# Create release notes
create_release_notes() {
    local version="$1"
    local notes_file="$RELEASE_DIR/release-notes-v${version}.md"
    
    log_info "Creating release notes..."
    
    cat > "$notes_file" << EOF
# Pocket Cloud Drive v${version}

Released: $(date '+%Y-%m-%d')

## What's New

### Features
- Enhanced search system with FTS5 full-text search
- Over-the-air update system for Pi and desktop clients
- Improved file versioning and conflict resolution
- Better mobile PWA experience

### Improvements
- Performance optimizations for Raspberry Pi hardware
- Enhanced security with better authentication
- Improved WebDAV compatibility
- Better error handling and logging

### Bug Fixes
- Fixed various UI issues on mobile devices
- Improved file upload reliability
- Better handling of large files
- Fixed sync conflicts in multi-user environments

## Installation

### New Installation
1. Download pocketcloud-v${version}.tar.gz
2. Extract to /opt/pocketcloud
3. Run ./scripts/setup.sh
4. Access via http://your-pi-ip:3000

### Update from Previous Version
1. Use the admin panel to check for updates
2. Click "Update Now" to apply automatically
3. Or manually download and extract the new version

## Desktop Clients

- **macOS**: Download the .dmg file and install
- **Windows**: Download the .exe installer
- **Linux**: Use the CLI client or web interface

## System Requirements

- Raspberry Pi 4 (2GB+ RAM recommended)
- 16GB+ microSD card (Class 10 or better)
- Network connection (WiFi or Ethernet)

## Support

- Documentation: https://docs.pocketcloud.dev
- Issues: https://github.com/pocketcloud/issues
- Community: https://discord.gg/pocketcloud

---

**Full Changelog**: https://github.com/pocketcloud/compare/v${version}
EOF

    log_success "Release notes created: $notes_file"
}

# Deploy to Pi (if accessible)
deploy_to_pi() {
    local pi_host="$1"
    local release_path="$2"
    local version="$3"
    
    if [ -z "$pi_host" ]; then
        log_warning "No Pi host specified, skipping deployment"
        return
    fi
    
    log_info "Deploying to Pi: $pi_host"
    
    # Copy release files to Pi
    rsync -avz "$RELEASE_DIR/" "pi@$pi_host:$DOWNLOADS_DIR/" || {
        log_warning "Failed to deploy to Pi, continuing..."
        return
    }
    
    # Update latest.json for client updates
    ssh "pi@$pi_host" "cat > $DOWNLOADS_DIR/latest.json << EOF
{
  \"version\": \"$version\",
  \"downloadUrl\": \"http://192.168.4.1/downloads/pocketcloud-v${version}.tar.gz\",
  \"sha256\": \"$(cat "${release_path}.sha256")\",
  \"releaseDate\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"releaseNotes\": \"Pocket Cloud Drive v${version}\\n\\nSee release notes for details.\",
  \"size\": $(stat -f%z "$release_path" 2>/dev/null || stat -c%s "$release_path")
}
EOF"
    
    log_success "Deployed to Pi successfully"
}

# Main function
main() {
    local version=""
    local pi_host=""
    local skip_build=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--version)
                version="$2"
                shift 2
                ;;
            -p|--pi-host)
                pi_host="$2"
                shift 2
                ;;
            --skip-build)
                skip_build=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  -v, --version VERSION    Set release version"
                echo "  -p, --pi-host HOST       Deploy to Pi host"
                echo "  --skip-build            Skip building, just package"
                echo "  -h, --help              Show this help"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Get current version if not specified
    if [ -z "$version" ]; then
        version=$(get_version)
        log_info "Using current version: $version"
    fi
    
    # Create directories
    mkdir -p "$BUILD_DIR" "$RELEASE_DIR"
    
    log_info "Creating Pocket Cloud Drive v${version} release..."
    
    # Check dependencies
    check_dependencies
    
    # Bump version if specified
    if [ "$version" != "$(get_version)" ]; then
        bump_version "$version"
    fi
    
    if [ "$skip_build" = false ]; then
        # Build all components
        build_backend
        build_frontend
        build_mac_client
        build_windows_client
    fi
    
    # Package server release
    local release_path=$(package_server_release "$version")
    
    # Generate checksums
    generate_checksums "$release_path"
    
    # Create release notes
    create_release_notes "$version"
    
    # Deploy to Pi if specified
    if [ -n "$pi_host" ]; then
        deploy_to_pi "$pi_host" "$release_path" "$version"
    fi
    
    log_success "Release v${version} created successfully!"
    log_info "Release files:"
    ls -la "$RELEASE_DIR"/*v${version}*
    
    log_info "Next steps:"
    echo "1. Test the release on a clean Pi"
    echo "2. Upload to GitHub releases"
    echo "3. Update documentation"
    echo "4. Announce the release"
}

# Run main function with all arguments
main "$@"