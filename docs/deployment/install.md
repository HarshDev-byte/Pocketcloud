# PocketCloud Drive Installation Guide

Transform your Raspberry Pi into a personal cloud server in minutes! Choose from two installation methods:

## 🎯 Method 1: Pre-built Image (Recommended)

**Perfect for beginners** - Flash one image and everything works on first boot.

### What You Need

| Component | Specification | Price | Where to Buy |
|-----------|---------------|-------|--------------|
| **Raspberry Pi 4B (4GB)** | ARM Cortex-A72, 4GB RAM | ~$55 | [Amazon ↗](https://amazon.com/dp/B07TC2BK1X) |
| **32GB microSD Card** | Class 10/A1 minimum, **A2 recommended** | ~$10 | [Amazon ↗](https://amazon.com/dp/B073K14CVB) |
| **1TB USB 3.0 Drive** | For file storage | ~$55 | [Amazon ↗](https://amazon.com/dp/B07VXKF1L4) |
| **20,000mAh USB-C Power Bank** | For portable operation | ~$35 | [Amazon ↗](https://amazon.com/dp/B08LH26PFT) |
| **Ventilated Case** | Keeps Pi cool | ~$12 | [Amazon ↗](https://amazon.com/dp/B07VD6LHS1) |
| | | **Total: ~$167** | |

> **⚠️ microSD Card Speed Matters!**  
> - **Minimum**: Class 10 or A1 rating
> - **Recommended**: A2 rating for best performance
> - **Avoid**: Generic/unbranded cards (high failure rate)

### Step-by-Step Installation

#### Step 1: Download PocketCloud Image

1. Go to [GitHub Releases](https://github.com/pocketcloud/pocketcloud/releases/latest)
2. Download `PocketCloud-v1.x.x.img.xz` (latest version)
3. Download `SHA256SUMS.txt` for verification

#### Step 2: Verify Download (Optional but Recommended)

**On macOS/Linux:**
```bash
# Check if download is complete and uncorrupted
shasum -a 256 -c SHA256SUMS.txt
```

**On Windows:**
```powershell
# In PowerShell
Get-FileHash PocketCloud-v1.x.x.img.xz -Algorithm SHA256
# Compare with value in SHA256SUMS.txt
```

#### Step 3: Flash to microSD Card

1. **Download Balena Etcher** (free, works on all operating systems)
   - Visit: https://www.balena.io/etcher/
   - Download and install for your OS

2. **Flash the Image**
   - Insert your 32GB+ microSD card
   - Open Balena Etcher
   - Click "Flash from file" → select `PocketCloud-v1.x.x.img.xz`
   - Click "Select target" → choose your microSD card
   - Click "Flash!" and wait (~10 minutes)

   ![Etcher Screenshot](docs/images/etcher-screenshot.png)

3. **Safely Eject** the microSD card when complete

#### Step 4: First Boot Setup

1. **Insert Hardware**
   - Insert flashed microSD card into Pi
   - Connect USB drive for storage
   - Connect power (USB-C cable or power bank)

2. **Wait for Boot** (~2 minutes)
   - Pi will boot and configure itself automatically
   - LED will pulse green when ready
   - OLED display (if connected) shows "Ready"

3. **Connect to WiFi**
   - Look for WiFi network: `PocketCloud-XXXX` (XXXX = last 4 of MAC)
   - Password: `pocketcloud123` (default, you'll change this)

4. **Open Web Interface**
   - Open browser and go to: http://192.168.4.1
   - Complete the setup wizard:
     - Set admin password
     - Configure WiFi password
     - Set up storage preferences
     - Create first user account

#### Step 5: You're Done! 🎉

Your PocketCloud is now ready! You can:
- Upload files via web interface
- Mount as network drive (WebDAV)
- Install desktop/mobile apps
- Stream videos and music
- Share files with others

---

## 🛠️ Method 2: Install on Existing Pi OS

**For advanced users** who want to install on an existing Raspberry Pi OS setup.

### Prerequisites

- Raspberry Pi 4 or 5 with 2GB+ RAM
- Fresh Raspberry Pi OS Lite or Desktop installation
- Internet connection during installation
- 8GB+ free disk space

### One-Command Installation

```bash
curl -fsSL https://pocketcloud.sh/install.sh | sudo bash
```

**Or download and run locally:**
```bash
wget https://pocketcloud.sh/install.sh
sudo bash install.sh
```

### What the Installer Does

The installer will:
1. ✅ Check hardware compatibility (Pi 4/5, 2GB+ RAM)
2. ✅ Install dependencies (Node.js, nginx, hostapd, etc.)
3. ✅ Download and build PocketCloud
4. ✅ Configure WiFi hotspot
5. ✅ Set up storage and database
6. ✅ Start all services
7. ✅ Generate unique WiFi credentials
8. ✅ Reboot into PocketCloud mode

**Installation takes 5-10 minutes** depending on your Pi model and internet speed.

### Manual Installation Steps

If you prefer manual control, run each setup script individually:

```bash
# Clone repository
git clone https://github.com/pocketcloud/pocketcloud.git
cd pocketcloud

# Run setup scripts in order
sudo bash scripts/setup-network.sh    # WiFi hotspot
sudo bash scripts/setup-node.sh       # Node.js runtime
sudo bash scripts/setup-storage.sh    # Storage configuration
sudo bash scripts/setup-app.sh        # PocketCloud application
sudo bash scripts/setup-services.sh   # System services
sudo bash scripts/optimize-pi.sh      # Performance optimization
```

---

## 📱 Installing Client Apps

### Desktop Apps

**macOS:**
```bash
# Download from GitHub releases or use Homebrew
brew install --cask pocketcloud
```

**Windows:**
- Download `PocketCloud-v1.x.x-win-x64.exe` from releases
- Run installer and follow prompts

**Linux:**
```bash
# Download and extract
wget https://github.com/pocketcloud/pocketcloud/releases/latest/download/PocketCloud-v1.x.x-linux-x64.tar.gz
tar -xzf PocketCloud-v1.x.x-linux-x64.tar.gz
cd PocketCloud-linux-x64
./pocketcloud
```

### Command Line Interface

**Install CLI globally:**
```bash
curl -fsSL https://pocketcloud.sh/install-cli.sh | bash
```

**Or download binary directly:**
- Linux: `pcd-v1.x.x-linux-x64`
- macOS: `pcd-v1.x.x-mac-arm64` (Apple Silicon) or `pcd-v1.x.x-mac-x64` (Intel)
- Windows: `pcd-v1.x.x-win-x64.exe`

### Mobile Apps (PWA)

1. Open http://192.168.4.1 in mobile browser
2. Tap "Add to Home Screen" when prompted
3. PocketCloud will install as a native-like app

---

## 🔧 Troubleshooting

### Common Issues

**Pi won't boot after flashing:**
- Verify image integrity with SHA256 checksum
- Try a different microSD card (A2 rated recommended)
- Ensure power supply provides 3A+ for Pi 4

**Can't connect to PocketCloud WiFi:**
- Wait 3-5 minutes after first boot
- Check if LED is pulsing green (ready state)
- Try forgetting and reconnecting to WiFi
- Default password is `pocketcloud123`

**Web interface won't load:**
- Ensure you're connected to PocketCloud WiFi
- Try http://192.168.4.1 (not https)
- Clear browser cache and cookies
- Try a different browser or device

**USB drive not detected:**
- Use USB 3.0 drive for best performance
- Try different USB port on Pi
- Check if drive is formatted (ext4 preferred)
- Some drives need external power

### Getting Help

- **Documentation**: https://pocketcloud.github.io/pocketcloud/
- **Issues**: https://github.com/pocketcloud/pocketcloud/issues
- **Discussions**: https://github.com/pocketcloud/pocketcloud/discussions
- **Discord**: https://discord.gg/pocketcloud

### Log Files

Check these logs for troubleshooting:
```bash
# Installation logs
sudo tail -f /var/log/pocketcloud-install.log

# Application logs
sudo journalctl -u pocketcloud-backend -f
sudo journalctl -u pocketcloud-frontend -f

# System logs
sudo dmesg | tail -20
```

---

## 🔄 Updating PocketCloud

### Automatic Updates (Recommended)

PocketCloud checks for updates automatically and notifies you in the admin panel.

1. Go to http://192.168.4.1/admin
2. Click "System" → "Updates"
3. Click "Install Update" when available
4. Pi will reboot with new version

### Manual Updates

```bash
cd /opt/pocketcloud
sudo -u pocketcloud git pull
sudo -u pocketcloud npm install
sudo systemctl restart pocketcloud-backend
```

### Rollback Updates

If an update causes issues:
```bash
# Via web interface
http://192.168.4.1/admin → System → Updates → Rollback

# Via command line
sudo /opt/pocketcloud/scripts/rollback-update.sh
```

---

## 🔒 Security Considerations

- **Change default passwords** immediately after setup
- **Enable firewall** in admin panel for internet-connected Pis
- **Regular backups** of important data
- **Keep updated** with latest PocketCloud releases
- **Use strong WiFi passwords** (12+ characters)

---

## 📊 Performance Tips

### Optimal Hardware Configuration

- **microSD**: A2-rated cards perform 3x faster than A1
- **USB Storage**: USB 3.0 SSD > USB 3.0 HDD > USB 2.0
- **Power**: 3A+ power supply prevents throttling
- **Cooling**: Active cooling allows sustained performance

### Performance Monitoring

Check performance in admin panel:
- http://192.168.4.1/admin → System → Performance
- Monitor CPU temperature, memory usage, disk I/O
- Enable performance mode for maximum speed

---

*Last updated: March 2026 | PocketCloud Drive v1.0.0*