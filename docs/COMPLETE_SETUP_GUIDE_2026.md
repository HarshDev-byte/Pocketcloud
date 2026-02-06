# PocketCloud Complete Setup Guide - February 2026

**🎯 Goal:** Set up your own personal cloud storage on a Raspberry Pi that works completely offline and encrypts all your files automatically.

**⏱️ Time Required:** 45-90 minutes (depending on download speeds)

**💰 Total Cost:** ~$120-180 USD (Pi + accessories + USB drive)

---

## 📋 What You'll Need (Shopping List)

### Required Hardware (Buy These First)

1. **Raspberry Pi 4 Model B** - 4GB or 8GB RAM
   - **Where to buy:** Amazon, Best Buy, MicroCenter, official Pi retailers
   - **Price:** ~$75-95 USD
   - **Why this model:** Older Pi models are too slow for file encryption

2. **Official Raspberry Pi Power Supply** - USB-C, 5V 3A
   - **Where to buy:** Same places as Pi
   - **Price:** ~$10-15 USD
   - **⚠️ Important:** Generic chargers often cause problems

3. **MicroSD Card** - 64GB, Class 10 or better (SanDisk or Samsung recommended)
   - **Where to buy:** Any electronics store
   - **Price:** ~$15-25 USD
   - **Why 64GB:** System needs space, files go on USB drive

4. **External USB Drive** - 128GB+ (SSD preferred, but USB flash drive works)
   - **Where to buy:** Any electronics store
   - **Price:** ~$20-50 USD
   - **Why external:** SD cards wear out, USB drives are replaceable

5. **Ethernet Cable** (for initial setup)
   - **Where to buy:** Any electronics store
   - **Price:** ~$5-10 USD
   - **Why needed:** More reliable than Wi-Fi for setup

### Optional but Recommended

6. **Raspberry Pi Case with Fan**
   - **Price:** ~$10-20 USD
   - **Why:** Keeps Pi cool during heavy file operations

7. **HDMI Cable** (if you don't have one)
   - **Price:** ~$5-10 USD
   - **Why:** To see Pi desktop during setup

8. **USB Keyboard and Mouse** (for initial setup)
   - **Price:** ~$15-25 USD
   - **Why:** To control Pi during setup

---

## 🖥️ What You'll Need (Computer/Software)

### On Your Computer (Windows, Mac, or Linux)

1. **Raspberry Pi Imager** (free software)
   - **Download from:** https://www.raspberrypi.org/software/
   - **Why:** Official tool to put operating system on SD card

2. **Web Browser** (Chrome, Firefox, Safari, Edge)
   - **Why:** To access your PocketCloud when it's running

### Internet Connection
- **Required during setup:** To download software
- **Not required after setup:** PocketCloud works completely offline

---

## 📅 February 2026 Context

As of February 2026, here's what's current:

- **Raspberry Pi OS:** Version 12 "Bookworm" (64-bit) is standard
- **Node.js:** Version 20 LTS is recommended (18+ required)
- **PocketCloud:** Designed for current 2026 hardware and software
- **Security:** Uses 2026-standard AES-256-GCM encryption

---

## 🚀 Step-by-Step Setup Process

### Phase 1: Prepare the SD Card (15 minutes)

#### Step 1.1: Download Raspberry Pi Imager

1. **On your computer**, open a web browser
2. Go to: https://www.raspberrypi.org/software/
3. Click **"Download for [Your Operating System]"**
4. **Wait for download** (file is about 25MB)
5. **Install the software** by double-clicking the downloaded file
6. **Follow the installer** (click Next, Next, Install, Finish)

#### Step 1.2: Download Raspberry Pi OS

1. **Open Raspberry Pi Imager** (should be on your desktop now)
2. Click **"CHOOSE OS"**
3. Select **"Raspberry Pi OS (64-bit)"** 
   - ⚠️ **Important:** Make sure it says "64-bit", not "32-bit"
   - This should be the first option in the list
4. **Don't click anything else yet** - we'll configure it first

#### Step 1.3: Configure the OS (Important!)

1. **Click the gear icon** ⚙️ (bottom right of Imager window)
2. **Check "Enable SSH"** and select "Use password authentication"
3. **Check "Set username and password"**
   - Username: `pi`
   - Password: Choose a secure password (write it down!)
4. **Check "Configure wireless LAN"** (if you want Wi-Fi)
   - SSID: Your Wi-Fi network name
   - Password: Your Wi-Fi password
   - Country: Your country (US, UK, etc.)
5. **Check "Set locale settings"**
   - Time zone: Your time zone
   - Keyboard layout: Your keyboard layout (us, uk, etc.)
6. **Click "SAVE"**

#### Step 1.4: Flash the SD Card

1. **Insert your SD card** into your computer
   - Use a USB adapter if your computer doesn't have an SD slot
2. **In Raspberry Pi Imager, click "CHOOSE STORAGE"**
3. **Select your SD card** (be careful - this will erase everything on it!)
4. **Click "WRITE"**
5. **Click "YES"** when it asks if you're sure
6. **Wait 10-15 minutes** for it to finish
   - The progress bar will show "Writing... Verifying..."
7. **When it says "Write Successful", click "CONTINUE"**
8. **Safely eject the SD card** from your computer

### Phase 2: First Boot and Basic Setup (20 minutes)

#### Step 2.1: Physical Setup

1. **Insert the SD card** into your Raspberry Pi
2. **Connect the USB keyboard and mouse**
3. **Connect the HDMI cable** to your monitor/TV
4. **Connect the Ethernet cable** to your router
5. **Connect the power cable** (Pi will start automatically)

#### Step 2.2: First Boot

1. **Wait 2-3 minutes** for the Pi to boot up
2. **You should see the desktop** with a raspberry icon
3. **If you see a setup wizard, click through it:**
   - Country: Your country
   - Language: Your language
   - Time zone: Your time zone
   - Password: Use the same password you set in Imager
   - Wi-Fi: Connect if you want (Ethernet is fine too)
   - Update software: Click "Next" (we'll do this manually)
   - Click "Done"

#### Step 2.3: Open Terminal

1. **Click the terminal icon** in the top bar (looks like a black square)
2. **You should see a command prompt** that looks like:
   ```
   pi@raspberrypi:~ $
   ```
3. **If you don't see this, try:**
   - Press `Ctrl + Alt + T`
   - Or click Menu → Accessories → Terminal

#### Step 2.4: Update the System

1. **Type this command** (copy and paste works):
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
2. **Press Enter**
3. **Wait 5-15 minutes** for updates to download and install
4. **When you see the prompt again**, the updates are done

#### Step 2.5: Install Essential Software

1. **Install required packages:**
   ```bash
   sudo apt install -y curl git ufw htop
   ```
2. **Press Enter and wait** for installation to complete

### Phase 3: Prepare USB Storage (10 minutes)

#### Step 3.1: Connect USB Drive

1. **Plug your USB drive** into one of the Pi's USB ports
2. **Wait 10 seconds** for the Pi to recognize it

#### Step 3.2: Find Your USB Drive

1. **In terminal, type:**
   ```bash
   lsblk
   ```
2. **Look for your USB drive** in the output. It will look something like:
   ```
   sda           8:0    1  128G  0 disk
   └─sda1        8:1    1  128G  0 part
   ```
3. **Write down the device name** (like `sda` or `sdb`)
   - ⚠️ **Important:** Don't include the number (sda1), just the letters (sda)

#### Step 3.3: Check USB Drive Contents

1. **⚠️ WARNING:** The next steps will erase everything on your USB drive
2. **If you have important files on the USB drive:**
   - Copy them to your computer first
   - Or use a different USB drive
3. **Make sure you have the right drive** by checking its size matches what you expect

### Phase 4: Install Node.js (10 minutes)

#### Step 4.1: Install Node.js 20 LTS

1. **Download and install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   ```
2. **Wait for the script to complete** (2-3 minutes)

3. **Install Node.js:**
   ```bash
   sudo apt install -y nodejs
   ```
4. **Wait for installation** (2-3 minutes)

#### Step 4.2: Verify Node.js Installation

1. **Check Node.js version:**
   ```bash
   node -v
   ```
2. **You should see something like:** `v20.11.0` (any v20.x.x is good)

3. **Check npm version:**
   ```bash
   npm -v
   ```
4. **You should see something like:** `10.2.4` (any version is fine)

### Phase 5: Download and Setup PocketCloud (15 minutes)

#### Step 5.1: Download PocketCloud

1. **Go to your home directory:**
   ```bash
   cd ~
   ```

2. **Download PocketCloud:**
   ```bash
   git clone https://github.com/your-repo/pocketcloud.git
   ```
   - ⚠️ **Note:** Replace with actual repository URL

3. **Enter the PocketCloud directory:**
   ```bash
   cd pocketcloud
   ```

#### Step 5.2: Run the Automated Setup

1. **Make the setup script executable:**
   ```bash
   chmod +x setup.sh
   ```

2. **Run the complete setup:**
   ```bash
   bash setup.sh
   ```

3. **Follow the prompts:**
   - The script will check your system
   - It will ask you to confirm USB drive setup
   - It will install PocketCloud automatically
   - **Answer "yes" when prompted**
   - **Enter your USB drive name** when asked (like `sda`)

4. **Wait for completion** (5-10 minutes)

### Phase 6: First Access and Account Creation (5 minutes)

#### Step 6.1: Find Your Pi's IP Address

1. **In terminal, type:**
   ```bash
   hostname -I
   ```
2. **Write down the IP address** (looks like 192.168.1.100)

#### Step 6.2: Access PocketCloud

1. **On the Pi, open the web browser** (Firefox icon in top bar)
2. **Go to:** `http://localhost:3000`
3. **You should see the PocketCloud welcome page**

#### Step 6.3: Create Your Account

1. **Click "Create Account"**
2. **Fill in the form:**
   - Username: Choose a username (like `admin` or your name)
   - Password: Choose a strong password (write it down!)
   - Confirm password: Type the same password again
3. **Click "Create Account"**
4. **You should see your dashboard** with 0 files

#### Step 6.4: Test File Upload

1. **Click "Upload Files"**
2. **Select a small file** from your Pi (like a photo)
3. **Click "Upload"**
4. **You should see the file appear** in your dashboard
5. **🎉 Congratulations! PocketCloud is working!**

---

## 🌐 Access from Other Devices

### From Your Phone or Laptop

1. **Make sure your device is on the same Wi-Fi network** as your Pi
2. **Open a web browser** on your device
3. **Go to:** `http://[PI_IP_ADDRESS]:3000`
   - Replace `[PI_IP_ADDRESS]` with the IP you wrote down earlier
   - Example: `http://192.168.1.100:3000`
4. **Log in with your username and password**
5. **You can now upload/download files** from any device!

---

## 🔧 Daily Usage

### Uploading Files
1. **Open PocketCloud** in your web browser
2. **Click "Upload Files"**
3. **Select files** from your device
4. **Files are automatically encrypted** and stored on your USB drive

### Downloading Files
1. **Click on any file** in your dashboard
2. **Click "Download"**
3. **File is automatically decrypted** and downloaded to your device

### Checking Status
1. **On your Pi, open terminal**
2. **Go to PocketCloud directory:** `cd ~/pocketcloud`
3. **Check status:** `bash tools/system-status.sh`

---

## 🆘 Troubleshooting

### "Can't access PocketCloud from my phone"
1. **Check if Pi and phone are on same Wi-Fi network**
2. **Try the Pi's IP address:** `http://192.168.1.XXX:3000`
3. **Check firewall:** `sudo ufw status` (should show port 3000 allowed)

### "PocketCloud won't start"
1. **Check service status:** `sudo systemctl status pocketcloud`
2. **Check logs:** `sudo journalctl -u pocketcloud -n 20`
3. **Restart service:** `sudo systemctl restart pocketcloud`

### "USB drive not working"
1. **Check if mounted:** `df -h | grep pocketcloud`
2. **Re-run USB setup:** `sudo bash setup/setup-usb-storage.sh`

### "Forgot my password"
1. **⚠️ There's no password recovery** (by design for security)
2. **You'll need to create a new account**
3. **Your old files will remain encrypted and inaccessible**

### "Pi won't boot"
1. **Check power supply** (red LED should be solid)
2. **Check SD card** (re-flash if necessary)
3. **Try different HDMI cable/monitor**

---

## 🔒 Security Notes

### What PocketCloud Does
- **Encrypts all files** with AES-256-GCM (military-grade)
- **Never stores your password** (uses it to encrypt/decrypt)
- **Works completely offline** (no internet required after setup)
- **Stores everything on your USB drive** (not the SD card)

### What You Should Do
- **Use a strong password** (mix of letters, numbers, symbols)
- **Keep your Pi physically secure** (locked room/cabinet)
- **Make regular backups:** `sudo bash tools/backup-pocketcloud.sh`
- **Only access from trusted devices** on your home network

### What PocketCloud Doesn't Do
- **No cloud sync** (everything stays on your Pi)
- **No password recovery** (if you forget it, files are gone)
- **No remote access** (only works on your local network)
- **No automatic backups** (you must create them manually)

---

## 📱 Mobile Access Tips

### iOS (iPhone/iPad)
1. **Use Safari or Chrome**
2. **Add to Home Screen:** Share → Add to Home Screen
3. **Works like an app** after adding to home screen

### Android
1. **Use Chrome or Firefox**
2. **Add to Home Screen:** Menu → Add to Home Screen
3. **Works like an app** after adding to home screen

---

## 💾 Backup Your Data

### Create a Backup
1. **On your Pi, open terminal**
2. **Go to PocketCloud:** `cd ~/pocketcloud`
3. **Create backup:** `sudo bash tools/backup-pocketcloud.sh`
4. **Backup is saved** to your USB drive in `/mnt/pocketcloud/backups/`

### Backup to External Drive
1. **Connect second USB drive** to Pi
2. **Create backup:** `sudo bash tools/backup-pocketcloud.sh -d /media/backup-drive`

---

## 🔄 Updates and Maintenance

### Check System Status
```bash
cd ~/pocketcloud
bash tools/system-status.sh
```

### Update PocketCloud (when new versions are available)
```bash
cd ~/pocketcloud
git pull
sudo systemctl restart pocketcloud
```

### Update Raspberry Pi OS
```bash
sudo apt update && sudo apt upgrade -y
```

---

## 📞 Getting Help

### Check Logs
```bash
sudo journalctl -u pocketcloud -f
```

### System Information
```bash
cd ~/pocketcloud
bash tools/system-status.sh
```

### Common Commands
```bash
# Start PocketCloud
sudo systemctl start pocketcloud

# Stop PocketCloud
sudo systemctl stop pocketcloud

# Restart PocketCloud
sudo systemctl restart pocketcloud

# Check if PocketCloud is running
sudo systemctl status pocketcloud
```

---

## 🎉 You're Done!

**Congratulations!** You now have your own personal cloud storage that:

✅ **Encrypts all your files automatically**  
✅ **Works completely offline**  
✅ **Accessible from any device on your network**  
✅ **Stores everything on your replaceable USB drive**  
✅ **Costs nothing to operate** (no monthly fees)  

**Enjoy your private, secure, offline cloud storage!**

---

*Last updated: February 6, 2026*
*PocketCloud Version: 1.0.0*