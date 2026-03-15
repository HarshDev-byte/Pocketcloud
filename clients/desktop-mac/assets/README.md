# PocketCloud macOS App Assets

This directory contains the assets needed for the macOS menu bar application.

## Required Assets

### Tray Icons (16x16 pixels, monochrome template images)
- `tray-icon.png` - Default disconnected state (monochrome template)
- `tray-icon-active.png` - Connected state with green dot
- `tray-icon-upload.png` - Upload activity indicator

### App Icons
- `app-icon.icns` - Main application icon (512x512 with multiple sizes)

### DMG Installer Assets
- `dmg-background.png` - Background image for DMG installer

## Creating Tray Icons

Tray icons should be:
- 16x16 pixels at 1x resolution
- 32x32 pixels at 2x resolution (@2x suffix)
- Black and white template images
- Use alpha channel for transparency
- Follow Apple's template image guidelines

Example using ImageMagick to create template icons:

```bash
# Create base 16x16 cloud icon
convert -size 16x16 xc:transparent -fill black -draw "circle 8,8 8,12" tray-icon.png

# Create active version with green dot
convert tray-icon.png -fill "#34c759" -draw "circle 12,4 12,6" tray-icon-active.png

# Create upload version with animation indicator
convert tray-icon.png -fill black -draw "polygon 6,10 8,6 10,10" tray-icon-upload.png
```

## App Icon

Create app-icon.icns using iconutil:

```bash
# Create iconset directory
mkdir app-icon.iconset

# Add different sizes (16, 32, 64, 128, 256, 512, 1024)
# Then convert to icns
iconutil -c icns app-icon.iconset
```

## Note

Currently using placeholder documentation. Actual icon files need to be created by a designer or using the commands above.