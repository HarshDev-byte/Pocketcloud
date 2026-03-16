# 🚀 PocketCloud Setup Order Guide

Complete step-by-step instructions for setting up PocketCloud on Raspberry Pi 4B with 1TB USB storage.

## 📋 Prerequisites

**Hardware Required:**
- Raspberry Pi 4B (4GB RAM minimum)
- 32GB+ microSD card (A2 rated recommended)
- 1TB+ USB 3.0 drive (SSD preferred)
- Power supply (5V 3A USB-C)
- Ethernet cable (for initial setup)

**Software Required:**
- Fresh Raspberry Pi OS Lite (64-bit) installed
- SSH access to the Pi
- Internet connection

---

## 🎯 Method 1: Complete Automated Setup (Recommended)

**For beginners - Everything in one command:**

### Step 1: Connect to Your Pi
```bash
# SSH into your Raspberry Pi
ssh pi@[PI_IP_ADDRESS]
# Example: ssh pi@192.168.1.100
```

### Step 2: Run Complete Setup
```bash
# One command to set up everything
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/setup-raspberry-pi.sh | sudo bash
```

**This single script will:**
1. Update your Pi system
2. Download PocketCloud
3. Set up USB storage automatically
4. Install and configure PocketCloud
5. Set up WiFi hotspot
6. Optimize performance

**Total time: 15-20 minutes**

---

## 🔧 Method 2: Step-by-Step Manual Setup

**For advanced users who want control over each step:**

### Step 1: Connect to Your Pi
```bash
ssh pi@[PI_IP_ADDRESS]
```

### Step 2: Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### Step 3: Set Up USB Storage
```bash
# Download and run USB storage setup
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/setup-usb-storage.sh | sudo bash
```

**What this does:**
- Detects your USB drives
- Lets you choose which drive to use
- Formats with optimal ext4 settings
- Sets up automatic mounting
- Creates directory structure
- Configures performance optimization

### Step 4: Install PocketCloud
```bash
# Download and run PocketCloud installer
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/install.sh | sudo bash
```

**What this does:**
- Installs Node.js and dependencies
- Downloads PocketCloud from GitHub
- Builds the application
- Sets up WiFi hotspot
- Configures services
- Optimizes for Raspberry Pi

**Total time: 15-20 minutes**

---

## 🔍 Method 3: Individual Script Execution

**For developers who want maximum control:**

### Step 1: Clone Repository
```bash
git clone https://github.com/HarshDev-byte/Pocketcloud.git
cd Pocketcloud
```

### Step 2: Run Individual Setup Scripts
```bash
# 1. Set up USB storage
sudo bash scripts/setup-usb-storage.sh

# 2. Set up network (WiFi hotspot)
sudo bash pocket-cloud/scripts/setup/setup-network.sh

# 3. Install Node.js
sudo bash pocket-cloud/scripts/setup/setup-node.sh

# 4. Set up application
bash pocket-cloud/scripts/setup/setup-app.sh

# 5. Configure services
sudo bash pocket-cloud/scripts/setup/install-services-new.sh

# 6. Optimize performance
sudo bash pocket-cloud/scripts/optimization/optimize-pi.sh
```

---

## 📱 After Setup is Complete

### Step 1: Connect to PocketCloud WiFi
1. Look for WiFi network: `PocketCloud-XXXX`
2. Default password: `pocketcloud123`
3. Connect from any device

### Step 2: Access Web Interface
Open browser and go to:
- **Main interface**: http://192.168.4.1
- **Admin panel**: http://192.168.4.1/admin

### Step 3: Complete Setup Wizard
The web interface will guide you through:
1. Creating admin account
2. Configuring WiFi settings
3. Setting up users
4. Configuring storage options

---

## 🚨 Troubleshooting

### If Setup Fails

**Check system requirements:**
```bash
# Check Pi model
cat /proc/cpuinfo | grep "Raspberry Pi"

# Check RAM
free -h

# Check disk space
df -h
```

**Check USB drive:**
```bash
# List USB devices
lsusb

# List storage devices
lsblk
```

**Check internet connection:**
```bash
ping -c 3 google.com
```

### Common Issues

**"Permission denied" errors:**
- Make sure you're using `sudo` for setup scripts
- Check that you're running as the `pi` user

**"No USB drives detected":**
- Ensure USB drive is connected to USB 3.0 port (blue)
- Try a different USB cable
- Some drives need external power

**"Cannot connect to WiFi":**
- Wait 3-5 minutes after setup completes
- Check if LED is pulsing green (ready state)
- Try restarting the Pi: `sudo reboot`

**Web interface won't load:**
- Ensure you're connected to PocketCloud WiFi (not your home WiFi)
- Try http://192.168.4.1 (not https)
- Clear browser cache

---

## 📊 What Each Script Does

### `setup-raspberry-pi.sh` (Complete Setup)
- ✅ System updates and preparation
- ✅ USB storage detection and setup
- ✅ PocketCloud installation
- ✅ WiFi hotspot configuration
- ✅ Performance optimization
- ✅ Service configuration

### `setup-usb-storage.sh` (USB Storage Only)
- ✅ Interactive USB drive detection
- ✅ Safe formatting with confirmation
- ✅ Optimal ext4 filesystem setup
- ✅ Automatic mounting configuration
- ✅ Performance optimization
- ✅ Health monitoring setup
- ✅ Maintenance tools installation

### `install.sh` (PocketCloud Only)
- ✅ Dependency installation
- ✅ Node.js setup
- ✅ PocketCloud download and build
- ✅ WiFi hotspot configuration
- ✅ Service setup and startup
- ✅ Health checks

---

## 🎯 Recommended Approach

**For most users, use Method 1 (Complete Automated Setup):**

```bash
# SSH into your Pi
ssh pi@[PI_IP_ADDRESS]

# Run complete setup
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/setup-raspberry-pi.sh | sudo bash

# Wait for completion and reboot
# Connect to PocketCloud-XXXX WiFi
# Visit http://192.168.4.1
```

This is the simplest and most reliable method that handles everything automatically with proper error checking and optimization.

---

## 📞 Getting Help

If you encounter issues:

1. **Check logs:**
   ```bash
   tail -f /var/log/pocketcloud-install.log
   sudo journalctl -u pocketcloud-backend -f
   ```

2. **Run health check:**
   ```bash
   sudo /opt/pocketcloud/pocket-cloud/scripts/monitoring/health-check.sh
   ```

3. **Get support:**
   - GitHub Issues: https://github.com/HarshDev-byte/Pocketcloud/issues
   - GitHub Discussions: https://github.com/HarshDev-byte/Pocketcloud/discussions

---

*This guide covers PocketCloud v1.0.0 setup on Raspberry Pi 4B. For the latest updates, visit the [GitHub repository](https://github.com/HarshDev-byte/Pocketcloud).*