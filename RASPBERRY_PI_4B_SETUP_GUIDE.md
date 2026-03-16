# 🥧 Complete Raspberry Pi 4B Setup Guide for PocketCloud

Transform your Raspberry Pi 4B 4GB into a powerful personal cloud server with PocketCloud! This comprehensive guide covers everything from hardware selection to advanced configuration.

## 📋 Table of Contents

1. [Hardware Requirements](#hardware-requirements)
2. [Pre-Setup Preparation](#pre-setup-preparation)
3. [Method 1: Quick Install (Recommended)](#method-1-quick-install-recommended)
4. [Method 2: Manual Installation](#method-2-manual-installation)
5. [Initial Configuration](#initial-configuration)
6. [Advanced Configuration](#advanced-configuration)
7. [Performance Optimization](#performance-optimization)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance & Updates](#maintenance--updates)

---

## 🛠️ Hardware Requirements

### Essential Components

| Component | Specification | Recommended Model | Price Range |
|-----------|---------------|-------------------|-------------|
| **Raspberry Pi 4B** | 4GB RAM minimum | Pi 4B 4GB or 8GB | $55-75 |
| **microSD Card** | 32GB+, A2 rated | SanDisk Extreme Pro 64GB A2 | $15-25 |
| **USB Storage** | 1TB+ USB 3.0 | Samsung T7 1TB SSD | $80-120 |
| **Power Supply** | 5V 3A USB-C | Official Pi Foundation PSU | $10-15 |
| **Case** | Ventilated/Fan | Argon ONE V2 or Flirc | $15-30 |
| **Ethernet Cable** | Cat 6 (optional) | For initial setup | $5-10 |

### Optional Enhancements

| Component | Purpose | Recommended Model | Price Range |
|-----------|---------|-------------------|-------------|
| **Power Bank** | Portable operation | Anker PowerCore 26800 | $60-80 |
| **OLED Display** | Status monitoring | 0.96" I2C OLED | $5-10 |
| **Cooling Fan** | Better performance | Noctua NF-A4x10 5V | $15-20 |
| **GPIO Buttons** | Physical controls | Tactile push buttons | $5-10 |

### 💡 Hardware Selection Tips

**microSD Card Performance:**
- **A2 rating is crucial** - 3x faster than A1 cards
- **Avoid cheap cards** - high failure rate
- **64GB recommended** - allows for system expansion
- **Brand matters** - SanDisk, Samsung, Kingston are reliable

**USB Storage Options:**
- **SSD > HDD** - 10x faster, no moving parts, silent
- **USB 3.0 required** - USB 2.0 will bottleneck performance
- **External power** - Some drives need powered USB hub
- **Format compatibility** - ext4 preferred, NTFS/exFAT supported

---

## 🔧 Pre-Setup Preparation

### Step 1: Download Required Software

**On your computer, download:**

1. **Raspberry Pi Imager** (Official tool)
   - Download: https://rpi.org/imager
   - Available for Windows, macOS, Linux

2. **PocketCloud Image** (if using pre-built method)
   - Latest release: https://github.com/HarshDev-byte/Pocketcloud/releases
   - File: `PocketCloud-v1.x.x-pi4b.img.xz`

3. **SSH Client** (for advanced setup)
   - Windows: PuTTY or Windows Terminal
   - macOS/Linux: Built-in terminal

### Step 2: Prepare Hardware

1. **Assemble Pi in case** with proper ventilation
2. **Connect cooling** (fan or heatsinks)
3. **Insert microSD card** into computer
4. **Have USB storage ready** (will be formatted)

### Step 3: Network Planning

**Choose your setup method:**
- **Ethernet**: Direct connection for initial setup
- **WiFi**: Will need existing network credentials
- **Headless**: No monitor/keyboard (SSH only)
- **Desktop**: With monitor and keyboard

---

## 🚀 Method 1: Quick Install (Recommended)

### Step 1: Flash Raspberry Pi OS

**Using Raspberry Pi Imager:**

1. **Open Raspberry Pi Imager**
2. **Choose OS**: "Raspberry Pi OS Lite (64-bit)" 
3. **Choose Storage**: Select your microSD card
4. **Configure Settings** (gear icon):
   ```
   ✅ Enable SSH
   ✅ Set username: pi
   ✅ Set password: [your-secure-password]
   ✅ Configure WiFi (if no ethernet)
   ✅ Set locale settings
   ```
5. **Write** and wait for completion (~10 minutes)

### Step 2: First Boot

1. **Insert microSD** into Pi
2. **Connect ethernet** (if using wired)
3. **Connect power** - Pi will boot automatically
4. **Wait 2-3 minutes** for first boot completion

### Step 3: Connect via SSH

**Find Pi's IP address:**
```bash
# Scan network (replace with your network range)
nmap -sn 192.168.1.0/24 | grep -B2 "Raspberry Pi"

# Or check router admin panel
# Or use: ping raspberrypi.local
```

**Connect via SSH:**
```bash
ssh pi@[PI_IP_ADDRESS]
# Example: ssh pi@192.168.1.100
```

### Step 4: Run PocketCloud Installer

**One-command installation:**
```bash
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/install.sh | sudo bash
```

**Or download and inspect first:**
```bash
wget https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/install.sh
less install.sh  # Review the script
sudo bash install.sh
```

### Step 5: Installation Process

The installer will automatically:

1. ✅ **Check hardware compatibility** (Pi 4B, 4GB RAM)
2. ✅ **Update system packages** (~3 minutes)
3. ✅ **Install dependencies** (Node.js, nginx, hostapd, etc.)
4. ✅ **Download PocketCloud** from GitHub
5. ✅ **Configure WiFi hotspot** (PocketCloud-XXXX network)
6. ✅ **Setup storage** (detect and mount USB drives)
7. ✅ **Build application** (~5 minutes)
8. ✅ **Start services** (backend, frontend, networking)
9. ✅ **Run health checks** and optimize performance
10. ✅ **Reboot** into PocketCloud mode

**Total installation time: 8-12 minutes**

---

## 🔧 Method 2: Manual Installation

For advanced users who want full control over the installation process.

### Step 1: System Preparation

**Update system:**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip build-essential
```

**Install Node.js 20 LTS:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should show v20.x.x
```

### Step 2: Clone PocketCloud Repository

```bash
# Create installation directory
sudo mkdir -p /opt/pocketcloud
sudo chown pi:pi /opt/pocketcloud

# Clone repository
git clone https://github.com/HarshDev-byte/Pocketcloud.git /opt/pocketcloud
cd /opt/pocketcloud
```

### Step 3: Run Individual Setup Scripts

**Network configuration:**
```bash
sudo bash pocket-cloud/scripts/setup/setup-network.sh
```

**Storage setup:**
```bash
sudo bash pocket-cloud/scripts/setup/setup-storage.sh
```

**Application installation:**
```bash
bash pocket-cloud/scripts/setup/setup-app.sh
```

**Service configuration:**
```bash
sudo bash pocket-cloud/scripts/setup/install-services-new.sh
```

**Performance optimization:**
```bash
sudo bash pocket-cloud/scripts/optimization/optimize-pi.sh
```

### Step 4: Build and Start

**Build frontend:**
```bash
cd /opt/pocketcloud/pocket-cloud/frontend
npm install
npm run build
```

**Start services:**
```bash
sudo systemctl enable pocketcloud-backend pocketcloud-frontend
sudo systemctl start pocketcloud-backend pocketcloud-frontend
```

---

## ⚙️ Initial Configuration

### Step 1: Connect to PocketCloud WiFi

After installation completes and Pi reboots:

1. **Look for WiFi network**: `PocketCloud-XXXX` (XXXX = last 4 of MAC)
2. **Default password**: `pocketcloud123`
3. **Connect** from any device (phone, laptop, tablet)

### Step 2: Access Web Interface

**Open browser and navigate to:**
- **Main interface**: http://192.168.4.1
- **Admin panel**: http://192.168.4.1/admin
- **Alternative**: http://pocketcloud.local (if mDNS working)

### Step 3: Complete Setup Wizard

**The setup wizard will guide you through:**

1. **Admin Account Creation**
   ```
   Username: admin
   Password: [create-strong-password]
   Email: [your-email@domain.com]
   ```

2. **WiFi Configuration**
   ```
   Network Name: [customize-or-keep-default]
   Password: [change-from-default]
   Channel: [auto-select-best]
   ```

3. **Storage Configuration**
   ```
   Primary Storage: [select-usb-drive]
   File System: ext4 (recommended)
   Encryption: [optional-but-recommended]
   ```

4. **User Management**
   ```
   Create first user account
   Set storage quotas
   Configure sharing permissions
   ```

5. **Network Settings**
   ```
   Internet sharing: [enable-if-desired]
   Captive portal: [enable-for-guest-access]
   mDNS: [enable-for-easy-discovery]
   ```

### Step 4: Verify Installation

**Check system status:**
```bash
# SSH back into Pi
ssh pi@192.168.4.1

# Check service status
sudo systemctl status pocketcloud-backend
sudo systemctl status pocketcloud-frontend
sudo systemctl status hostapd
sudo systemctl status dnsmasq

# Check logs
sudo journalctl -u pocketcloud-backend -f
```

**Test functionality:**
- Upload a file via web interface
- Create a folder
- Share a file and test the link
- Check admin panel statistics

---

## 🚀 Advanced Configuration

### Hardware Enhancements

**Add OLED Display (I2C):**
```bash
# Enable I2C
sudo raspi-config nonint do_i2c 0

# Install display libraries
sudo apt install -y python3-pil python3-pip
pip3 install adafruit-circuitpython-ssd1306

# Enable OLED service
sudo systemctl enable pocketcloud-oled
sudo systemctl start pocketcloud-oled
```

**Add GPIO Buttons:**
```bash
# Enable GPIO service
sudo systemctl enable pocketcloud-gpio
sudo systemctl start pocketcloud-gpio

# Configure button actions in admin panel
# Power button: GPIO 3 (shutdown)
# Reset button: GPIO 2 (restart services)
```

### Network Configuration

**Enable Internet Sharing:**
```bash
# Configure iptables for NAT
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
sudo iptables -A FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT
sudo iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT

# Save rules
sudo netfilter-persistent save
```

**Custom DNS Configuration:**
```bash
# Edit dnsmasq config
sudo nano /etc/dnsmasq.conf

# Add custom entries
address=/pocketcloud.local/192.168.4.1
address=/admin.pocketcloud.local/192.168.4.1
```

**VPN Server Setup:**
```bash
# Install WireGuard
sudo apt install -y wireguard

# Generate keys
wg genkey | tee privatekey | wg pubkey > publickey

# Configure VPN (see admin panel for GUI setup)
```

### Storage Configuration

**Multiple USB Drives:**
```bash
# Auto-mount additional drives
sudo mkdir -p /mnt/pocketcloud-backup
sudo mkdir -p /mnt/pocketcloud-media

# Add to fstab for persistent mounting
echo "UUID=your-drive-uuid /mnt/pocketcloud-backup ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
```

**RAID Configuration (2+ drives):**
```bash
# Install mdadm
sudo apt install -y mdadm

# Create RAID 1 (mirror)
sudo mdadm --create --verbose /dev/md0 --level=1 --raid-devices=2 /dev/sda1 /dev/sdb1

# Format and mount
sudo mkfs.ext4 /dev/md0
sudo mount /dev/md0 /mnt/pocketcloud
```

### Security Hardening

**Firewall Configuration:**
```bash
# Enable UFW
sudo ufw enable

# Allow PocketCloud services
sudo ufw allow 80/tcp    # Web interface
sudo ufw allow 443/tcp   # HTTPS (if enabled)
sudo ufw allow 22/tcp    # SSH (consider changing port)
sudo ufw allow 53/udp    # DNS
sudo ufw allow 67/udp    # DHCP

# Block everything else
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

**SSH Hardening:**
```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Recommended changes:
Port 2222                    # Change from default 22
PermitRootLogin no          # Disable root login
PasswordAuthentication no   # Use keys only
MaxAuthTries 3             # Limit login attempts

# Restart SSH
sudo systemctl restart ssh
```

**Fail2Ban Configuration:**
```bash
# Configure fail2ban for SSH and web interface
sudo nano /etc/fail2ban/jail.local

[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = 2222

[nginx-http-auth]
enabled = true
```

---

## ⚡ Performance Optimization

### CPU and Memory Optimization

**Enable performance governor:**
```bash
# Set CPU governor to performance
echo 'performance' | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Make permanent
echo 'GOVERNOR="performance"' | sudo tee /etc/default/cpufrequtils
```

**Memory optimization:**
```bash
# Increase GPU memory split for better video processing
sudo raspi-config nonint do_memory_split 128

# Enable zram for better memory management
sudo apt install -y zram-tools
echo 'ALGO=lz4' | sudo tee -a /etc/default/zramswap
```

**Disable unnecessary services:**
```bash
# Disable services not needed for headless operation
sudo systemctl disable bluetooth
sudo systemctl disable cups
sudo systemctl disable avahi-daemon  # Only if not using mDNS
```

### Storage Performance

**Optimize ext4 filesystem:**
```bash
# Remount with performance options
sudo mount -o remount,noatime,commit=60 /mnt/pocketcloud

# Make permanent in /etc/fstab
UUID=your-uuid /mnt/pocketcloud ext4 defaults,noatime,commit=60 0 2
```

**Enable USB 3.0 optimization:**
```bash
# Add to /boot/config.txt
echo 'dtoverlay=dwc2,dr_mode=host' | sudo tee -a /boot/config.txt

# Increase USB current limit
echo 'max_usb_current=1' | sudo tee -a /boot/config.txt
```

### Network Performance

**Optimize WiFi settings:**
```bash
# Edit hostapd config for better performance
sudo nano /etc/hostapd/hostapd.conf

# Add these lines:
ieee80211n=1
wmm_enabled=1
ht_capab=[HT40][SHORT-GI-20][DSSS_CCK-40]
```

**TCP optimization:**
```bash
# Add to /etc/sysctl.conf
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
```

### Cooling and Thermal Management

**Monitor temperatures:**
```bash
# Check current temperature
vcgencmd measure_temp

# Monitor continuously
watch -n 1 vcgencmd measure_temp
```

**Configure thermal throttling:**
```bash
# Add to /boot/config.txt for better thermal management
temp_limit=75
temp_soft_limit=70
```

---

## 🔍 Troubleshooting

### Common Issues and Solutions

#### Pi Won't Boot After Installation

**Symptoms:** Red LED solid, no green LED activity
**Solutions:**
```bash
# Check power supply (needs 3A minimum)
# Try different microSD card
# Re-flash image with Raspberry Pi Imager
# Check for corrupted download (verify SHA256)
```

#### Can't Connect to PocketCloud WiFi

**Symptoms:** Network not visible or connection fails
**Solutions:**
```bash
# SSH via ethernet and check hostapd status
sudo systemctl status hostapd

# Restart networking services
sudo systemctl restart hostapd dnsmasq

# Check WiFi country code
sudo raspi-config nonint do_wifi_country US

# Verify wlan0 interface exists
ip addr show wlan0
```

#### Web Interface Won't Load

**Symptoms:** Browser shows "can't connect" or timeout
**Solutions:**
```bash
# Check if connected to PocketCloud WiFi (not home WiFi)
# Try http://192.168.4.1 (not https)
# Check nginx status
sudo systemctl status nginx

# Check backend service
sudo systemctl status pocketcloud-backend

# View logs
sudo journalctl -u pocketcloud-backend -f
```

#### USB Drive Not Detected

**Symptoms:** No storage available in web interface
**Solutions:**
```bash
# Check if drive is detected
lsblk
sudo fdisk -l

# Check mount status
df -h
mount | grep pocketcloud

# Manual mount
sudo mkdir -p /mnt/pocketcloud
sudo mount /dev/sda1 /mnt/pocketcloud

# Check filesystem
sudo fsck /dev/sda1
```

#### Poor Performance/Slow Transfers

**Symptoms:** Slow file uploads, high CPU usage
**Solutions:**
```bash
# Check temperature (should be <70°C)
vcgencmd measure_temp

# Check CPU frequency
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq

# Monitor system resources
htop
iotop

# Check USB speed
sudo hdparm -tT /dev/sda
```

### Advanced Diagnostics

**System health check:**
```bash
# Run built-in health check
sudo /opt/pocketcloud/pocket-cloud/scripts/monitoring/health-check.sh

# Check all services
sudo systemctl list-units --failed

# Memory usage
free -h
cat /proc/meminfo

# Disk usage
df -h
du -sh /opt/pocketcloud/*
```

**Network diagnostics:**
```bash
# Check network interfaces
ip addr show

# Test internal connectivity
ping 192.168.4.1

# Check DNS resolution
nslookup pocketcloud.local

# Monitor network traffic
sudo tcpdump -i wlan0

# Check iptables rules
sudo iptables -L -n -v
```

**Log analysis:**
```bash
# System logs
sudo journalctl --since "1 hour ago"

# PocketCloud specific logs
sudo journalctl -u pocketcloud-backend --since "1 hour ago"
sudo journalctl -u pocketcloud-frontend --since "1 hour ago"

# Network service logs
sudo journalctl -u hostapd --since "1 hour ago"
sudo journalctl -u dnsmasq --since "1 hour ago"

# Check for errors
sudo dmesg | grep -i error
```

---

## 🔄 Maintenance & Updates

### Regular Maintenance Tasks

**Weekly:**
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Check disk usage
df -h
du -sh /mnt/pocketcloud/*

# Review logs for errors
sudo journalctl --since "1 week ago" | grep -i error

# Check service status
sudo systemctl status pocketcloud-backend pocketcloud-frontend
```

**Monthly:**
```bash
# Clean package cache
sudo apt autoremove -y
sudo apt autoclean

# Backup configuration
sudo tar -czf /home/pi/pocketcloud-config-$(date +%Y%m%d).tar.gz /opt/pocketcloud/config

# Check for PocketCloud updates
cd /opt/pocketcloud && git fetch origin

# Verify filesystem integrity
sudo fsck -f /dev/sda1  # Run when unmounted
```

### Updating PocketCloud

**Automatic updates (recommended):**
1. Go to http://192.168.4.1/admin
2. Navigate to System → Updates
3. Click "Check for Updates"
4. Click "Install Update" if available
5. Wait for automatic reboot

**Manual updates:**
```bash
# Backup current installation
sudo systemctl stop pocketcloud-backend pocketcloud-frontend
sudo cp -r /opt/pocketcloud /opt/pocketcloud.backup

# Pull latest changes
cd /opt/pocketcloud
git pull origin master

# Update dependencies
cd pocket-cloud/backend && npm install
cd ../frontend && npm install && npm run build

# Restart services
sudo systemctl start pocketcloud-backend pocketcloud-frontend
```

**Rollback if needed:**
```bash
# Stop services
sudo systemctl stop pocketcloud-backend pocketcloud-frontend

# Restore backup
sudo rm -rf /opt/pocketcloud
sudo mv /opt/pocketcloud.backup /opt/pocketcloud

# Start services
sudo systemctl start pocketcloud-backend pocketcloud-frontend
```

### Backup Strategies

**Configuration backup:**
```bash
# Create backup script
cat > /home/pi/backup-pocketcloud.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/pi/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup configuration
sudo tar -czf "$BACKUP_DIR/pocketcloud-config-$DATE.tar.gz" \
    /opt/pocketcloud/config \
    /etc/hostapd \
    /etc/dnsmasq.conf \
    /etc/systemd/system/pocketcloud-*

# Backup database
sudo sqlite3 /opt/pocketcloud/data/pocketcloud.db ".backup $BACKUP_DIR/pocketcloud-db-$DATE.db"

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x /home/pi/backup-pocketcloud.sh
```

**Automated backups:**
```bash
# Add to crontab for weekly backups
(crontab -l 2>/dev/null; echo "0 2 * * 0 /home/pi/backup-pocketcloud.sh") | crontab -
```

### Performance Monitoring

**Set up monitoring dashboard:**
```bash
# Install system monitoring tools
sudo apt install -y htop iotop nethogs

# Create monitoring script
cat > /home/pi/monitor-pocketcloud.sh << 'EOF'
#!/bin/bash
echo "=== PocketCloud System Status ==="
echo "Date: $(date)"
echo "Uptime: $(uptime)"
echo "Temperature: $(vcgencmd measure_temp)"
echo "Memory: $(free -h | grep Mem)"
echo "Disk: $(df -h /mnt/pocketcloud | tail -1)"
echo "Services:"
systemctl is-active pocketcloud-backend pocketcloud-frontend hostapd dnsmasq
echo "================================="
EOF

chmod +x /home/pi/monitor-pocketcloud.sh
```

---

## 📚 Additional Resources

### Documentation Links
- **Official PocketCloud Docs**: https://github.com/HarshDev-byte/Pocketcloud/wiki
- **Raspberry Pi Documentation**: https://www.raspberrypi.org/documentation/
- **Node.js Best Practices**: https://nodejs.org/en/docs/guides/

### Community Support
- **GitHub Issues**: https://github.com/HarshDev-byte/Pocketcloud/issues
- **GitHub Discussions**: https://github.com/HarshDev-byte/Pocketcloud/discussions
- **Reddit**: r/raspberry_pi, r/selfhosted

### Useful Commands Reference

**System Information:**
```bash
# Hardware info
cat /proc/cpuinfo | grep "Raspberry Pi"
vcgencmd get_mem arm && vcgencmd get_mem gpu
vcgencmd measure_temp

# Network info
ip addr show
iwconfig wlan0
cat /sys/class/net/wlan0/address

# Storage info
lsblk -f
df -h
sudo fdisk -l
```

**Service Management:**
```bash
# Check service status
sudo systemctl status pocketcloud-backend
sudo systemctl status pocketcloud-frontend
sudo systemctl status hostapd
sudo systemctl status dnsmasq

# Restart services
sudo systemctl restart pocketcloud-backend
sudo systemctl restart pocketcloud-frontend
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq

# View logs
sudo journalctl -u pocketcloud-backend -f
sudo journalctl -u hostapd -f
```

**Network Troubleshooting:**
```bash
# Check WiFi interface
sudo iwlist wlan0 scan | grep ESSID
sudo iw dev wlan0 info

# Check hostapd configuration
sudo hostapd -dd /etc/hostapd/hostapd.conf

# Check DHCP leases
cat /var/lib/dhcp/dhcpd.leases
```

---

## 🎉 Conclusion

You now have a comprehensive guide to set up PocketCloud on your Raspberry Pi 4B 4GB! This setup provides:

- **Personal cloud storage** accessible from anywhere
- **Media streaming** for videos, music, and photos
- **File synchronization** across all your devices
- **Secure sharing** with friends and family
- **WebDAV mounting** for native OS integration
- **Mobile PWA** for smartphone access
- **Admin dashboard** for system management

**Next Steps:**
1. Install desktop/mobile clients from the releases page
2. Set up automated backups for important data
3. Configure port forwarding for internet access (optional)
4. Explore the API for custom integrations
5. Join the community for tips and support

**Remember:** Keep your system updated, monitor performance regularly, and always maintain backups of important data!

---

*This guide was created for PocketCloud v1.0.0 on Raspberry Pi 4B. For the latest updates, visit the [GitHub repository](https://github.com/HarshDev-byte/Pocketcloud).*