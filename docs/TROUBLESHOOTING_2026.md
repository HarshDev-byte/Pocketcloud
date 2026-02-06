# PocketCloud Troubleshooting Guide - February 2026

**Having problems? This guide covers the most common issues and their solutions.**

---

## 🚨 Emergency Quick Fixes

### PocketCloud Won't Start
```bash
# Check if it's running
sudo systemctl status pocketcloud

# If not running, start it
sudo systemctl start pocketcloud

# If it keeps failing, restart the Pi
sudo reboot
```

### Can't Access from Phone/Laptop
```bash
# Check Pi's IP address
hostname -I

# Check if port 3000 is open
sudo netstat -tlnp | grep 3000

# Open firewall if needed
sudo ufw allow 3000
```

### USB Drive Problems
```bash
# Check if USB drive is mounted
df -h | grep pocketcloud

# If not mounted, remount it
sudo mount -a

# If still problems, re-run USB setup
sudo bash setup/setup-usb-storage.sh
```

---

## 🔧 Setup Problems

### Problem: "No USB drives found"

**Symptoms:**
- Setup script says no USB drives detected
- USB drive is plugged in but not recognized

**Solutions:**

1. **Check USB connection:**
   ```bash
   # List all USB devices
   lsusb
   
   # List all storage devices
   lsblk
   ```

2. **Try different USB port:**
   - Unplug USB drive
   - Wait 10 seconds
   - Plug into different USB port
   - Wait 10 seconds
   - Run `lsblk` again

3. **Check USB drive health:**
   - Try USB drive on your computer
   - If it doesn't work on computer, drive is faulty
   - Try a different USB drive

4. **Power issues:**
   - Use official Pi power supply (5V 3A)
   - Don't use USB hubs
   - Try powered USB hub if you must use one

### Problem: "Node.js installation failed"

**Symptoms:**
- Error messages during Node.js installation
- `node -v` command not found
- npm installation errors

**Solutions:**

1. **Check internet connection:**
   ```bash
   ping -c 3 google.com
   ```

2. **Manual Node.js installation:**
   ```bash
   # Remove any partial installation
   sudo apt remove -y nodejs npm
   
   # Clean package cache
   sudo apt autoremove -y
   sudo apt autoclean
   
   # Install fresh
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

3. **Alternative installation method:**
   ```bash
   # Use snap if available
   sudo snap install node --classic
   
   # Or use apt default (older version)
   sudo apt install -y nodejs npm
   ```

### Problem: "Permission denied" errors

**Symptoms:**
- Can't write to directories
- Setup scripts fail with permission errors
- Service won't start

**Solutions:**

1. **Run setup scripts with sudo:**
   ```bash
   # USB setup needs root
   sudo bash setup/setup-usb-storage.sh
   
   # Installation needs root
   sudo bash setup/install.sh
   ```

2. **Fix ownership issues:**
   ```bash
   # Fix PocketCloud directory ownership
   sudo chown -R pocketcloud:pocketcloud /opt/pocketcloud
   
   # Fix USB storage ownership
   sudo chown -R pocketcloud:pocketcloud /mnt/pocketcloud
   ```

3. **Check file permissions:**
   ```bash
   # Make scripts executable
   chmod +x setup/*.sh
   chmod +x tools/*.sh
   ```

---

## 🌐 Network Problems

### Problem: Can't access PocketCloud from phone/laptop

**Symptoms:**
- Works on Pi (localhost:3000) but not from other devices
- "Connection refused" or "Site can't be reached" errors
- Timeout when trying to connect

**Solutions:**

1. **Check devices are on same network:**
   - Pi and phone/laptop must be on same Wi-Fi network
   - Don't use guest networks
   - Check Wi-Fi network name on both devices

2. **Find Pi's correct IP address:**
   ```bash
   # On the Pi, run:
   hostname -I
   
   # Try all IP addresses shown
   # Usually looks like 192.168.1.XXX
   ```

3. **Check firewall settings:**
   ```bash
   # Check firewall status
   sudo ufw status
   
   # Allow PocketCloud port
   sudo ufw allow 3000
   
   # If firewall is inactive, enable it
   sudo ufw enable
   ```

4. **Test network connectivity:**
   ```bash
   # From your phone/laptop, ping the Pi
   ping 192.168.1.XXX
   
   # Should get responses like "64 bytes from..."
   ```

5. **Router issues:**
   - Some routers block device-to-device communication
   - Check router settings for "AP isolation" or "client isolation"
   - Disable these features if found
   - Restart router if needed

### Problem: "Connection keeps dropping"

**Symptoms:**
- Can connect but gets disconnected frequently
- Slow file uploads/downloads
- Intermittent access

**Solutions:**

1. **Use Ethernet instead of Wi-Fi:**
   ```bash
   # Check Ethernet connection
   ip addr show eth0
   ```

2. **Check Wi-Fi signal strength:**
   ```bash
   # Check Wi-Fi status
   iwconfig wlan0
   
   # Look for "Signal level" - should be better than -70 dBm
   ```

3. **Move Pi closer to router:**
   - Wi-Fi signal weakens with distance
   - Walls and metal objects block signal
   - Try moving Pi to same room as router

4. **Check for interference:**
   - Other devices using 2.4GHz (microwaves, baby monitors)
   - Switch to 5GHz Wi-Fi if available
   - Change Wi-Fi channel on router

---

## 💾 Storage Problems

### Problem: "No space left on device"

**Symptoms:**
- Can't upload files
- Error messages about disk space
- System running slowly

**Solutions:**

1. **Check disk usage:**
   ```bash
   # Check USB drive space
   df -h /mnt/pocketcloud
   
   # Check SD card space
   df -h /
   ```

2. **Free up space on SD card:**
   ```bash
   # Clean package cache
   sudo apt autoremove -y
   sudo apt autoclean
   
   # Remove old logs
   sudo journalctl --vacuum-time=7d
   
   # Check large files
   sudo du -sh /* | sort -hr | head -10
   ```

3. **Free up space on USB drive:**
   - Delete old files through PocketCloud web interface
   - Remove old backups: `sudo rm -rf /mnt/pocketcloud/backups/old_*`

4. **Get bigger USB drive:**
   - 128GB+ recommended for regular use
   - 1TB+ for heavy use
   - SSD faster than flash drive

### Problem: "USB drive not mounting"

**Symptoms:**
- USB drive connected but not accessible
- `/mnt/pocketcloud` directory empty
- "No such file or directory" errors

**Solutions:**

1. **Check USB drive health:**
   ```bash
   # Check for errors
   sudo fsck /dev/sda1
   
   # Replace sda1 with your USB device
   ```

2. **Manual mounting:**
   ```bash
   # Create mount point
   sudo mkdir -p /mnt/pocketcloud
   
   # Mount USB drive
   sudo mount /dev/sda1 /mnt/pocketcloud
   
   # Replace sda1 with your USB device
   ```

3. **Fix fstab entry:**
   ```bash
   # Check fstab
   grep pocketcloud /etc/fstab
   
   # If missing, re-run USB setup
   sudo bash setup/setup-usb-storage.sh
   ```

4. **USB drive corruption:**
   - Try USB drive on computer
   - Run disk check on computer
   - Format USB drive and start over if needed

---

## 🔒 Security Problems

### Problem: "Forgot PocketCloud password"

**Symptoms:**
- Can't log into PocketCloud web interface
- Files are encrypted and inaccessible

**Solutions:**

⚠️ **Important:** There is NO password recovery by design!

1. **Try common passwords:**
   - Check if you wrote it down somewhere
   - Try variations of passwords you commonly use
   - Try with/without capital letters

2. **Create new account:**
   - You can create a new account with different username
   - Old files will remain encrypted and inaccessible
   - This is by design for security

3. **Restore from backup:**
   - If you have a backup, you can restore it
   - Backup includes account information
   - Run: `sudo bash tools/backup-pocketcloud.sh`

4. **Start fresh:**
   - Re-run setup to create new installation
   - Old encrypted files will be lost forever
   - This is the security trade-off for zero-knowledge encryption

### Problem: "Can't create account"

**Symptoms:**
- Error when trying to register
- "Username already exists" messages
- Form won't submit

**Solutions:**

1. **Try different username:**
   - Usernames must be unique
   - Try adding numbers: `admin1`, `user2024`
   - Use different format: `john_doe` instead of `johndoe`

2. **Check password requirements:**
   - Must be at least 8 characters
   - Should include letters, numbers, symbols
   - Avoid very common passwords

3. **Clear browser cache:**
   - Press Ctrl+F5 to refresh page
   - Clear browser cookies for the site
   - Try different browser

4. **Restart PocketCloud:**
   ```bash
   sudo systemctl restart pocketcloud
   ```

---

## ⚡ Performance Problems

### Problem: "File uploads are very slow"

**Symptoms:**
- Takes forever to upload files
- Upload progress bar stuck
- Timeouts during upload

**Solutions:**

1. **Check file size limits:**
   - Default limit is 1GB per file
   - Large files take longer
   - Try smaller files first

2. **Use Ethernet instead of Wi-Fi:**
   - Ethernet is faster and more stable
   - Wi-Fi can be slow or unreliable
   - Connect Pi directly to router

3. **Check USB drive speed:**
   - USB 2.0 drives are slower than USB 3.0
   - Flash drives slower than SSDs
   - Try different USB port (blue = USB 3.0)

4. **Reduce network traffic:**
   - Pause other downloads/streaming
   - Upload during off-peak hours
   - Close other apps on phone/laptop

5. **Check Pi temperature:**
   ```bash
   # Check CPU temperature
   vcgencmd measure_temp
   
   # Should be under 70°C
   # If over 80°C, Pi is overheating
   ```

### Problem: "Pi is running hot/slow"

**Symptoms:**
- CPU temperature over 80°C
- System feels sluggish
- Random crashes or reboots

**Solutions:**

1. **Add cooling:**
   - Install heatsinks on CPU
   - Add case fan
   - Improve airflow around Pi

2. **Check power supply:**
   - Use official 5V 3A power supply
   - Inadequate power causes performance issues
   - Check for "under-voltage" warnings in logs

3. **Reduce CPU load:**
   ```bash
   # Check what's using CPU
   htop
   
   # Look for processes using high CPU %
   ```

4. **Optimize system:**
   ```bash
   # Reduce GPU memory (more RAM for system)
   echo "gpu_mem=16" | sudo tee -a /boot/config.txt
   
   # Reboot to apply
   sudo reboot
   ```

---

## 🔄 Service Problems

### Problem: "PocketCloud service won't start"

**Symptoms:**
- `systemctl status pocketcloud` shows "failed"
- Error messages in logs
- Can't access web interface

**Solutions:**

1. **Check service logs:**
   ```bash
   # View recent logs
   sudo journalctl -u pocketcloud -n 50
   
   # Follow logs in real-time
   sudo journalctl -u pocketcloud -f
   ```

2. **Common log errors and fixes:**

   **"EADDRINUSE: Port 3000 already in use"**
   ```bash
   # Find what's using port 3000
   sudo netstat -tlnp | grep 3000
   
   # Kill the process (replace PID)
   sudo kill -9 PID
   
   # Restart PocketCloud
   sudo systemctl restart pocketcloud
   ```

   **"ENOENT: No such file or directory"**
   ```bash
   # Check if USB drive is mounted
   df -h | grep pocketcloud
   
   # If not mounted, remount
   sudo mount -a
   ```

   **"Permission denied"**
   ```bash
   # Fix ownership
   sudo chown -R pocketcloud:pocketcloud /opt/pocketcloud
   sudo chown -R pocketcloud:pocketcloud /mnt/pocketcloud
   ```

3. **Restart everything:**
   ```bash
   # Stop service
   sudo systemctl stop pocketcloud
   
   # Wait 5 seconds
   sleep 5
   
   # Start service
   sudo systemctl start pocketcloud
   
   # Check status
   sudo systemctl status pocketcloud
   ```

4. **Reinstall service:**
   ```bash
   # Remove service
   sudo systemctl stop pocketcloud
   sudo systemctl disable pocketcloud
   sudo rm /etc/systemd/system/pocketcloud.service
   
   # Reinstall
   sudo bash setup/install.sh
   ```

---

## 🆘 When All Else Fails

### Nuclear Options (Last Resort)

1. **Restart the Pi:**
   ```bash
   sudo reboot
   ```

2. **Reinstall PocketCloud:**
   ```bash
   # Stop and remove service
   sudo systemctl stop pocketcloud
   sudo systemctl disable pocketcloud
   sudo rm /etc/systemd/system/pocketcloud.service
   
   # Remove installation
   sudo rm -rf /opt/pocketcloud
   
   # Re-run installation
   sudo bash setup/install.sh
   ```

3. **Start completely over:**
   - Re-flash SD card with fresh Raspberry Pi OS
   - Follow setup guide from beginning
   - Restore from backup if you have one

### Getting Help

1. **Check logs first:**
   ```bash
   # System logs
   sudo journalctl -n 100
   
   # PocketCloud logs
   sudo journalctl -u pocketcloud -n 50
   
   # System status
   bash tools/system-status.sh
   ```

2. **Gather information:**
   - What were you doing when the problem started?
   - What error messages do you see?
   - What have you tried already?
   - What's your hardware setup?

3. **Ask for help:**
   - Raspberry Pi forums: https://www.raspberrypi.org/forums/
   - Reddit: r/raspberry_pi
   - Local computer groups/friends

---

## 📋 Prevention Tips

### Regular Maintenance

1. **Weekly checks:**
   ```bash
   # Check system status
   bash tools/system-status.sh
   
   # Check disk space
   df -h
   
   # Check temperature
   vcgencmd measure_temp
   ```

2. **Monthly maintenance:**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Create backup
   sudo bash tools/backup-pocketcloud.sh
   
   # Clean logs
   sudo journalctl --vacuum-time=30d
   ```

3. **Good practices:**
   - Don't unplug USB drive while Pi is running
   - Shut down properly: `sudo shutdown -h now`
   - Keep Pi in ventilated area
   - Use surge protector for power
   - Test backups occasionally

---

**Remember: Most problems have simple solutions. Don't panic, read error messages carefully, and try the basic fixes first!**

---

*Troubleshooting guide version: February 6, 2026*
*Compatible with: PocketCloud 1.0.0*