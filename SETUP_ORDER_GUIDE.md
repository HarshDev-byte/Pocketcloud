# 🚀 PocketCloud Setup Guide

Simple, clean setup for PocketCloud on Raspberry Pi 4B with USB storage.

## 📋 Prerequisites

**Hardware Required:**
- Raspberry Pi 4B (4GB RAM minimum)
- 32GB+ microSD card (Class 10 or A2 rated)
- 50GB+ USB 3.0 drive (SSD recommended for best performance)
- Power supply (5V 3A USB-C)
- Ethernet cable (for initial setup)

**Software Required:**
- Fresh Raspberry Pi OS Lite (64-bit) installed
- SSH access to the Pi
- Internet connection

---

## 🎯 Method 1: Complete Automated Setup (Recommended)

**One command does everything - perfect for beginners:**

### Step 1: Connect to Your Pi
```bash
ssh pi@[PI_IP_ADDRESS]
# Example: ssh pi@192.168.1.100
```

### Step 2: Run Complete Setup
```bash
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/setup-raspberry-pi.sh | sudo bash
```

**This single command will:**
1. ✅ Update your Pi system
2. ✅ Set up USB storage (interactive selection)
3. ✅ Download and install PocketCloud
4. ✅ Configure WiFi hotspot
5. ✅ Set up web interface
6. ✅ Configure automatic startup

**Total time: 15-20 minutes**

---

## 🔧 Method 2: Step-by-Step Setup

**For users who want control over each step:**

### Step 1: Connect to Your Pi
```bash
ssh pi@[PI_IP_ADDRESS]
```

### Step 2: Set Up USB Storage (FIRST)
```bash
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/setup-usb-storage.sh | sudo bash
```

**What this does:**
- Detects all USB drives
- Interactive drive selection
- Safe formatting with confirmation
- Creates mount point at `/mnt/pocketcloud`
- Sets up automatic mounting on boot
- Creates directory structure

### Step 3: Install PocketCloud (SECOND)
```bash
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/install-pocketcloud.sh | sudo bash
```

**What this does:**
- Downloads PocketCloud from GitHub
- Installs Node.js dependencies
- Builds frontend application
- Sets up WiFi hotspot
- Configures web interface
- Sets up automatic startup

**Total time: 15-20 minutes**

---

## 📱 After Setup is Complete

### Step 1: Connect to PocketCloud WiFi
1. Look for WiFi network: `PocketCloud-XXXX`
2. Default password: `pocketcloud123`
3. Connect from any device

### Step 2: Access Web Interface
Open browser and go to:
- **Main interface**: http://192.168.4.1

### Step 3: Complete Setup Wizard
The web interface will guide you through initial configuration.

---

## 🚨 Troubleshooting

### Common Issues

**"No USB drives detected":**
- Ensure USB drive is connected to USB 3.0 port (blue)
- Try a different USB cable
- Some drives need external power

**Input not working when typing 'y':**
- Scripts now handle piped input correctly
- Make sure you're using the latest version from GitHub

**"Cannot connect to WiFi":**
- Wait 3-5 minutes after setup completes
- Try restarting the Pi: `sudo reboot`
- Check if WiFi LED is active

**Web interface won't load:**
- Ensure you're connected to PocketCloud WiFi (not your home WiFi)
- Try http://192.168.4.1 (not https)
- Clear browser cache

### Check System Status

**Check if services are running:**
```bash
sudo systemctl status pocketcloud
sudo systemctl status hostapd
sudo systemctl status dnsmasq
```

**Check USB storage:**
```bash
df -h /mnt/pocketcloud
```

**Check logs:**
```bash
tail -f /var/log/pocketcloud-install.log
```

---

## 📊 What Each Script Does

### `setup-raspberry-pi.sh` (Complete Setup)
- ✅ System updates and dependency installation
- ✅ Hardware compatibility checks
- ✅ Calls USB storage setup automatically
- ✅ Calls PocketCloud installation automatically
- ✅ Complete end-to-end setup

### `setup-usb-storage.sh` (USB Storage Only)
- ✅ Interactive USB drive detection and selection
- ✅ Safe formatting with user confirmation
- ✅ Optimal ext4 filesystem setup
- ✅ Automatic mounting configuration at `/mnt/pocketcloud`
- ✅ Directory structure creation
- ✅ Proper permissions setup

### `install-pocketcloud.sh` (PocketCloud Only)
- ✅ PocketCloud download and build
- ✅ Node.js dependency installation
- ✅ WiFi hotspot configuration
- ✅ Web interface setup
- ✅ Systemd service configuration
- ✅ Nginx reverse proxy setup

---

## 🎯 Recommended Approach

**For most users, use Method 1 (Complete Automated Setup):**

```bash
# SSH into your Pi
ssh pi@[PI_IP_ADDRESS]

# Run complete setup (one command does everything)
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/setup-raspberry-pi.sh | sudo bash

# Wait for completion and reboot
# Connect to PocketCloud-XXXX WiFi
# Visit http://192.168.4.1
```

This is the simplest and most reliable method that handles everything automatically.

---

## 📞 Getting Help

If you encounter issues:

1. **Check logs:**
   ```bash
   tail -f /var/log/pocketcloud-install.log
   sudo journalctl -u pocketcloud -f
   ```

2. **Get support:**
   - GitHub Issues: https://github.com/HarshDev-byte/Pocketcloud/issues

---

*This guide covers PocketCloud v2.0.0 setup on Raspberry Pi 4B. Scripts are clean, focused, and handle input properly when run via curl.*