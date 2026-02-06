# PocketCloud - Raspberry Pi Setup Guide

## Hardware Requirements

- **Raspberry Pi 4** (2GB RAM minimum, 4GB+ recommended)
- **External USB Drive** (32GB+ recommended, formatted as ext4)
- **MicroSD Card** (32GB+ Class 10 or better)
- **Official Raspberry Pi Power Supply** (5V 3A USB-C)
- **Ethernet Cable** (recommended for initial setup)

## Step 1: Prepare Raspberry Pi OS

### Download and Flash OS
1. Download **Raspberry Pi OS (64-bit)** from https://www.raspberrypi.org/software/
2. Use Raspberry Pi Imager to flash to SD card
3. **Enable SSH** in Imager advanced options (recommended)
4. Set username/password in Imager (recommended)

### First Boot Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl git ufw

# Enable firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 3000
```

## Step 2: Prepare External USB Storage

### Format USB Drive (if needed)
```bash
# Find your USB drive
lsblk

# Format as ext4 (replace /dev/sdX with your drive)
sudo mkfs.ext4 /dev/sdX1

# Get UUID for permanent mounting
sudo blkid /dev/sdX1
```

### Create Mount Point and Auto-Mount
```bash
# Create mount directory
sudo mkdir -p /mnt/pocketcloud

# Add to fstab for permanent mounting (replace UUID with yours)
echo "UUID=your-uuid-here /mnt/pocketcloud ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab

# Mount now
sudo mount -a

# Verify mount
df -h /mnt/pocketcloud
```

## Step 3: Install Node.js

```bash
# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node -v  # Should show v18.x.x or higher
npm -v   # Should show npm version
```

## Step 4: Install PocketCloud

### Automatic Installation (Recommended)
```bash
# Clone repository
git clone https://github.com/your-repo/pocketcloud.git
cd pocketcloud

# Run automated installer
sudo bash install.sh
```

### Manual Installation (if needed)
```bash
# Create user and directories
sudo useradd -r -s /bin/false pocketcloud
sudo mkdir -p /opt/pocketcloud
sudo chown pocketcloud:pocketcloud /opt/pocketcloud

# Copy files
sudo cp -r . /opt/pocketcloud/
sudo chown -R pocketcloud:pocketcloud /opt/pocketcloud

# Install dependencies
cd /opt/pocketcloud
sudo -u pocketcloud npm install --production

# Install systemd service
sudo cp pocketcloud.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pocketcloud
sudo systemctl start pocketcloud
```

## Step 5: Verify Installation

```bash
# Check service status
sudo systemctl status pocketcloud

# Check if port is listening
sudo netstat -tlnp | grep 3000

# View logs
sudo journalctl -u pocketcloud -f
```

## Step 6: Access PocketCloud

1. **Local access**: http://localhost:3000
2. **Network access**: http://YOUR_PI_IP:3000
3. **Find Pi IP**: `hostname -I`

## Security Considerations

### Network Security
```bash
# Only allow access from local network
sudo ufw allow from 192.168.1.0/24 to any port 3000

# Or allow from specific IP
sudo ufw allow from 192.168.1.100 to any port 3000
```

### USB Drive Security
- Use encrypted USB drive for sensitive data
- Regular backups to separate storage
- Physical security of the device

## Troubleshooting

### Service Won't Start
```bash
# Check logs
sudo journalctl -u pocketcloud -n 50

# Check permissions
ls -la /opt/pocketcloud
ls -la /mnt/pocketcloud

# Restart service
sudo systemctl restart pocketcloud
```

### Can't Access from Network
```bash
# Check firewall
sudo ufw status

# Check if service is binding to all interfaces
sudo netstat -tlnp | grep 3000
```

### USB Drive Issues
```bash
# Check mount
df -h | grep pocketcloud

# Check filesystem
sudo fsck /dev/sdX1

# Remount
sudo umount /mnt/pocketcloud
sudo mount -a
```

## Maintenance

### Updates
```bash
cd /opt/pocketcloud
sudo -u pocketcloud git pull
sudo -u pocketcloud npm install --production
sudo systemctl restart pocketcloud
```

### Backups
- Regular backups of `/opt/pocketcloud/data/`
- Test restore procedures
- Keep backups on separate storage

### Monitoring
```bash
# Check system resources
htop

# Check disk space
df -h

# Check service health
curl http://localhost:3000/health
```

## Performance Optimization

### For Raspberry Pi 4
```bash
# Increase GPU memory split
echo "gpu_mem=16" | sudo tee -a /boot/config.txt

# Enable hardware random number generator
echo "dtparam=random=on" | sudo tee -a /boot/config.txt

# Reboot to apply
sudo reboot
```

### For Heavy Usage
- Use USB 3.0 SSD instead of USB drive
- Ensure adequate cooling
- Monitor temperature: `vcgencmd measure_temp`

## Next Steps

1. Create your first user account
2. Upload test files
3. Create your first backup
4. Set up regular maintenance schedule
5. Configure network access as needed

Your PocketCloud is now ready for secure, offline file storage!