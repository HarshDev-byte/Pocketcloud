# 🚀 Quick Raspberry Pi Setup for PocketCloud

## TL;DR - Command Sequence for Experienced Users

```bash
# 1. Flash Raspberry Pi OS (64-bit) to SD card with SSH enabled
# 2. Boot Pi, connect via SSH

# Update system
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget vim htop tree

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Setup USB storage (replace sda1 with your device)
sudo umount /dev/sda1 2>/dev/null || true
sudo mkfs.ext4 /dev/sda1
sudo e2label /dev/sda1 "POCKETCLOUD"
sudo mkdir -p /mnt/pocketcloud

# Get UUID and add to fstab
UUID=$(sudo blkid /dev/sda1 | grep -o 'UUID="[^"]*"' | cut -d'"' -f2)
echo "UUID=$UUID /mnt/pocketcloud ext4 defaults,nofail,uid=1000,gid=1000 0 2" | sudo tee -a /etc/fstab
sudo mount -a
sudo chown -R pi:pi /mnt/pocketcloud

# Clone and setup PocketCloud
cd ~
git clone https://github.com/HarshDev-byte/Pocketcloud.git
cd Pocketcloud
./start-pocketcloud.sh

# Create systemd service
sudo tee /etc/systemd/system/pocketcloud.service > /dev/null <<EOF
[Unit]
Description=PocketCloud Personal Cloud Storage
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Pocketcloud/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable pocketcloud
sudo systemctl start pocketcloud

# Configure firewall
sudo apt install ufw -y
sudo ufw allow ssh
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw enable

# Setup static IP (edit with your network details)
sudo tee -a /etc/dhcpcd.conf > /dev/null <<EOF
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
EOF

sudo reboot
```

## Access Your Cloud
- **Local**: http://localhost:3000
- **Network**: http://192.168.1.100:3000

## Management Commands
```bash
sudo systemctl status pocketcloud    # Check status
sudo journalctl -u pocketcloud -f    # View logs
sudo systemctl restart pocketcloud   # Restart service
bash ~/Pocketcloud/tools/system-status.sh  # Health check
```

## Hardware Requirements
- Raspberry Pi 4 (4GB+ RAM)
- MicroSD card (32GB+ Class 10)
- USB storage (32GB+ USB 3.0)
- Official Pi power supply

## Security Checklist
- [ ] Change default pi password: `passwd`
- [ ] Configure SSH keys
- [ ] Enable automatic updates
- [ ] Install fail2ban: `sudo apt install fail2ban -y`
- [ ] Set up automated backups

**Done! Your personal cloud is ready! 🎉**