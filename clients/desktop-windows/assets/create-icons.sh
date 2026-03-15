#!/bin/bash

# PocketCloud Windows Icon Generation Script
# Creates Windows-compatible icons from SVG source

echo "Creating PocketCloud Windows icons..."

# Create assets directory
mkdir -p assets

# Create a simple SVG icon (placeholder)
cat > assets/icon.svg << 'EOF'
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cloudGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0078d4;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#106ebe;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Cloud shape -->
  <path d="M64 160 C64 140, 80 120, 100 120 C110 100, 130 80, 156 80 C180 80, 200 100, 200 120 C220 120, 240 140, 240 160 C240 180, 220 200, 200 200 L80 200 C64 200, 64 180, 64 160 Z" fill="url(#cloudGradient)" stroke="#005a9e" stroke-width="2"/>
  
  <!-- Folder icon inside cloud -->
  <rect x="110" y="130" width="36" height="24" rx="2" fill="#ffffff" opacity="0.9"/>
  <rect x="110" y="126" width="12" height="4" rx="1" fill="#ffffff" opacity="0.9"/>
  
  <!-- Connection dots -->
  <circle cx="90" cy="180" r="3" fill="#ffffff" opacity="0.8"/>
  <circle cx="128" cy="180" r="3" fill="#ffffff" opacity="0.8"/>
  <circle cx="166" cy="180" r="3" fill="#ffffff" opacity="0.8"/>
</svg>
EOF

# Note: In a real implementation, you would use tools like:
# - ImageMagick: convert icon.svg -resize 256x256 icon.png
# - png2ico: png2ico icon.ico icon-16.png icon-32.png icon-48.png icon-256.png
# - Or online converters to create proper .ico files

echo "Icon SVG created. Use ImageMagick or online tools to convert to .ico format:"
echo "  convert icon.svg -resize 256x256 icon.png"
echo "  # Then use png2ico or online converter to create icon.ico"

# Create tray icons (different states)
cat > assets/tray-icon-connected.svg << 'EOF'
<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <circle cx="8" cy="8" r="6" fill="#28a745" stroke="#ffffff" stroke-width="1"/>
  <path d="M5 8 L7 10 L11 6" stroke="#ffffff" stroke-width="1.5" fill="none"/>
</svg>
EOF

cat > assets/tray-icon-disconnected.svg << 'EOF'
<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <circle cx="8" cy="8" r="6" fill="#dc3545" stroke="#ffffff" stroke-width="1"/>
  <path d="M5 5 L11 11 M11 5 L5 11" stroke="#ffffff" stroke-width="1.5"/>
</svg>
EOF

cat > assets/tray-icon-sync.svg << 'EOF'
<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <circle cx="8" cy="8" r="6" fill="#ffc107" stroke="#ffffff" stroke-width="1"/>
  <path d="M8 4 L8 12 M5 9 L8 12 L11 9" stroke="#ffffff" stroke-width="1.2" fill="none"/>
</svg>
EOF

echo "Tray icon SVGs created."
echo ""
echo "To complete the icon setup:"
echo "1. Convert SVGs to PNG: convert *.svg -resize 16x16 *.png"
echo "2. Convert PNGs to ICO: png2ico tray-icon-connected.ico tray-icon-connected.png"
echo "3. Repeat for all tray icons"
echo ""
echo "Or use online converters to create Windows-compatible .ico files."