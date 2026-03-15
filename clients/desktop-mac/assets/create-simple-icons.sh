#!/bin/bash

# Create simple tray icons for PocketCloud macOS app using ASCII art
# These are 16x16 PNG files for the menu bar

echo "Creating simple tray icons..."

# Create a simple cloud icon using Python PIL (if available)
python3 << 'EOF'
try:
    from PIL import Image, ImageDraw
    import os
    
    # Create 16x16 base cloud icon (black on transparent)
    def create_cloud_icon():
        img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # Draw simple cloud shape
        draw.ellipse([2, 8, 10, 14], fill=(0, 0, 0, 255))  # Main cloud body
        draw.ellipse([1, 6, 7, 12], fill=(0, 0, 0, 255))   # Left puff
        draw.ellipse([7, 6, 13, 12], fill=(0, 0, 0, 255))  # Right puff
        draw.ellipse([4, 4, 10, 10], fill=(0, 0, 0, 255))  # Top puff
        
        return img
    
    # Base icon
    base = create_cloud_icon()
    base.save('tray-icon.png')
    
    # Active icon (with green dot)
    active = base.copy()
    draw = ImageDraw.Draw(active)
    draw.ellipse([11, 2, 15, 6], fill=(52, 199, 89, 255))  # Green dot
    active.save('tray-icon-active.png')
    
    # Upload icon (with up arrow)
    upload = base.copy()
    draw = ImageDraw.Draw(upload)
    # Up arrow
    draw.polygon([(8, 2), (6, 6), (10, 6)], fill=(0, 0, 0, 255))
    draw.rectangle([7, 6, 9, 10], fill=(0, 0, 0, 255))
    upload.save('tray-icon-upload.png')
    
    print("✅ Tray icons created successfully with Python PIL!")
    
except ImportError:
    print("❌ Python PIL not available, creating placeholder files...")
    # Create empty files as placeholders
    open('tray-icon.png', 'a').close()
    open('tray-icon-active.png', 'a').close()
    open('tray-icon-upload.png', 'a').close()
    print("📝 Placeholder files created. Install PIL: pip3 install Pillow")

EOF

echo "Icon files created:"
ls -la *.png