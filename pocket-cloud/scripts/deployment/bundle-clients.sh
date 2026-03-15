#!/bin/bash

# Bundle client applications for distribution
# This script builds and packages all client applications for self-hosting

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOWNLOADS_DIR="/mnt/pocketcloud/downloads"
BUILD_DIR="$PROJECT_ROOT/build"

echo "🚀 Building PocketCloud client distribution packages..."

# Create directories
mkdir -p "$DOWNLOADS_DIR"
mkdir -p "$BUILD_DIR"

# Function to calculate SHA256
calculate_sha256() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | cut -d' ' -f1
    else
        echo "unknown"
    fi
}

# Function to get file size
get_file_size() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        stat -f%z "$1"
    else
        stat -c%s "$1"
    fi
}

# Initialize versions.json
cat > "$DOWNLOADS_DIR/versions.json" << 'EOF'
{
  "generated": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "generator": "bundle-clients.sh"
}
EOF

# Build macOS app (if on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "📱 Building macOS application..."
    
    if [ -d "$PROJECT_ROOT/pocketcloud-mac" ]; then
        cd "$PROJECT_ROOT/pocketcloud-mac"
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            npm install
        fi
        
        # Build for Apple Silicon
        echo "  Building for Apple Silicon (ARM64)..."
        npm run build:mac-arm64
        
        # Build for Intel
        echo "  Building for Intel (x64)..."
        npm run build:mac-x64
        
        # Copy DMGs to downloads directory
        if [ -f "dist/PocketCloud-*.dmg" ]; then
            for dmg in dist/PocketCloud-*-arm64.dmg; do
                if [ -f "$dmg" ]; then
                    cp "$dmg" "$DOWNLOADS_DIR/mac-arm64.dmg"
                    echo "  ✅ Copied ARM64 DMG: $(basename "$dmg")"
                fi
            done
            
            for dmg in dist/PocketCloud-*-x64.dmg; do
                if [ -f "$dmg" ]; then
                    cp "$dmg" "$DOWNLOADS_DIR/mac-x64.dmg"
                    echo "  ✅ Copied x64 DMG: $(basename "$dmg")"
                fi
            done
        fi
        
        cd "$PROJECT_ROOT"
    else
        echo "  ⚠️  macOS project not found, skipping..."
    fi
else
    echo "  ⚠️  Not on macOS, skipping macOS build..."
fi

# Build Windows app (cross-compile or copy pre-built)
echo "🪟 Preparing Windows application..."

if [ -d "$PROJECT_ROOT/pocketcloud-win" ]; then
    cd "$PROJECT_ROOT/pocketcloud-win"
    
    # Check if we can cross-compile
    if command -v wine >/dev/null 2>&1; then
        echo "  Cross-compiling Windows app..."
        npm install
        npm run build:win
        
        if [ -f "dist/PocketCloud-Setup-*.exe" ]; then
            cp dist/PocketCloud-Setup-*.exe "$DOWNLOADS_DIR/win-x64-setup.exe"
            echo "  ✅ Built and copied Windows installer"
        fi
    else
        echo "  ⚠️  Wine not available for cross-compilation"
        echo "  📝 Please build on Windows and copy to: $DOWNLOADS_DIR/win-x64-setup.exe"
    fi
    
    cd "$PROJECT_ROOT"
else
    echo "  ⚠️  Windows project not found"
fi

# Build Linux CLI and GTK app
echo "🐧 Building Linux applications..."

if [ -d "$PROJECT_ROOT/pcd-cli" ]; then
    cd "$PROJECT_ROOT/pcd-cli"
    
    # Install dependencies
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    # Build CLI for different architectures
    echo "  Building CLI binaries..."
    
    # x64 binary
    npm run build:linux-x64
    if [ -f "dist/pcd-linux-x64" ]; then
        cp "dist/pcd-linux-x64" "$DOWNLOADS_DIR/pcd-linux-x64"
        chmod +x "$DOWNLOADS_DIR/pcd-linux-x64"
        echo "  ✅ Built Linux CLI (x64)"
    fi
    
    # ARM64 binary
    npm run build:linux-arm64
    if [ -f "dist/pcd-linux-arm64" ]; then
        cp "dist/pcd-linux-arm64" "$DOWNLOADS_DIR/pcd-linux-arm64"
        chmod +x "$DOWNLOADS_DIR/pcd-linux-arm64"
        echo "  ✅ Built Linux CLI (ARM64)"
    fi
    
    cd "$PROJECT_ROOT"
fi

# Create Linux distribution bundles
echo "  Creating Linux distribution bundles..."

# x64 bundle
if [ -f "$DOWNLOADS_DIR/pcd-linux-x64" ] && [ -f "$PROJECT_ROOT/pocketcloud-gtk/pocketcloud-tray.py" ]; then
    BUNDLE_DIR="$BUILD_DIR/linux-x64"
    mkdir -p "$BUNDLE_DIR"
    
    # Copy files
    cp "$DOWNLOADS_DIR/pcd-linux-x64" "$BUNDLE_DIR/pcd"
    cp "$PROJECT_ROOT/pocketcloud-gtk/pocketcloud-tray.py" "$BUNDLE_DIR/"
    cp "$PROJECT_ROOT/scripts/install-linux.sh" "$BUNDLE_DIR/install.sh"
    
    # Create README
    cat > "$BUNDLE_DIR/README.md" << 'EOF'
# PocketCloud Linux Distribution

This bundle contains:
- `pcd` - Command line interface
- `pocketcloud-tray.py` - GTK system tray application
- `install.sh` - Installation script

## Quick Install
```bash
sudo ./install.sh
```

## Manual Install
```bash
# Install CLI
sudo cp pcd /usr/local/bin/
sudo chmod +x /usr/local/bin/pcd

# Install GTK app (requires Python 3 + GTK)
cp pocketcloud-tray.py ~/.local/bin/
chmod +x ~/.local/bin/pocketcloud-tray.py
```
EOF
    
    # Create tarball
    cd "$BUILD_DIR"
    tar -czf "$DOWNLOADS_DIR/linux-x64.tar.gz" linux-x64/
    echo "  ✅ Created Linux x64 bundle"
    cd "$PROJECT_ROOT"
fi

# ARM64 bundle (similar to x64)
if [ -f "$DOWNLOADS_DIR/pcd-linux-arm64" ]; then
    BUNDLE_DIR="$BUILD_DIR/linux-arm64"
    mkdir -p "$BUNDLE_DIR"
    
    cp "$DOWNLOADS_DIR/pcd-linux-arm64" "$BUNDLE_DIR/pcd"
    cp "$PROJECT_ROOT/pocketcloud-gtk/pocketcloud-tray.py" "$BUNDLE_DIR/"
    cp "$PROJECT_ROOT/scripts/install-linux.sh" "$BUNDLE_DIR/install.sh"
    cp "$BUILD_DIR/linux-x64/README.md" "$BUNDLE_DIR/"
    
    cd "$BUILD_DIR"
    tar -czf "$DOWNLOADS_DIR/linux-arm64.tar.gz" linux-arm64/
    echo "  ✅ Created Linux ARM64 bundle"
    cd "$PROJECT_ROOT"
fi

# Copy installer script
if [ -f "$PROJECT_ROOT/scripts/install-linux.sh" ]; then
    cp "$PROJECT_ROOT/scripts/install-linux.sh" "$DOWNLOADS_DIR/install.sh"
    echo "  ✅ Copied Linux installer script"
fi

# Copy iOS Shortcut (already exists)
if [ -f "$PROJECT_ROOT/assets/pocketcloud-upload.shortcut" ]; then
    cp "$PROJECT_ROOT/assets/pocketcloud-upload.shortcut" "$DOWNLOADS_DIR/"
    echo "  ✅ Copied iOS Shortcut"
fi

# Generate versions.json with file metadata
echo "📊 Generating versions.json..."

VERSIONS_JSON="$DOWNLOADS_DIR/versions.json"
cat > "$VERSIONS_JSON" << EOF
{
  "generated": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "generator": "bundle-clients.sh"
EOF

# Add file information for each available download
for file in mac-arm64.dmg mac-x64.dmg win-x64-setup.exe linux-x64.tar.gz linux-arm64.tar.gz; do
    filepath="$DOWNLOADS_DIR/$file"
    if [ -f "$filepath" ]; then
        key=$(echo "$file" | sed 's/\.(dmg|exe|tar\.gz)$//')
        size=$(get_file_size "$filepath")
        sha256=$(calculate_sha256 "$filepath")
        
        cat >> "$VERSIONS_JSON" << EOF
,
  "$key": {
    "version": "1.0.0",
    "size": $size,
    "sha256": "$sha256",
    "filename": "$file"
  }
EOF
    fi
done

# Close JSON
echo "}" >> "$VERSIONS_JSON"

# Display summary
echo ""
echo "📦 Distribution Summary:"
echo "======================="

total_size=0
for file in "$DOWNLOADS_DIR"/*; do
    if [ -f "$file" ] && [[ "$(basename "$file")" != "versions.json" ]]; then
        size=$(get_file_size "$file")
        size_mb=$((size / 1024 / 1024))
        total_size=$((total_size + size))
        echo "  $(basename "$file"): ${size_mb}MB"
    fi
done

total_mb=$((total_size / 1024 / 1024))
echo "  Total: ${total_mb}MB"
echo ""
echo "✅ Client distribution ready at: $DOWNLOADS_DIR"
echo "🌐 Access via: http://192.168.4.1/get"

# Set proper permissions
chmod -R 644 "$DOWNLOADS_DIR"/*
chmod 755 "$DOWNLOADS_DIR"/*.sh 2>/dev/null || true
chmod 755 "$DOWNLOADS_DIR"/pcd-* 2>/dev/null || true

echo "🎉 Bundle complete!"