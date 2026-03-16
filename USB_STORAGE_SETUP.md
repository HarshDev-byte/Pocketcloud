# 🔌 USB Storage Setup for PocketCloud

Automated setup script for 1TB external USB drives on Raspberry Pi 4B.

## 🚀 Quick Setup

**One-command setup:**
```bash
curl -fsSL https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/setup-usb-storage.sh | sudo bash
```

**Or download and run:**
```bash
wget https://raw.githubusercontent.com/HarshDev-byte/Pocketcloud/master/scripts/setup-usb-storage.sh
sudo bash setup-usb-storage.sh
```

## 📋 What the Script Does

1. **Detects USB drives** - Automatically finds connected USB storage
2. **Analyzes devices** - Shows size, model, and current status
3. **Interactive selection** - Let you choose which drive to use
4. **Safe formatting** - Confirms before destroying data
5. **Optimal formatting** - ext4 with performance optimizations
6. **Auto-mounting** - Configures /etc/fstab for boot mounting
7. **Directory structure** - Creates organized folders
8. **Performance tuning** - I/O scheduler and read-ahead optimization
9. **Health monitoring** - Automated checks every 5 minutes
10. **Maintenance tools** - Backup and cleanup scripts

## 🛠️ Features

### Automatic Detection
- Scans for USB 3.0 storage devices
- Shows device info (size, vendor, model)
- Checks mount status and existing data

### Optimal Formatting
- GPT partition table for large drives
- ext4 filesystem with performance settings
- 1% reserved blocks (vs 5% default)
- Journal optimization for better performance

### Performance Optimization
- Deadline I/O scheduler for better SSD performance
- 1MB read-ahead buffer
- Optimal queue depth settings
- noatime mount option to reduce writes

### Health Monitoring
- Automatic health checks every 5 minutes
- Disk usage monitoring (warns at 90%)
- Filesystem integrity checks
- Auto-remount if drive disconnects

### Maintenance Tools
- `pocketcloud-backup-storage` - Backup configuration and data
- `pocketcloud-cleanup-storage` - Clean old temp and trash files
- `pocketcloud-storage-monitor` - Manual health check

## 📁 Directory Structure

After setup, your USB drive will have:
```
/mnt/pocketcloud/
├── uploads/          # File uploads from web interface
├── media/            # Media files
│   ├── photos/       # Photo gallery
│   ├── videos/       # Video library
│   ├── music/        # Music collection
│   └── documents/    # Document storage
├── backups/          # System and data backups
├── temp/             # Temporary files (auto-cleaned)
└── trash/            # Deleted files (30-day retention)
```

## 🔧 Manual Commands

**Check storage status:**
```bash
df -h /mnt/pocketcloud
sudo systemctl status pocketcloud-storage-monitor.timer
```

**View health logs:**
```bash
tail -f /var/log/pocketcloud-storage-health.log
```

**Manual backup:**
```bash
sudo pocketcloud-backup-storage
```

**Clean old files:**
```bash
sudo pocketcloud-cleanup-storage
```

## 🚨 Troubleshooting

**Drive not detected:**
- Ensure USB 3.0 connection
- Try different USB port
- Check if drive needs external power

**Mount fails:**
- Check /var/log/pocketcloud-storage.log
- Verify UUID in /etc/fstab
- Run: `sudo mount -a`

**Performance issues:**
- Check temperature: `vcgencmd measure_temp`
- Monitor I/O: `sudo iotop`
- Verify USB 3.0: `lsusb -t`

## 📊 Supported Drives

**Recommended:**
- Samsung T7 SSD (1TB/2TB)
- SanDisk Extreme Pro SSD
- WD My Passport SSD

**Compatible:**
- Any USB 3.0 drive 100GB+
- Both SSD and HDD supported
- External power may be needed for some drives

## ⚡ Performance Tips

1. **Use USB 3.0 ports** (blue connectors on Pi 4)
2. **SSD over HDD** for better performance
3. **Adequate cooling** prevents thermal throttling
4. **Quality USB cable** reduces connection issues
5. **External power** for high-power drives

---

*This script is part of the PocketCloud project. For support, visit the [GitHub repository](https://github.com/HarshDev-byte/Pocketcloud).*