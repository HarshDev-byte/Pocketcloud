# PocketCloud Management Tools

This directory contains utility scripts for managing and maintaining your PocketCloud installation.

## Scripts

### `system-status.sh`
Comprehensive health check and status monitoring tool that displays:
- PocketCloud service status and uptime
- Network connectivity and port availability
- USB storage health and usage
- System resources (CPU, memory, temperature)
- Recent log analysis
- Quick access information

**Usage:**
```bash
bash tools/system-status.sh
```

**Example Output:**
```
🔧 PocketCloud Service Status
✅ PocketCloud service is running
✅ Service enabled for startup

🌐 Network Status  
✅ Port 3000 is listening
✅ Local health check passed
   Access URL: http://192.168.1.100:3000

💾 Storage Status
✅ USB storage is mounted at /mnt/pocketcloud
   Size: 64G, Used: 2.1G, Free: 59G (4% full)
✅ Optimal filesystem (ext4)
```

### `backup-pocketcloud.sh`
Complete backup solution that creates full backups of:
- Application files and configuration
- User data and encrypted files
- System configuration (service files, fstab)
- Backup manifest with restoration instructions

**Usage:**
```bash
# Backup to default location (/mnt/pocketcloud/backups)
sudo bash tools/backup-pocketcloud.sh

# Backup to external drive
sudo bash tools/backup-pocketcloud.sh -d /media/backup-drive

# Backup to home directory
sudo bash tools/backup-pocketcloud.sh -d /home/pi/backups
```

**Features:**
- Interactive compression option
- Detailed backup manifest
- Restoration instructions
- Size reporting
- Permission handling (root vs user)

## When to Use These Tools

### Daily/Weekly Monitoring
```bash
# Quick health check
bash tools/system-status.sh
```

### Before System Changes
```bash
# Create backup before updates
sudo bash tools/backup-pocketcloud.sh
```

### Troubleshooting
```bash
# Check system status first
bash tools/system-status.sh

# If issues found, check logs
sudo journalctl -u pocketcloud -n 50

# Create backup before attempting fixes
sudo bash tools/backup-pocketcloud.sh
```

### Regular Maintenance
```bash
# Weekly status check
bash tools/system-status.sh

# Monthly backup
sudo bash tools/backup-pocketcloud.sh -d /media/external-backup
```

## Integration with System Monitoring

You can integrate these tools with system monitoring:

### Cron Jobs
```bash
# Add to crontab (crontab -e)
# Daily status check (log to file)
0 9 * * * /path/to/pocketcloud/tools/system-status.sh >> /var/log/pocketcloud-status.log 2>&1

# Weekly backup
0 2 * * 0 /path/to/pocketcloud/tools/backup-pocketcloud.sh -d /media/backup >> /var/log/pocketcloud-backup.log 2>&1
```

### System Alerts
```bash
# Check if service is running (returns 0 if OK, 1 if not)
systemctl is-active --quiet pocketcloud && echo "OK" || echo "FAILED"

# Check disk space (alert if >90% full)
df /mnt/pocketcloud | awk 'NR==2 {if(substr($5,1,length($5)-1) > 90) print "DISK FULL WARNING: " $5}'
```

## Output and Logs

### Status Script Output
- Color-coded status indicators (✅ ❌ ⚠️)
- Detailed system information
- Quick access URLs
- Useful command suggestions

### Backup Script Output
- Progress indicators
- Size information
- Backup location details
- Restoration instructions
- Compression options

## Troubleshooting Tools

If PocketCloud isn't working properly:

1. **Check overall status:**
   ```bash
   bash tools/system-status.sh
   ```

2. **Check service logs:**
   ```bash
   sudo journalctl -u pocketcloud -f
   ```

3. **Check system resources:**
   ```bash
   htop
   df -h
   ```

4. **Create backup before fixing:**
   ```bash
   sudo bash tools/backup-pocketcloud.sh
   ```

5. **Restart service:**
   ```bash
   sudo systemctl restart pocketcloud
   ```

## File Locations

These tools work with the standard PocketCloud installation:

- **Application**: `/opt/pocketcloud/`
- **Data**: `/mnt/pocketcloud/pocketcloud-data/`
- **Storage**: `/mnt/pocketcloud/pocketcloud-storage/`
- **Service**: `/etc/systemd/system/pocketcloud.service`
- **Logs**: `journalctl -u pocketcloud`
- **Backups**: `/mnt/pocketcloud/backups/` (default)