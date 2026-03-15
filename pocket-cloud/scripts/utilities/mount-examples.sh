#!/bin/bash

# WebDAV Mount Examples for PocketCloud Drive
# 
# This script provides examples for mounting PocketCloud as a network drive
# on different operating systems using built-in WebDAV clients

echo "🔗 PocketCloud WebDAV Mount Examples"
echo "===================================="
echo ""

# Detect current OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    CYGWIN*)    MACHINE=Cygwin;;
    MINGW*)     MACHINE=MinGw;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "Detected OS: $MACHINE"
echo ""

# Common variables
POCKETCLOUD_IP="${POCKETCLOUD_IP:-192.168.4.1}"
POCKETCLOUD_HOST="${POCKETCLOUD_HOST:-pocketcloud.local}"
USERNAME="${POCKETCLOUD_USER:-admin}"

echo "📋 Connection Details:"
echo "   IP Address: $POCKETCLOUD_IP"
echo "   Hostname: $POCKETCLOUD_HOST"
echo "   Username: $USERNAME"
echo "   WebDAV URL: http://$POCKETCLOUD_HOST/webdav"
echo ""

# macOS Examples
if [[ "$MACHINE" == "Mac" ]]; then
    echo "🍎 macOS Mounting Options:"
    echo "========================="
    echo ""
    
    echo "Option 1: Finder GUI"
    echo "   1. Open Finder"
    echo "   2. Press Cmd+K (or Go → Connect to Server)"
    echo "   3. Enter: http://$POCKETCLOUD_HOST/webdav"
    echo "   4. Click Connect"
    echo "   5. Enter username and password when prompted"
    echo ""
    
    echo "Option 2: Command Line (osascript)"
    echo "   Run this command:"
    echo "   osascript -e 'mount volume \"http://$POCKETCLOUD_HOST/webdav\"'"
    echo ""
    
    echo "Option 3: Open URL directly"
    echo "   Run this command:"
    echo "   open \"http://$POCKETCLOUD_HOST/webdav\""
    echo ""
    
    # Auto-mount if requested
    if [[ "$1" == "--mount" ]]; then
        echo "🔄 Attempting to mount WebDAV volume..."
        osascript -e "mount volume \"http://$POCKETCLOUD_HOST/webdav\"" 2>/dev/null
        if [[ $? -eq 0 ]]; then
            echo "✅ WebDAV volume mounted successfully!"
            echo "   Check Finder sidebar for 'PocketCloud Drive'"
        else
            echo "❌ Failed to mount. Please check connection and credentials."
        fi
    fi
fi

# Linux Examples
if [[ "$MACHINE" == "Linux" ]]; then
    echo "🐧 Linux Mounting Options:"
    echo "========================="
    echo ""
    
    # Check if davfs2 is installed
    if command -v mount.davfs &> /dev/null; then
        echo "✅ davfs2 is installed"
    else
        echo "❌ davfs2 not found. Install with:"
        echo "   Ubuntu/Debian: sudo apt install davfs2"
        echo "   CentOS/RHEL:   sudo yum install davfs2"
        echo "   Arch Linux:    sudo pacman -S davfs2"
        echo ""
    fi
    
    echo "Option 1: Temporary Mount"
    echo "   sudo mkdir -p /mnt/pocketcloud"
    echo "   sudo mount -t davfs http://$POCKETCLOUD_IP/webdav /mnt/pocketcloud"
    echo "   # Enter username and password when prompted"
    echo ""
    
    echo "Option 2: Permanent Mount (add to /etc/fstab)"
    echo "   echo 'http://$POCKETCLOUD_IP/webdav /mnt/pocketcloud davfs user,rw,noauto 0 0' | sudo tee -a /etc/fstab"
    echo "   # Create credentials file:"
    echo "   echo 'http://$POCKETCLOUD_IP/webdav $USERNAME your_password' >> ~/.davfs2/secrets"
    echo "   chmod 600 ~/.davfs2/secrets"
    echo "   # Then mount with:"
    echo "   mount /mnt/pocketcloud"
    echo ""
    
    echo "Option 3: Nautilus (GNOME Files)"
    echo "   1. Open Files (Nautilus)"
    echo "   2. Click 'Other Locations' in sidebar"
    echo "   3. Enter in 'Connect to Server': dav://$POCKETCLOUD_HOST/webdav"
    echo "   4. Enter credentials when prompted"
    echo ""
    
    # Auto-mount if requested and davfs2 is available
    if [[ "$1" == "--mount" ]] && command -v mount.davfs &> /dev/null; then
        echo "🔄 Attempting to mount WebDAV volume..."
        sudo mkdir -p /mnt/pocketcloud 2>/dev/null
        
        # Try to mount (will prompt for password)
        echo "Please enter your sudo password to create mount point:"
        if sudo mount -t davfs "http://$POCKETCLOUD_IP/webdav" /mnt/pocketcloud; then
            echo "✅ WebDAV volume mounted at /mnt/pocketcloud"
        else
            echo "❌ Failed to mount. Please check connection and credentials."
        fi
    fi
fi

# Windows Examples (when running in WSL or Git Bash)
echo "🪟 Windows Mounting Options:"
echo "==========================="
echo ""

echo "Option 1: File Explorer GUI"
echo "   1. Open File Explorer"
echo "   2. Right-click 'This PC' → 'Map network drive'"
echo "   3. Choose drive letter (e.g., P:)"
echo "   4. Enter folder: \\\\$POCKETCLOUD_IP\\webdav"
echo "   5. Check 'Connect using different credentials'"
echo "   6. Click Finish and enter username/password"
echo ""

echo "Option 2: Command Prompt (as Administrator)"
echo "   net use P: http://$POCKETCLOUD_IP/webdav /user:$USERNAME"
echo "   # Enter password when prompted"
echo ""

echo "Option 3: PowerShell (as Administrator)"
echo "   New-PSDrive -Name 'P' -PSProvider FileSystem -Root '\\\\$POCKETCLOUD_IP\\webdav' -Credential (Get-Credential)"
echo ""

echo "Note: Windows WebDAV client can be picky. If it doesn't work:"
echo "   - Try using IP address instead of hostname"
echo "   - Enable 'Basic Authentication' in Windows WebDAV client"
echo "   - Run: reg add HKLM\\SYSTEM\\CurrentControlSet\\Services\\WebClient\\Parameters /v BasicAuthLevel /t REG_DWORD /d 2"
echo ""

# Mobile Examples
echo "📱 Mobile Device Options:"
echo "========================"
echo ""

echo "iOS (Files app):"
echo "   1. Open Files app"
echo "   2. Tap 'Browse' → '...' → 'Connect to Server'"
echo "   3. Enter: http://$POCKETCLOUD_IP/webdav"
echo "   4. Enter username and password"
echo ""

echo "Android (WebDAV clients):"
echo "   - Solid Explorer: Add 'Cloud Storage' → WebDAV"
echo "   - FX File Manager: Add 'Network' → WebDAV"
echo "   - Total Commander: Add 'Network' → WebDAV"
echo "   Server: http://$POCKETCLOUD_IP/webdav"
echo ""

# Testing section
echo "🧪 Testing WebDAV Connection:"
echo "============================="
echo ""

echo "Test with curl:"
echo "   curl -u $USERNAME:password http://$POCKETCLOUD_IP/webdav/"
echo ""

echo "Test with wget:"
echo "   wget --user=$USERNAME --password=password http://$POCKETCLOUD_IP/webdav/"
echo ""

# Troubleshooting
echo "🔧 Troubleshooting:"
echo "=================="
echo ""

echo "Common Issues:"
echo "   1. Connection refused → Check if PocketCloud is running"
echo "   2. Authentication failed → Verify username/password"
echo "   3. Permission denied → Check user permissions"
echo "   4. Slow performance → Check network connection"
echo ""

echo "Debug WebDAV server:"
echo "   # Check if WebDAV is responding"
echo "   curl -I http://$POCKETCLOUD_IP/webdav/"
echo ""
echo "   # Check WebDAV capabilities"
echo "   curl -X OPTIONS http://$POCKETCLOUD_IP/webdav/"
echo ""

# Environment variables help
echo "💡 Environment Variables:"
echo "========================"
echo ""
echo "Customize connection details:"
echo "   export POCKETCLOUD_IP=192.168.1.100"
echo "   export POCKETCLOUD_HOST=mypocketcloud.local"
echo "   export POCKETCLOUD_USER=myusername"
echo "   $0"
echo ""

echo "Usage: $0 [--mount]"
echo "   --mount: Attempt to automatically mount (macOS/Linux only)"
echo ""

echo "📚 More Information:"
echo "   - WebDAV RFC: https://tools.ietf.org/html/rfc4918"
echo "   - PocketCloud Docs: Check your PocketCloud web interface"
echo ""