# 🥧 Complete Raspberry Pi Setup Guide for PocketCloud

## Table of Contents
1. [Hardware Requirements](#hardware-requirements)
2. [Shopping List](#shopping-list)
3. [Initial Pi Setup](#initial-pi-setup)
4. [System Configuration](#system-configuration)
5. [USB Storage Setup](#usb-storage-setup)
6. [PocketCloud Installation](#pocketcloud-installation)
7. [Network Configuration](#network-configuration)
8. [Security Setup](#security-setup)
9. [Testing & Verification](#testing--verification)
10. [Troubleshooting](#troubleshooting)

---

## Hardware Requirements

### Essential Components
- **Raspberry Pi 4 Model B** (4GB RAM minimum, 8GB recommended)
- **MicroSD Card** (32GB minimum, 64GB+ recommended, Class 10 or better)
- **USB Storage Device** (32GB minimum, 128GB+ recommended)
- **Official Raspberry Pi Power Supply** (5V 3A USB-C)
- **Ethernet Cable** (for initial setup, optional for operation)
- **HDMI Cable** (for initial setup only)
- **USB Keyboard** (for initial setup only)
- **Monitor/TV with HDMI** (for initial setup only)

### Recommended Upgrades
- **USB 3.0 SSD** instead of flash drive (much faster and more reliable)
- **USB 3.0 to SATA adapter** if using SSD
- **Raspberry Pi Case** with cooling fan
- **Heat Sinks** for CPU and RAM chips

---

## Shopping List

### Budget Option (~$120)
- Raspberry Pi 4 Model B 4GB: $75
- SanDisk 64GB MicroSD (Class 10): $12
- SanDisk 64GB USB 3.0 Flash Drive: $15
- Official Pi Power Supply: $8
- Basic Pi Case: $10

### Recommended Option (~$180)
- Raspberry Pi 4 Model B 8GB: $95
- SanDisk 128GB MicroSD (A1): $20
- Samsung T7 500GB USB 3.0 SSD: $45
- Official Pi Power Supply: $8
- Argon ONE V2 Case (with fan): $25

### Where to Buy
- **Official**: rpi.org/products
- **Amazon**: Search "Raspberry Pi 4 starter kit"
- **Adafruit**: adafruit.com
- **MicroCenter**: microcenter.com (in-store deals)

---
## Initial Pi Setup

### Step 1: Prepare the MicroSD Card

#### Option A: Using Raspberry Pi Imager (Recommended)
1. **Download Raspberry Pi Imager**
   - Go to: https://www.raspberrypi.org/software/
   - Download for your OS (Windows/Mac/Linux)
   - Install and run the application

2. **Flash the OS**
   - Insert MicroSD card into your computer
   - Open Raspberry Pi Imager
   - Click "CHOOSE OS"
   - Select "Raspberry Pi OS (64-bit)" (NOT the Lite version)
   - Click "CHOOSE STORAGE" and select your MicroSD card
   - Click the gear icon (⚙️) for advanced options

3. **Configure Advanced Options**
   - ✅ Enable SSH
   - ✅ Set username: `pi`
   - ✅ Set password: (choose a strong password)
   - ✅ Configure WiFi (enter your network name and password)
   - ✅ Set locale settings (your timezone and keyboard layout)
   - Click "SAVE"

4. **Write the Image**
   - Click "WRITE"
   - Wait for the process to complete (5-10 minutes)
   - Safely eject the MicroSD card

#### Option B: Manual Setup (If you prefer command line)
1. **Download Raspberry Pi OS**
   - Go to: https://www.raspberrypi.org/software/operating-systems/
   - Download "Raspberry Pi OS with desktop" (64-bit)

2. **Flash using dd (Linux/Mac) or Win32DiskImager (Windows)**
   ```bash
   # Linux/Mac example
   sudo dd if=2023-05-03-raspios-bullseye-arm64.img of=/dev/sdX bs=4M status=progress
   ```

### Step 2: First Boot Setup

#### Physical Setup
1. **Insert the MicroSD card** into the Pi
2. **Connect HDMI cable** to monitor
3. **Connect USB keyboard**
4. **Connect Ethernet cable** (recommended for initial setup)
5. **Connect power supply** (Pi will boot automatically)

#### Initial Configuration
1. **Wait for boot** (first boot takes 2-3 minutes)
2. **Complete the setup wizard**:
   - Set country, language, timezone
   - Change password (if not done in imager)
   - Connect to WiFi (if not done in imager)
   - Update software (this takes 10-15 minutes)
   - Reboot when prompted

3. **Enable SSH** (if not done in imager):
   - Open Terminal
   - Run: `sudo systemctl enable ssh`
   - Run: `sudo systemctl start ssh`

4. **Find your Pi's IP address**:
   ```bash
   hostname -I
   ```
   - Write down this IP address (e.g., 192.168.1.100)

---

## System Configuration

### Step 3: Connect via SSH (Optional but Recommended)

From this point, you can disconnect the monitor and keyboard and work remotely:

#### From Windows:
1. **Install PuTTY** or use Windows Terminal
2. **Connect**: `ssh pi@192.168.1.100` (use your Pi's IP)
3. **Enter password** when prompted

#### From Mac/Linux:
```bash
ssh pi@192.168.1.100
```

### Step 4: Update the System

```bash
# Update package lists
sudo apt update

# Upgrade all packages (this takes 15-20 minutes)
sudo apt upgrade -y

# Install essential packages
sudo apt install -y git curl wget vim htop tree

# Reboot to ensure all updates are applied
sudo reboot
```

### Step 5: Configure System Settings

#### Expand Filesystem (usually done automatically)
```bash
sudo raspi-config
```
- Select "Advanced Options" → "Expand Filesystem"
- Finish and reboot if prompted

#### Set Memory Split (for headless operation)
```bash
sudo raspi-config
```
- Select "Advanced Options" → "Memory Split"
- Set to 16 (since we don't need GPU memory)
- Finish and reboot

#### Configure Locale and Timezone
```bash
sudo raspi-config
```
- Select "Localisation Options"
- Set timezone, locale, and keyboard layout
- Finish and reboot

---
## USB Storage Setup

### Step 6: Prepare USB Storage Device

#### Connect and Identify USB Device
1. **Connect your USB storage device** to a USB 3.0 port (blue port)
2. **Wait 10 seconds** for detection
3. **Check if detected**:
   ```bash
   lsblk
   ```
   You should see something like:
   ```
   NAME        MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
   sda           8:0    1  128G  0 disk 
   └─sda1        8:1    1  128G  0 part /media/pi/USB_DRIVE
   mmcblk0     179:0    0   64G  0 disk 
   ├─mmcblk0p1 179:1    0  256M  0 part /boot
   └─mmcblk0p2 179:2    0 63.7G  0 part /
   ```

#### Format USB Device (IMPORTANT: This erases all data!)
```bash
# Unmount if auto-mounted
sudo umount /dev/sda1 2>/dev/null || true

# Create new partition table
sudo fdisk /dev/sda
```

**In fdisk, type these commands exactly:**
```
d    # Delete existing partition (if any)
n    # Create new partition
p    # Primary partition
1    # Partition number 1
     # Press Enter (default first sector)
     # Press Enter (default last sector)
w    # Write changes and exit
```

#### Format with ext4 filesystem
```bash
# Format the partition
sudo mkfs.ext4 /dev/sda1

# Set a label
sudo e2label /dev/sda1 "POCKETCLOUD"
```

#### Create Mount Point and Configure Auto-Mount
```bash
# Create mount directory
sudo mkdir -p /mnt/pocketcloud

# Get the UUID of your USB device
sudo blkid /dev/sda1
```
You'll see output like:
```
/dev/sda1: UUID="12345678-1234-1234-1234-123456789abc" TYPE="ext4" LABEL="POCKETCLOUD"
```

**Copy the UUID (the long string in quotes)**

#### Configure Automatic Mounting
```bash
# Backup fstab
sudo cp /etc/fstab /etc/fstab.backup

# Edit fstab
sudo nano /etc/fstab
```

**Add this line at the end** (replace UUID with your actual UUID):
```
UUID=12345678-1234-1234-1234-123456789abc /mnt/pocketcloud ext4 defaults,nofail,uid=1000,gid=1000 0 2
```

**Save and exit** (Ctrl+X, then Y, then Enter)

#### Test the Mount
```bash
# Test mount
sudo mount -a

# Check if mounted
df -h | grep pocketcloud
```
You should see:
```
/dev/sda1       119G   61M  113G   1% /mnt/pocketcloud
```

#### Set Permissions
```bash
# Set ownership to pi user
sudo chown -R pi:pi /mnt/pocketcloud

# Set permissions
sudo chmod -R 755 /mnt/pocketcloud

# Test write access
echo "PocketCloud USB Storage Ready" > /mnt/pocketcloud/test.txt
cat /mnt/pocketcloud/test.txt
rm /mnt/pocketcloud/test.txt
```

---

## Node.js Installation

### Step 7: Install Node.js

#### Method 1: Using NodeSource Repository (Recommended)
```bash
# Download and run NodeSource setup script
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify installation
node --version    # Should show v20.x.x
npm --version     # Should show 10.x.x
```

#### Method 2: Using Node Version Manager (Alternative)
```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload bash profile
source ~/.bashrc

# Install latest LTS Node.js
nvm install --lts
nvm use --lts

# Verify
node --version
npm --version
```

#### Optimize npm for Raspberry Pi
```bash
# Increase npm timeout for slower Pi
npm config set timeout 300000

# Set registry to use HTTPS
npm config set registry https://registry.npmjs.org/

# Disable progress bar for cleaner output
npm config set progress false
```

---
## PocketCloud Installation

### Step 8: Download and Install PocketCloud

#### Clone the Repository
```bash
# Navigate to home directory
cd ~

# Clone PocketCloud
git clone https://github.com/HarshDev-byte/Pocketcloud.git

# Enter directory
cd Pocketcloud

# Check contents
ls -la
```

You should see:
```
drwxr-xr-x  8 pi pi  4096 Feb 11 10:00 backend
drwxr-xr-x  3 pi pi  4096 Feb 11 10:00 docs
drwxr-xr-x  3 pi pi  4096 Feb 11 10:00 frontend
-rwxr-xr-x  1 pi pi  8234 Feb 11 10:00 start-pocketcloud.sh
-rw-r--r--  1 pi pi  2156 Feb 11 10:00 package.json
-rw-r--r--  1 pi pi 15234 Feb 11 10:00 README.md
drwxr-xr-x  2 pi pi  4096 Feb 11 10:00 setup
drwxr-xr-x  2 pi pi  4096 Feb 11 10:00 tools
```

#### Run the One-Command Setup
```bash
# Make sure the script is executable
chmod +x start-pocketcloud.sh

# Run the complete setup
./start-pocketcloud.sh
```

**What this script does:**
1. ✅ Checks system requirements
2. ✅ Installs all dependencies (takes 5-10 minutes)
3. ✅ Detects first-time setup
4. ✅ Guides you through configuration
5. ✅ Creates necessary directories
6. ✅ Sets up database
7. ✅ Starts the server
8. ✅ Shows access information

#### Manual Setup (Alternative)

If you prefer to run each step manually:

```bash
# 1. Install dependencies
npm install
cd backend && npm install && cd ..

# 2. Run system check
bash setup/check-requirements.sh

# 3. Setup USB storage (if not done above)
sudo bash setup/setup-usb-storage.sh

# 4. Install PocketCloud
sudo bash setup/install.sh

# 5. Start the application
cd backend && node server.js
```

### Step 9: First-Time Configuration

When you run PocketCloud for the first time, you'll be guided through:

#### Database Setup
- Creates SQLite database at `/mnt/pocketcloud/pocketcloud-data/pocketcloud.db`
- Sets up user tables and encryption keys
- Creates system identity file

#### User Account Creation
- Navigate to `http://your-pi-ip:3000`
- Click "Create Account"
- Enter username and strong password
- **IMPORTANT**: Remember this password - there's no recovery option!

#### Storage Configuration
- PocketCloud automatically configures encrypted storage
- Files stored at `/mnt/pocketcloud/pocketcloud-storage/`
- Each user gets isolated encrypted storage

---

## Network Configuration

### Step 10: Configure Network Access

#### Find Your Pi's IP Address
```bash
# Get all IP addresses
hostname -I

# Get detailed network info
ip addr show
```

#### Configure Firewall (Optional but Recommended)
```bash
# Install UFW firewall
sudo apt install ufw -y

# Set default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH
sudo ufw allow ssh

# Allow PocketCloud port
sudo ufw allow 3000

# Allow local network access only (replace with your network)
sudo ufw allow from 192.168.1.0/24 to any port 3000

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

#### Configure Static IP (Recommended)
```bash
# Edit dhcpcd configuration
sudo nano /etc/dhcpcd.conf
```

**Add these lines at the end** (adjust for your network):
```
# Static IP configuration
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8

interface wlan0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
```

**Save and reboot**:
```bash
sudo reboot
```

#### Test Network Access

From another device on your network:
```bash
# Test ping
ping 192.168.1.100

# Test web access
curl http://192.168.1.100:3000
```

---
## Security Setup

### Step 11: Secure Your Raspberry Pi

#### Change Default Passwords
```bash
# Change pi user password
passwd

# Change root password (optional)
sudo passwd root
```

#### Configure SSH Security
```bash
# Edit SSH configuration
sudo nano /etc/ssh/sshd_config
```

**Make these changes:**
```
# Disable root login
PermitRootLogin no

# Use only key-based authentication (optional)
PasswordAuthentication yes
PubkeyAuthentication yes

# Change default SSH port (optional)
Port 2222

# Allow only specific users
AllowUsers pi
```

**Restart SSH service:**
```bash
sudo systemctl restart ssh
```

#### Set Up SSH Key Authentication (Recommended)

**On your local computer:**
```bash
# Generate SSH key pair
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"

# Copy public key to Pi
ssh-copy-id pi@192.168.1.100
```

**Test key-based login:**
```bash
ssh pi@192.168.1.100
```

#### Configure Automatic Security Updates
```bash
# Install unattended upgrades
sudo apt install unattended-upgrades -y

# Configure automatic updates
sudo dpkg-reconfigure -plow unattended-upgrades
```

Select "Yes" when prompted.

#### Set Up Log Monitoring
```bash
# Install fail2ban for intrusion prevention
sudo apt install fail2ban -y

# Create local configuration
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Edit configuration
sudo nano /etc/fail2ban/jail.local
```

**Find and modify these sections:**
```
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
```

**Start fail2ban:**
```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## System Service Setup

### Step 12: Configure PocketCloud as System Service

#### Create Systemd Service
```bash
# Create service file
sudo nano /etc/systemd/system/pocketcloud.service
```

**Add this content:**
```ini
[Unit]
Description=PocketCloud Personal Cloud Storage
After=network.target
Wants=network.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/Pocketcloud/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=pocketcloud

[Install]
WantedBy=multi-user.target
```

#### Enable and Start Service
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable pocketcloud

# Start service now
sudo systemctl start pocketcloud

# Check status
sudo systemctl status pocketcloud
```

You should see:
```
● pocketcloud.service - PocketCloud Personal Cloud Storage
   Loaded: loaded (/etc/systemd/system/pocketcloud.service; enabled; vendor preset: enabled)
   Active: active (running) since Mon 2024-02-11 10:30:15 GMT; 5s ago
```

#### Service Management Commands
```bash
# Start PocketCloud
sudo systemctl start pocketcloud

# Stop PocketCloud
sudo systemctl stop pocketcloud

# Restart PocketCloud
sudo systemctl restart pocketcloud

# Check status
sudo systemctl status pocketcloud

# View logs
sudo journalctl -u pocketcloud -f

# View recent logs
sudo journalctl -u pocketcloud --since "1 hour ago"
```

---

## Testing & Verification

### Step 13: Comprehensive Testing

#### Test System Health
```bash
# Run system status check
bash ~/Pocketcloud/tools/system-status.sh
```

#### Test Web Interface
1. **Open web browser** on any device on your network
2. **Navigate to**: `http://192.168.1.100:3000`
3. **Create account** if first time
4. **Upload a test file**
5. **Download the file** to verify encryption/decryption

#### Test from Different Devices

**From Windows:**
- Open browser: `http://192.168.1.100:3000`

**From Mac:**
- Open browser: `http://192.168.1.100:3000`

**From Phone:**
- Connect to same WiFi
- Open browser: `http://192.168.1.100:3000`
- Add to home screen for app-like experience

#### Test USB Disconnection Recovery
```bash
# Safely unmount USB
sudo umount /mnt/pocketcloud

# Check PocketCloud response (should show friendly error)
curl http://192.168.1.100:3000

# Reconnect USB
sudo mount -a

# Verify recovery
curl http://192.168.1.100:3000
```

#### Performance Testing
```bash
# Test file upload/download speed
# Upload a large file (100MB+) and time it
# Download the same file and time it

# Monitor system resources during operation
htop
```

---
## Backup and Maintenance

### Step 14: Set Up Automated Backups

#### Create Backup Script
```bash
# Create backup directory
mkdir -p ~/backups

# Set up automated backup
crontab -e
```

**Add this line for daily backups at 2 AM:**
```
0 2 * * * /home/pi/Pocketcloud/tools/backup-pocketcloud.sh
```

#### Manual Backup
```bash
# Create immediate backup
sudo bash ~/Pocketcloud/tools/backup-pocketcloud.sh

# List backups
ls -la ~/backups/
```

#### System Maintenance Tasks
```bash
# Weekly system update (add to crontab)
0 3 * * 0 sudo apt update && sudo apt upgrade -y

# Monthly log cleanup
0 4 1 * * sudo journalctl --vacuum-time=30d

# Check disk usage
df -h

# Check system temperature
vcgencmd measure_temp

# Check memory usage
free -h
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: "Cannot connect to PocketCloud"
**Symptoms:** Browser shows "This site can't be reached"

**Solutions:**
```bash
# Check if service is running
sudo systemctl status pocketcloud

# Check if port is open
sudo netstat -tlnp | grep 3000

# Check firewall
sudo ufw status

# Restart service
sudo systemctl restart pocketcloud

# Check logs
sudo journalctl -u pocketcloud --since "10 minutes ago"
```

#### Issue: "USB storage not available"
**Symptoms:** Error message about external storage

**Solutions:**
```bash
# Check if USB is connected
lsblk

# Check if mounted
df -h | grep pocketcloud

# Remount USB
sudo umount /mnt/pocketcloud
sudo mount -a

# Check fstab entry
cat /etc/fstab | grep pocketcloud

# Check USB health
sudo fsck /dev/sda1
```

#### Issue: "Permission denied" errors
**Symptoms:** Cannot upload files or access storage

**Solutions:**
```bash
# Fix ownership
sudo chown -R pi:pi /mnt/pocketcloud

# Fix permissions
sudo chmod -R 755 /mnt/pocketcloud

# Check mount options
mount | grep pocketcloud
```

#### Issue: "Out of memory" or slow performance
**Symptoms:** System becomes unresponsive

**Solutions:**
```bash
# Check memory usage
free -h

# Check swap
swapon --show

# Add swap file if needed
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Reduce GPU memory
sudo raspi-config
# Advanced Options → Memory Split → 16
```

#### Issue: "Node.js application crashes"
**Symptoms:** Service stops unexpectedly

**Solutions:**
```bash
# Check detailed logs
sudo journalctl -u pocketcloud -f

# Check Node.js version
node --version

# Reinstall dependencies
cd ~/Pocketcloud/backend
rm -rf node_modules
npm install

# Check disk space
df -h

# Check for corrupted files
npm run scan:corruption
```

#### Issue: "Cannot access from other devices"
**Symptoms:** Works on Pi but not from phone/laptop

**Solutions:**
```bash
# Check Pi's IP address
hostname -I

# Test network connectivity
ping 192.168.1.100  # From other device

# Check firewall rules
sudo ufw status

# Allow local network
sudo ufw allow from 192.168.1.0/24 to any port 3000

# Check if service binds to all interfaces
sudo netstat -tlnp | grep 3000
# Should show 0.0.0.0:3000, not 127.0.0.1:3000
```

---

## Advanced Configuration

### Step 15: Optional Enhancements

#### Enable HTTPS (SSL/TLS)
```bash
# Install certbot for Let's Encrypt
sudo apt install certbot -y

# Generate certificate (requires domain name)
sudo certbot certonly --standalone -d your-domain.com

# Configure nginx as reverse proxy
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/pocketcloud
```

#### Set Up Dynamic DNS
```bash
# Install ddclient for dynamic DNS
sudo apt install ddclient -y

# Configure for your DNS provider
sudo nano /etc/ddclient.conf
```

#### Monitor System Health
```bash
# Install monitoring tools
sudo apt install htop iotop nethogs -y

# Set up temperature monitoring
echo '#!/bin/bash
TEMP=$(vcgencmd measure_temp | cut -d= -f2 | cut -d\' -f1)
if (( $(echo "$TEMP > 70" | bc -l) )); then
    echo "High temperature: $TEMP°C" | mail -s "Pi Temperature Alert" your-email@example.com
fi' | sudo tee /usr/local/bin/temp-monitor.sh

sudo chmod +x /usr/local/bin/temp-monitor.sh

# Add to crontab for hourly checks
echo "0 * * * * /usr/local/bin/temp-monitor.sh" | crontab -
```

---

## Final Verification Checklist

### ✅ Complete Setup Verification

**Hardware:**
- [ ] Raspberry Pi 4 with adequate power supply
- [ ] MicroSD card (32GB+) with Raspberry Pi OS
- [ ] USB storage device properly formatted and mounted
- [ ] Network connection (Ethernet or WiFi)

**Software:**
- [ ] Raspberry Pi OS updated to latest version
- [ ] Node.js 18+ installed and working
- [ ] PocketCloud downloaded and dependencies installed
- [ ] USB storage mounted at `/mnt/pocketcloud`
- [ ] PocketCloud service running and enabled

**Network:**
- [ ] Pi has static IP address
- [ ] Firewall configured properly
- [ ] Port 3000 accessible from local network
- [ ] Can access web interface from multiple devices

**Security:**
- [ ] Default passwords changed
- [ ] SSH properly configured
- [ ] Automatic updates enabled
- [ ] Fail2ban installed and configured

**Functionality:**
- [ ] Can create user account
- [ ] Can upload files successfully
- [ ] Can download files successfully
- [ ] Files are encrypted on USB storage
- [ ] USB disconnection handled gracefully
- [ ] System service starts on boot

**Maintenance:**
- [ ] Automated backups configured
- [ ] Log rotation set up
- [ ] System monitoring in place
- [ ] Know how to check logs and status

---

## Success! 🎉

If you've completed all steps and passed the verification checklist, congratulations! You now have:

- **Your own personal cloud** running on Raspberry Pi
- **Military-grade encryption** protecting your files
- **Complete privacy** - no data leaves your network
- **Cross-device access** from phones, tablets, laptops
- **Automatic backups** and system maintenance
- **Professional-grade security** and monitoring

### Quick Reference Commands

```bash
# Check PocketCloud status
sudo systemctl status pocketcloud

# View logs
sudo journalctl -u pocketcloud -f

# Restart PocketCloud
sudo systemctl restart pocketcloud

# Check system health
bash ~/Pocketcloud/tools/system-status.sh

# Create backup
sudo bash ~/Pocketcloud/tools/backup-pocketcloud.sh

# Check USB storage
df -h | grep pocketcloud

# Monitor system resources
htop
```

### Access Your Cloud
- **Local**: http://localhost:3000
- **Network**: http://192.168.1.100:3000 (use your Pi's IP)

**Enjoy your private, secure, personal cloud storage! 🚀**

---

*This guide was created for PocketCloud - Your Personal Cloud. Your Rules. Your Data.*