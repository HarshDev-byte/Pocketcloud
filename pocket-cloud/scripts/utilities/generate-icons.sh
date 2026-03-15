#!/bin/bash

# Generate PWA icons for PocketCloud Drive
# Uses ImageMagick to resize a source SVG to all required sizes

set -e

ICONS_DIR="frontend/public/icons"
mkdir -p "$ICONS_DIR"

# Create source SVG icon (cloud + hard drive)
cat > "$ICONS_DIR/source-icon.svg" << 'EOF'
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="cloudGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f8fafc;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background with rounded corners -->
  <rect width="512" height="512" rx="80" fill="url(#gradient)" />
  
  <!-- Cloud shape -->
  <g transform="translate(256,200)">
    <path d="M-80 40c-20 0-36-16-36-36s16-36 36-36c6.6 0 12.8 1.8 18.1 4.9C-52.6-50.4-26.7-64 0-64s52.6 13.6 61.9 34.9c5.3-3.1 11.5-4.9 18.1-4.9 20 0 36 16 36 36s-16 36-36 36H-80z" 
          fill="url(#cloudGradient)" 
          stroke="rgba(255,255,255,0.3)" 
          stroke-width="2"/>
  </g>
  
  <!-- Hard drive icon -->
  <g transform="translate(256,320)">
    <!-- Main body -->
    <rect x="-60" y="-25" width="120" height="50" rx="8" fill="white" opacity="0.95"/>
    
    <!-- Drive bays -->
    <rect x="-50" y="-15" width="100" height="6" rx="3" fill="#2563eb" opacity="0.8"/>
    <rect x="-50" y="-5" width="100" height="6" rx="3" fill="#2563eb" opacity="0.6"/>
    <rect x="-50" y="5" width="100" height="6" rx="3" fill="#2563eb" opacity="0.4"/>
    
    <!-- Status lights -->
    <circle cx="35" cy="15" r="4" fill="#10b981"/>
    <circle cx="45" cy="15" r="3" fill="#f59e0b"/>
  </g>
  
  <!-- Connection lines (data flow) -->
  <g opacity="0.6">
    <path d="M200 240 Q180 260 200 280" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M312 240 Q332 260 312 280" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/>
  </g>
</svg>
EOF

# Function to create PNG from SVG using ImageMagick
create_png() {
  local size=$1
  local output="$ICONS_DIR/icon-${size}.png"
  
  if command -v magick >/dev/null 2>&1; then
    # ImageMagick 7
    magick "$ICONS_DIR/source-icon.svg" -resize "${size}x${size}" "$output"
    echo "✓ Created ${size}x${size} PNG icon"
  elif command -v convert >/dev/null 2>&1; then
    # ImageMagick 6
    convert "$ICONS_DIR/source-icon.svg" -resize "${size}x${size}" "$output"
    echo "✓ Created ${size}x${size} PNG icon"
  else
    echo "⚠ ImageMagick not found. Creating SVG template for ${size}x${size}"
    # Create SVG template as fallback
    sed "s/width=\"512\" height=\"512\"/width=\"${size}\" height=\"${size}\"/g" "$ICONS_DIR/source-icon.svg" > "${output}.svg"
  fi
}

echo "🎨 Generating PocketCloud PWA icons..."

# Create all required icon sizes
sizes=(16 32 48 72 96 128 144 152 192 384 512)

for size in "${sizes[@]}"; do
  create_png "$size"
done

# Create upload shortcut icon
cat > "$ICONS_DIR/upload-96.svg" << 'EOF'
<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <rect width="96" height="96" rx="16" fill="#10b981"/>
  <g transform="translate(48,48)">
    <!-- Upload arrow -->
    <path d="M0-20 L-8-8 L-4-8 L-4,12 L4,12 L4-8 L8-8 Z" fill="white"/>
    <!-- Base line -->
    <rect x="-12" y="16" width="24" height="4" rx="2" fill="white" opacity="0.8"/>
  </g>
</svg>
EOF

# Create recent files shortcut icon
cat > "$ICONS_DIR/recent-96.svg" << 'EOF'
<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <rect width="96" height="96" rx="16" fill="#f59e0b"/>
  <g transform="translate(48,48)">
    <!-- Clock circle -->
    <circle r="18" fill="white"/>
    <circle r="16" fill="none" stroke="#f59e0b" stroke-width="2"/>
    <!-- Clock hands -->
    <path d="M0,0 L0,-10" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
    <path d="M0,0 L6,0" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
    <!-- Center dot -->
    <circle r="2" fill="#f59e0b"/>
  </g>
</svg>
EOF

# Convert shortcut icons to PNG if ImageMagick is available
if command -v magick >/dev/null 2>&1 || command -v convert >/dev/null 2>&1; then
  create_png_from_svg() {
    local svg_file=$1
    local png_file=$2
    
    if command -v magick >/dev/null 2>&1; then
      magick "$svg_file" "$png_file"
    else
      convert "$svg_file" "$png_file"
    fi
  }
  
  create_png_from_svg "$ICONS_DIR/upload-96.svg" "$ICONS_DIR/upload-96.png"
  create_png_from_svg "$ICONS_DIR/recent-96.svg" "$ICONS_DIR/recent-96.png"
  echo "✓ Created shortcut icons"
fi

# Create favicon (16x16 and 32x32)
if command -v magick >/dev/null 2>&1; then
  magick "$ICONS_DIR/source-icon.svg" -resize "32x32" "$ICONS_DIR/favicon-32x32.png"
  magick "$ICONS_DIR/source-icon.svg" -resize "16x16" "$ICONS_DIR/favicon-16x16.png"
  echo "✓ Created favicon files"
elif command -v convert >/dev/null 2>&1; then
  convert "$ICONS_DIR/source-icon.svg" -resize "32x32" "$ICONS_DIR/favicon-32x32.png"
  convert "$ICONS_DIR/source-icon.svg" -resize "16x16" "$ICONS_DIR/favicon-16x16.png"
  echo "✓ Created favicon files"
fi

# Create Apple touch icon (180x180 for iOS)
if command -v magick >/dev/null 2>&1 || command -v convert >/dev/null 2>&1; then
  create_png 180
  cp "$ICONS_DIR/icon-180.png" "$ICONS_DIR/apple-touch-icon.png"
  echo "✓ Created Apple touch icon"
fi

echo ""
echo "🎉 PWA icon generation complete!"
echo ""
echo "Generated files:"
echo "  📁 $ICONS_DIR/"
echo "    📄 source-icon.svg (source file)"
echo "    🖼️  icon-*.png (${#sizes[@]} sizes: ${sizes[*]})"
echo "    🔗 upload-96.png, recent-96.png (shortcuts)"
echo "    🍎 apple-touch-icon.png (iOS)"
echo "    🌐 favicon-*.png (browser)"
echo ""

if ! command -v magick >/dev/null 2>&1 && ! command -v convert >/dev/null 2>&1; then
  echo "⚠️  ImageMagick not detected. Install it for automatic PNG generation:"
  echo "   macOS: brew install imagemagick"
  echo "   Ubuntu: sudo apt install imagemagick"
  echo "   Windows: Download from https://imagemagick.org/"
  echo ""
  echo "   Or use online converters to convert the SVG files to PNG"
fi

echo "✅ Icons are ready for PWA deployment!"