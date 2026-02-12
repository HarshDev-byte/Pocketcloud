# PocketCloud Complete Windows Setup Guide - February 2026

**🎯 Goal:** Set up your own personal cloud storage on Windows that works completely offline and encrypts all your files automatically.

**⏱️ Time Required:** 30-60 minutes (depending on download speeds)

**💰 Total Cost:** ~$20-50 USD (just for a USB drive - software is free!)

**🖥️ Compatible With:** Windows 10 (64-bit), Windows 11

---

## 📋 What You'll Need (Shopping List)

### Required Hardware

1. **Windows Computer** - Windows 10/11 (64-bit)
   - **RAM:** 4GB minimum (8GB recommended)
   - **Storage:** At least 2GB free space for software
   - **USB Port:** USB 2.0 or 3.0 port available

2. **External USB Drive** - 32GB+ (128GB+ recommended)
   - **Where to buy:** Amazon, Best Buy, Walmart, any electronics store
   - **Price:** ~$15-40 USD
   - **Recommended:** SanDisk, Samsung, or Kingston USB 3.0 drives
   - **Why external:** Your files will be stored here, not on your computer

### Required Software (All Free)

3. **Node.js** - JavaScript runtime (free)
   - **Download from:** https://nodejs.org/
   - **Version needed:** 18.0+ (20 LTS recommended)
   - **Why needed:** PocketCloud runs on Node.js

4. **Git for Windows** - Version control (free)
   - **Download from:** https://git-scm.com/download/win
   - **Why needed:** To download PocketCloud source code

5. **Web Browser** - Chrome, Firefox, Edge, or Safari
   - **Why needed:** To access your PocketCloud interface

### Internet Connection
- **Required during setup:** To download software and PocketCloud
- **Not required after setup:** PocketCloud works completely offline

---

## 🚀 Step-by-Step Setup Process

### Phase 1: Prepare Your Computer (15 minutes)

#### Step 1.1: Check Your Windows Version

1. **Press `Windows Key + R`**
2. **Type `winver` and press Enter**
3. **Check that you have:**
   - Windows 10 version 1903 or later, OR
   - Windows 11 (any version)
   - 64-bit architecture (should say "x64-based PC")

**If you have an older version:**
- Update Windows through Settings → Update & Security → Windows Update
- Or consider upgrading to Windows 11 if your hardware supports it

#### Step 1.2: Create a Dedicated Folder

1. **Open File Explorer** (Windows Key + E)
2. **Navigate to your C: drive**
3. **Right-click in empty space**
4. **Select "New" → "Folder"**
5. **Name it "PocketCloud"** (exactly like this)
6. **Double-click to open the folder**

**Why this location?** 
- Easy to find and remember
- Avoids permission issues
- Clean organization

### Phase 2: Install Required Software (20 minutes)

#### Step 2.1: Install Node.js (10 minutes)

1. **Open your web browser**
2. **Go to:** https://nodejs.org/
3. **You'll see two download buttons:**
   - Click the **"20.x.x LTS"** button (left side, green)
   - **Don't click** the "Current" version (right side)

4. **Wait for download** (file is about 50MB)
5. **Find the downloaded file** (usually in Downloads folder)
   - File name looks like: `node-v20.11.0-x64.msi`

6. **Double-click the installer file**
7. **Follow the installation wizard:**
   - Click "Next" on welcome screen
   - **Check "I accept the terms"** → Click "Next"
   - **Leave default installation path** → Click "Next"
   - **Leave all features selected** → Click "Next"
   - **Check "Automatically install the necessary tools"** → Click "Next"
   - Click "Install"
   - **Enter your Windows password** if prompted
   - Wait for installation (3-5 minutes)
   - Click "Finish"

8. **Verify installation:**
   - **Press `Windows Key + R`**
   - **Type `cmd` and press Enter**
   - **In the black window, type:** `node -v`
   - **Press Enter**
   - **You should see:** `v20.11.0` (or similar)
   - **Type:** `npm -v`
   - **Press Enter**
   - **You should see:** `10.2.4` (or similar)
   - **Type `exit` and press Enter** to close the window

**If you see version numbers, Node.js is installed correctly!**

#### Step 2.2: Install Git for Windows (10 minutes)

1. **In your web browser, go to:** https://git-scm.com/download/win
2. **Click "64-bit Git for Windows Setup"**
3. **Wait for download** (file is about 50MB)
4. **Find the downloaded file** (usually in Downloads folder)
   - File name looks like: `Git-2.43.0-64-bit.exe`

5. **Double-click the installer file**
6. **Follow the installation wizard:**
   - Click "Next" on license screen
   - **Leave default installation path** → Click "Next"
   - **Leave all components selected** → Click "Next"
   - **Leave default Start Menu folder** → Click "Next"
   - **Choose default editor:** Select "Use Notepad as Git's default editor" → Click "Next"
   - **Initial branch name:** Leave "Let Git decide" → Click "Next"
   - **PATH environment:** Leave "Git from the command line and also from 3rd-party software" → Click "Next"
   - **SSH executable:** Leave "Use bundled OpenSSH" → Click "Next"
   - **HTTPS transport:** Leave "Use the OpenSSL library" → Click "Next"
   - **Line ending conversions:** Leave "Checkout Windows-style, commit Unix-style" → Click "Next"
   - **Terminal emulator:** Leave "Use MinTTY" → Click "Next"
   - **Git pull behavior:** Leave "Default (fast-forward or merge)" → Click "Next"
   - **Credential helper:** Leave "Git Credential Manager" → Click "Next"
   - **Extra options:** Leave defaults → Click "Next"
   - **Experimental features:** Leave unchecked → Click "Install"
   - Wait for installation (2-3 minutes)
   - Click "Finish"

7. **Verify installation:**
   - **Press `Windows Key + R`**
   - **Type `cmd` and press Enter**
   - **Type:** `git --version`
   - **Press Enter**
   - **You should see:** `git version 2.43.0.windows.1` (or similar)
   - **Type `exit` and press Enter** to close the window

**If you see a version number, Git is installed correctly!**

### Phase 3: Prepare USB Storage (5 minutes)

#### Step 3.1: Connect and Format USB Drive

1. **Connect your USB drive** to your computer
2. **Wait 10 seconds** for Windows to recognize it
3. **Open File Explorer** (Windows Key + E)
4. **Look for your USB drive** in the left sidebar
   - It might be called "USB Drive (E:)" or "Removable Disk (F:)" etc.
   - **Write down the drive letter** (E:, F:, G:, etc.) - you'll need this later!

5. **Right-click on your USB drive**
6. **Select "Format..."**
7. **In the Format dialog:**
   - **File system:** Select "NTFS"
   - **Volume label:** Type "POCKETCLOUD"
   - **Allocation unit size:** Leave as "Default"
   - **Check "Quick Format"**
   - Click "Start"
   - Click "OK" when warned about erasing data
   - Wait for formatting to complete (30 seconds)
   - Click "OK" when done

**⚠️ WARNING:** Formatting will erase everything on your USB drive. Make sure you don't have important files on it!

### Phase 4: Download PocketCloud (5 minutes)

#### Step 4.1: Open Command Prompt as Administrator

1. **Press `Windows Key`**
2. **Type "cmd"**
3. **Right-click on "Command Prompt"**
4. **Select "Run as administrator"**
5. **Click "Yes"** when Windows asks for permission
6. **You should see a black window** with text ending in `C:\Windows\System32>`

#### Step 4.2: Navigate to Your PocketCloud Folder

1. **In the command prompt, type:**
   ```cmd
   cd C:\PocketCloud
   ```
2. **Press Enter**
3. **The prompt should now show:** `C:\PocketCloud>`

#### Step 4.3: Download PocketCloud

1. **Type this command exactly:**
   ```cmd
   git clone https://github.com/HarshDev-byte/Pocketcloud.git .
   ```
   **Note the space and dot at the end!**

2. **Press Enter**
3. **You should see output like:**
   ```
   Cloning into '.'...
   remote: Enumerating objects: 1234, done.
   remote: Counting objects: 100% (1234/1234), done.
   remote: Compressing objects: 100% (567/567), done.
   remote: Total 1234 (delta 890), reused 1234 (delta 890)
   Receiving objects: 100% (1234/1234), 2.34 MiB | 5.67 MiB/s, done.
   Resolving deltas: 100% (890/890), done.
   ```

4. **Wait for download to complete** (1-3 minutes depending on internet speed)

5. **Verify download:**
   - **Type:** `dir`
   - **Press Enter**
   - **You should see files like:**
     ```
     README.md
     WINDOWS_SETUP_GUIDE.md
     backend
     docs
     windows-setup.bat
     start-pocketcloud-windows.bat
     ```

**If you see these files, PocketCloud downloaded successfully!**

### Phase 5: Install PocketCloud Dependencies (10 minutes)

#### Step 5.1: Run the Windows Setup Script

1. **In the same command prompt, type:**
   ```cmd
   windows-setup.bat
   ```
2. **Press Enter**

3. **You should see output like:**
   ```
   Setting up PocketCloud for Windows...
   Installing backend dependencies...
   ```

4. **Wait for installation** (5-10 minutes)
   - You'll see lots of text scrolling by
   - This is normal - npm is downloading and installing packages
   - **Don't close the window** even if it seems stuck

5. **When complete, you should see:**
   ```
   Setup complete!
   
   To start PocketCloud:
   1. Make sure your USB drive is connected
   2. Note the drive letter (e.g., E:, F:, G:)
   3. Run: start-pocketcloud-windows.bat [DRIVE_LETTER]
      Example: start-pocketcloud-windows.bat E:
   
   Press any key to continue . . .
   ```

6. **Press any key** to close the setup window

**If you see "Setup complete!", PocketCloud is ready to run!**

### Phase 6: Start PocketCloud (5 minutes)

#### Step 6.1: Start PocketCloud with Your USB Drive

1. **Make sure your USB drive is still connected**
2. **Remember the drive letter** you wrote down earlier (E:, F:, G:, etc.)

3. **In the command prompt, type:**
   ```cmd
   start-pocketcloud-windows.bat E:
   ```
   **Replace `E:` with your actual USB drive letter!**

4. **Press Enter**

5. **You should see output like:**
   ```
   Starting PocketCloud...
   Storage location: E:\PocketCloud
   Web interface will be available at: http://localhost:3000
   
   Storage root configured as: E:\PocketCloud
   Initializing storage at: E:\PocketCloud
   ✓ Storage directory initialized and writable
   Initializing database...
   ✓ Database initialized
   
   🌟 PocketCloud is running!
   
   📁 Storage: E:\PocketCloud
   🌐 Local access: http://localhost:3000
   🔒 Session secret: a1b2c3d4...
   
   Press Ctrl+C to stop the server
   ```

**If you see "PocketCloud is running!", you're almost done!**

### Phase 7: Access PocketCloud and Create Account (5 minutes)

#### Step 7.1: Open PocketCloud in Your Browser

1. **Open your web browser** (Chrome, Firefox, Edge, etc.)
2. **In the address bar, type:** `http://localhost:3000`
3. **Press Enter**

4. **You should see the PocketCloud welcome page** with:
   - PocketCloud logo
   - "Welcome to PocketCloud" message
   - Login form or "Create Account" button

**If you see this page, PocketCloud is working perfectly!**

#### Step 7.2: Create Your Account

1. **Click "Create Account"** (or "Register" if you see that instead)

2. **Fill in the registration form:**
   - **Username:** Choose a username (like "admin", "john", or your name)
   - **Password:** Choose a strong password
     - Use at least 8 characters
     - Mix of letters, numbers, and symbols
     - Example: `MyCloud2026!`
   - **Confirm Password:** Type the same password again

3. **Click "Create Account"**

4. **You should be redirected to your dashboard** showing:
   - "Welcome to your PocketCloud"
   - Storage usage: 0 MB used
   - "Upload Files" button
   - Empty file list

**🎉 Congratulations! Your PocketCloud is now running!**

### Phase 8: Test File Upload (5 minutes)

#### Step 8.1: Upload Your First File

1. **Click the "Upload Files" button**
2. **Select a small file** from your computer (like a photo or document)
3. **Click "Open"**
4. **Wait for upload** (should be very fast for small files)
5. **You should see your file appear** in the dashboard

#### Step 8.2: Test File Download

1. **Click on the file** you just uploaded
2. **Click "Download"** (if prompted)
3. **The file should download** to your Downloads folder
4. **Open the downloaded file** to verify it works

**If upload and download work, your PocketCloud is fully functional!**

---

## 🌐 Access from Other Devices (Phones, Tablets, Laptops)

### Step 1: Find Your Computer's IP Address

1. **On your Windows computer, press `Windows Key + R`**
2. **Type `cmd` and press Enter**
3. **Type:** `ipconfig`
4. **Press Enter**
5. **Look for "IPv4 Address"** under your network adapter
   - It will look like: `192.168.1.100` or `10.0.0.50`
   - **Write this down!**

### Step 2: Access from Other Devices

1. **On your phone, tablet, or other laptop:**
   - **Connect to the same Wi-Fi network** as your Windows computer
   - **Open a web browser**
   - **Go to:** `http://[YOUR_IP]:3000`
   - **Example:** `http://192.168.1.100:3000`

2. **Log in with the same username and password** you created

3. **You can now upload/download files** from any device!

### Step 3: Add to Home Screen (Mobile)

**On iPhone/iPad:**
1. Open PocketCloud in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"
4. Tap "Add"

**On Android:**
1. Open PocketCloud in Chrome
2. Tap the menu (three dots)
3. Tap "Add to Home screen"
4. Tap "Add"

---

## 🔧 Daily Usage

### Starting PocketCloud

**Every time you want to use PocketCloud:**

1. **Connect your USB drive** to your computer
2. **Open Command Prompt as Administrator**
3. **Navigate to PocketCloud:**
   ```cmd
   cd C:\PocketCloud
   ```
4. **Start PocketCloud:**
   ```cmd
   start-pocketcloud-windows.bat E:
   ```
   (Replace E: with your USB drive letter)

5. **Open browser to:** `http://localhost:3000`

### Stopping PocketCloud

**To stop PocketCloud:**
1. **Go to the Command Prompt window** where PocketCloud is running
2. **Press `Ctrl + C`**
3. **Wait for "Server stopped" message**
4. **Close the Command Prompt window**

### File Management

**Uploading Files:**
1. Click "Upload Files" in PocketCloud
2. Select files from your computer
3. Files are automatically encrypted and stored on USB drive

**Downloading Files:**
1. Click on any file in your dashboard
2. Click "Download"
3. File is automatically decrypted and downloaded

**Where Files Are Stored:**
- Your encrypted files are stored on your USB drive in: `E:\PocketCloud\uploads\`
- **Never modify these files directly** - always use the web interface

---

## 🆘 Troubleshooting

### Common Issues and Solutions

#### "Node.js is not installed or not in PATH"

**Problem:** The setup script can't find Node.js

**Solutions:**
1. **Restart your computer** (this refreshes the PATH)
2. **Reinstall Node.js** from https://nodejs.org/
3. **During installation, make sure to check "Add to PATH"**

#### "Drive not found" or "Drive E:\ not found"

**Problem:** PocketCloud can't find your USB drive

**Solutions:**
1. **Check USB connection** - unplug and reconnect
2. **Check drive letter** - open File Explorer and see what letter your USB drive has
3. **Try different USB port**
4. **Use the correct drive letter:**
   ```cmd
   start-pocketcloud-windows.bat F:
   ```
   (Replace F: with your actual drive letter)

#### "Failed to install dependencies"

**Problem:** npm couldn't download packages

**Solutions:**
1. **Check internet connection**
2. **Run Command Prompt as Administrator**
3. **Try again:**
   ```cmd
   cd C:\PocketCloud
   windows-setup.bat
   ```

#### "Port 3000 already in use"

**Problem:** Another program is using port 3000

**Solutions:**
1. **Close other programs** that might use port 3000
2. **Use a different port:**
   ```cmd
   set PORT=8080
   start-pocketcloud-windows.bat E:
   ```
   Then access at: `http://localhost:8080`

#### Can't Access from Phone/Tablet

**Problem:** Other devices can't connect to PocketCloud

**Solutions:**
1. **Check Wi-Fi** - make sure all devices are on the same network
2. **Check Windows Firewall:**
   - Press `Windows Key`
   - Type "Windows Defender Firewall"
   - Click "Allow an app or feature through Windows Defender Firewall"
   - Click "Change Settings"
   - Click "Allow another app..."
   - Browse to: `C:\Program Files\nodejs\node.exe`
   - Check both "Private" and "Public"
   - Click "OK"

3. **Find correct IP address:**
   ```cmd
   ipconfig
   ```
   Look for IPv4 Address

#### "This site can't be reached" Error

**Problem:** Browser can't connect to PocketCloud

**Solutions:**
1. **Check if PocketCloud is running** - look for the Command Prompt window
2. **Check the URL** - make sure it's `http://localhost:3000` (not https)
3. **Try different browser** - Chrome, Firefox, Edge
4. **Restart PocketCloud:**
   - Press `Ctrl + C` in Command Prompt
   - Run `start-pocketcloud-windows.bat E:` again

#### Files Won't Upload

**Problem:** Upload fails or gets stuck

**Solutions:**
1. **Check USB drive space** - make sure it's not full
2. **Check file size** - very large files (>1GB) may take time
3. **Try smaller files first** - test with a small image or document
4. **Check USB connection** - make sure drive is properly connected

#### Forgot Password

**Problem:** Can't remember your PocketCloud password

**⚠️ Important:** There is no password recovery by design (for security)

**Solutions:**
1. **You'll need to create a new account** (your old files will be inaccessible)
2. **Or restore from backup** if you made one

### Getting Help

#### Collect System Information

**If you need help, gather this information:**

1. **Windows version:**
   ```cmd
   winver
   ```

2. **Node.js version:**
   ```cmd
   node -v
   npm -v
   ```

3. **USB drive info:**
   ```cmd
   wmic logicaldisk get size,freespace,caption
   ```

4. **PocketCloud status:**
   - Check the Command Prompt window where PocketCloud is running
   - Look for any error messages

---

## 🔒 Security and Privacy

### What PocketCloud Does for Security

✅ **Military-grade encryption** - All files encrypted with AES-256-GCM  
✅ **Zero-knowledge design** - Your password is never stored anywhere  
✅ **Offline operation** - No internet required after setup  
✅ **Local network only** - Only accessible from your home network  
✅ **No cloud dependencies** - Everything stays on your USB drive  

### Best Security Practices

🔐 **Use a strong password** - Mix of letters, numbers, symbols  
💾 **Make regular backups** - Copy your USB drive to another drive  
🏠 **Secure physical access** - Keep your computer and USB drive safe  
📱 **Only use trusted devices** - Don't access from public computers  
🔄 **Keep software updated** - Update Windows and Node.js regularly  

### What to Remember

⚠️ **No password recovery** - If you forget your password, files are gone  
🌐 **Local network only** - Doesn't work over the internet  
💾 **USB drive dependency** - Files are stored on USB, not computer  
🔒 **Encryption is automatic** - All files are encrypted when uploaded  

---

## 💾 Backup Your Data

### Why Backup?

- **USB drives can fail** - hardware isn't perfect
- **Accidental deletion** - mistakes happen
- **Computer problems** - Windows issues, viruses, etc.
- **Peace of mind** - sleep better knowing your data is safe

### Simple Backup Method

1. **Get a second USB drive** (same size or larger)
2. **Connect both drives** to your computer
3. **Copy the entire PocketCloud folder:**
   - From: `E:\PocketCloud`
   - To: `F:\PocketCloud-Backup`
   (Replace E: and F: with your actual drive letters)

### Automated Backup Script

**Create a backup script:**

1. **Open Notepad**
2. **Copy and paste this:**
   ```cmd
   @echo off
   echo Creating PocketCloud backup...
   set SOURCE=E:\PocketCloud
   set BACKUP=F:\PocketCloud-Backup-%date:~-4,4%%date:~-10,2%%date:~-7,2%
   xcopy "%SOURCE%" "%BACKUP%" /E /I /Y
   echo Backup completed to %BACKUP%
   pause
   ```
3. **Replace E: and F: with your actual drive letters**
4. **Save as:** `backup-pocketcloud.bat` in your `C:\PocketCloud` folder
5. **Run it weekly** by double-clicking the file

---

## 🔄 Updates and Maintenance

### Updating PocketCloud

**When new versions are available:**

1. **Stop PocketCloud** (Ctrl + C in Command Prompt)
2. **Open Command Prompt as Administrator**
3. **Navigate to PocketCloud:**
   ```cmd
   cd C:\PocketCloud
   ```
4. **Download updates:**
   ```cmd
   git pull origin master
   ```
5. **Update dependencies:**
   ```cmd
   windows-setup.bat
   ```
6. **Start PocketCloud again:**
   ```cmd
   start-pocketcloud-windows.bat E:
   ```

### Updating Node.js

**Every 6-12 months:**

1. **Go to:** https://nodejs.org/
2. **Download the latest LTS version**
3. **Run the installer** (it will update your existing installation)
4. **Restart your computer**
5. **Test PocketCloud** to make sure it still works

### Windows Updates

**Keep Windows updated:**
1. **Settings** → **Update & Security** → **Windows Update**
2. **Click "Check for updates"**
3. **Install any available updates**
4. **Restart when prompted**

---

## 🎯 Advanced Usage

### Development Mode (No USB Required)

**For testing or if you don't have a USB drive:**

```cmd
cd C:\PocketCloud
start-dev-windows.bat
```

This stores files in `C:\PocketCloud\backend\dev-storage` instead of USB.

### Custom Storage Location

**To use a different drive or folder:**

```cmd
set STORAGE_PATH=D:\MyPocketCloudStorage
cd C:\PocketCloud
start-pocketcloud-windows.bat
```

### Custom Port

**If port 3000 is busy:**

```cmd
set PORT=8080
cd C:\PocketCloud
start-pocketcloud-windows.bat E:
```

Then access at: `http://localhost:8080`

### Multiple USB Drives

**You can use different USB drives:**

```cmd
start-pocketcloud-windows.bat E:  # Use E: drive
start-pocketcloud-windows.bat F:  # Use F: drive
```

Each drive will have its own separate files and accounts.

---

## 📱 Mobile Usage Tips

### iPhone/iPad Tips

- **Use Safari** for best compatibility
- **Add to Home Screen** for app-like experience
- **Enable "Request Desktop Website"** if layout looks weird
- **Use landscape mode** for better file management

### Android Tips

- **Use Chrome** for best compatibility
- **Add to Home Screen** for app-like experience
- **Enable "Desktop site"** if needed
- **Use file manager apps** to easily select files for upload

### General Mobile Tips

- **Upload photos directly** from your camera roll
- **Download files** to access offline
- **Use Wi-Fi** for faster transfers
- **Keep devices on same network** as your Windows computer

---

## 🌟 Use Cases and Ideas

### Personal Use

📸 **Photo Storage** - Upload photos from your phone, access from laptop  
📄 **Document Sharing** - Share files between your devices  
🎵 **Music Library** - Store and stream your music collection  
📚 **E-book Collection** - Access your books from any device  
💾 **Backup Important Files** - Keep copies of important documents  

### Family Use

👨‍👩‍👧‍👦 **Family Photos** - Everyone can upload and access family pictures  
🎬 **Home Videos** - Store and watch family videos  
📋 **Shared Documents** - Family calendars, shopping lists, etc.  
🎓 **School Projects** - Kids can access their files from any device  

### Small Business

💼 **Client Files** - Secure storage for client documents  
📊 **Project Sharing** - Team members can access project files  
💾 **Data Backup** - Keep important business data safe  
🔒 **Privacy Compliance** - Data never leaves your premises  

### Creative Projects

🎨 **Design Files** - Store large design files and access from anywhere  
📹 **Video Projects** - Work on video projects from multiple devices  
🎼 **Music Production** - Access your music files and samples  
📝 **Writing Projects** - Sync your documents across devices  

---

## ❓ Frequently Asked Questions

### General Questions

**Q: Is PocketCloud really free?**
A: Yes! PocketCloud is completely free and open-source. You only pay for the USB drive.

**Q: Do I need internet to use PocketCloud?**
A: Only for initial setup. After that, it works completely offline.

**Q: Can I access PocketCloud from outside my home?**
A: No, by design. PocketCloud only works on your local network for security.

**Q: How secure is PocketCloud?**
A: Very secure. It uses military-grade AES-256-GCM encryption and zero-knowledge architecture.

### Technical Questions

**Q: What happens if my USB drive fails?**
A: Your files would be lost unless you have backups. Always backup important data!

**Q: Can I use multiple USB drives?**
A: Yes, but each drive is separate. You can't access files from Drive A when using Drive B.

**Q: What file types are supported?**
A: All file types! PocketCloud encrypts and stores any file you upload.

**Q: Is there a file size limit?**
A: Default limit is 1GB per file, but this can be changed in the configuration.

### Troubleshooting Questions

**Q: What if I forget my password?**
A: There's no password recovery by design. You'd need to create a new account (old files become inaccessible).

**Q: Can I change my password?**
A: Currently, you'd need to create a new account. Password changing will be added in future versions.

**Q: What if my computer crashes?**
A: Your files are safe on the USB drive. Just reinstall PocketCloud and connect your USB drive.

---

## 🎉 You're Done!

**Congratulations!** You now have your own personal cloud storage running on Windows that:

✅ **Encrypts all your files automatically** with military-grade security  
✅ **Works completely offline** - no internet required after setup  
✅ **Accessible from any device** on your home network  
✅ **Stores everything on your USB drive** - portable and replaceable  
✅ **Costs nothing to operate** - no monthly fees ever  
✅ **Protects your privacy** - your data never leaves your home  

### What You Can Do Now:

🔄 **Upload files** from any device on your network  
📱 **Access from phones and tablets** - works like a mobile app  
💾 **Store any file type** - photos, videos, documents, music  
🔒 **Rest easy** knowing your files are encrypted and private  
🌐 **Share with family** - everyone can access the same files  

### Remember:

- **Start PocketCloud** whenever you want to use it
- **Keep your USB drive connected** when using PocketCloud
- **Make regular backups** of your USB drive
- **Keep your password safe** - there's no recovery option

**Enjoy your private, secure, Windows-based personal cloud storage!**

---

## 📞 Getting Additional Help

### If You Get Stuck

1. **Re-read the relevant section** of this guide
2. **Check the troubleshooting section** for your specific issue
3. **Try the basic solutions** (restart, reconnect USB, etc.)
4. **Search online** for your specific error message

### Useful Commands Reference

```cmd
# Navigate to PocketCloud
cd C:\PocketCloud

# Start PocketCloud with USB drive
start-pocketcloud-windows.bat E:

# Start in development mode
start-dev-windows.bat

# Check Node.js version
node -v

# Check your IP address
ipconfig

# Update PocketCloud
git pull origin master

# Reinstall dependencies
windows-setup.bat
```

### System Information Commands

```cmd
# Windows version
winver

# List all drives
wmic logicaldisk get size,freespace,caption

# Network information
ipconfig /all

# Check what's using port 3000
netstat -ano | findstr :3000
```

---

*Last updated: February 13, 2026*  
*Compatible with Windows 10/11 and Node.js 18+*  
*PocketCloud Version: 1.0.0 with Windows Support*