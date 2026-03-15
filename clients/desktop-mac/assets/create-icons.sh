#!/bin/bash

# Create placeholder tray icons for PocketCloud macOS app
# These are simple 16x16 PNG files for development

# Create a simple cloud icon using ImageMagick (if available)
if command -v convert &> /dev/null; then
    echo "Creating tray icons with ImageMagick..."
    
    # Base cloud icon (16x16, black on transparent)
    convert -size 16x16 xc:transparent \
        -fill black \
        -draw "ellipse 8,10 6,3 0,360" \
        -draw "ellipse 5,8 3,2 0,360" \
        -draw "ellipse 11,8 3,2 0,360" \
        -draw "ellipse 8,6 2,1 0,360" \
        tray-icon.png
    
    # Active icon (with green dot)
    convert tray-icon.png \
        -fill "#34c759" \
        -draw "circle 13,3 13,5" \
        tray-icon-active.png
    
    # Upload icon (with up arrow)
    convert tray-icon.png \
        -fill black \
        -draw "polygon 8,2 6,6 10,6" \
        -draw "rectangle 7,6 9,12" \
        tray-icon-upload.png
    
    echo "Tray icons created successfully!"
    
else
    echo "ImageMagick not found. Creating placeholder files..."
    
    # Create empty PNG files as placeholders
    # In a real app, these would be proper 16x16 template images
    touch tray-icon.png
    touch tray-icon-active.png  
    touch tray-icon-upload.png
    
    echo "Placeholder icon files created. Replace with actual 16x16 PNG icons."
fi

echo "Icon files:"
ls -la *.png