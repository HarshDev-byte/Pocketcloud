# Cross-Device Access Guide - PocketCloud

**🎯 Goal:** Access your encrypted files from any device on your network safely and reliably.

---

## 🔑 How Cross-Device Access Works

### **The Encryption Model**
PocketCloud uses **zero-knowledge encryption** where:
- **Your password** is the master key to decrypt files
- **Encryption keys** are derived from your password on each login
- **No keys are stored permanently** - they're generated fresh each time you log in

### **Why You Need to Login on Each Device**
- **Device A uploads file** → Encrypted with keys derived from your password
- **Device B downloads file** → Must login with same password to derive same keys
- **Same user account** → Same encryption keys → Files decrypt properly

---

## 📱 Step-by-Step Cross-Device Setup

### **Step 1: Find Your PocketCloud IP Address**
On your Raspberry Pi:
```bash
hostname -I
```
**Example output:** `192.168.1.100`

### **Step 2: Access from Other Devices**

#### **From Phone/Tablet:**
1. **Connect to same Wi-Fi** as your Raspberry Pi
2. **Open web browser** (Chrome, Safari, Firefox)
3. **Go to:** `http://192.168.1.100:3000` (replace with your Pi's IP)
4. **Login with same username and password** you used on the first device

#### **From Laptop/Computer:**
1. **Connect to same network** as your Raspberry Pi
2. **Open web browser**
3. **Go to:** `http://192.168.1.100:3000` (replace with your Pi's IP)
4. **Login with same credentials**

### **Step 3: Verify Access**
1. **Login successfully** - You should see your dashboard
2. **Check file list** - All your uploaded files should be visible
3. **Test download** - Click on any file to download and verify it opens correctly

---

## 🚨 Common Issues & Solutions

### **Issue: "Cannot decrypt file - encryption keys not available"**

**Symptoms:**
- Files show in dashboard but won't download
- Error message about missing encryption keys
- Downloads fail or show corrupted files

**Root Cause:** Not logged in properly on the current device

**Solution:**
```bash
# On the device having issues:
1. Click "Login Again" button in error message
2. OR go to: http://[PI_IP]:3000/auth/login
3. Enter EXACT same username and password
4. Try downloading file again
```

**Why this happens:**
- You're not logged in on this device
- You're logged in with a different username
- Your session expired
- Browser cached old session data

---

### **Issue: "File not found" or "Access Denied"**

**Symptoms:**
- Files don't appear in dashboard
- "File not found" errors
- Empty file list

**Root Cause:** Logged in with different user account

**Solution:**
1. **Check username** - Make sure you're using the same username as when you uploaded
2. **Logout and login again** with correct credentials
3. **Clear browser cache** if issues persist

---

### **Issue: Files appear corrupted or won't open**

**Symptoms:**
- Files download but won't open
- Images show as broken
- Documents appear corrupted

**Root Cause:** Wrong password used for decryption

**Solution:**
1. **Verify password** - Must be EXACTLY the same as when you uploaded
2. **Logout and login again** with correct password
3. **Check for typos** - Passwords are case-sensitive

---

## 📋 Cross-Device Checklist

### **Before Accessing from New Device:**
- [ ] **Same Wi-Fi network** - Device connected to same network as Pi
- [ ] **Pi IP address** - Know your Pi's IP address (`hostname -I`)
- [ ] **Correct credentials** - Have exact username and password ready
- [ ] **Pi is running** - PocketCloud service is active

### **When Accessing from New Device:**
- [ ] **Open browser** - Use any modern web browser
- [ ] **Navigate to Pi** - Go to `http://[PI_IP]:3000`
- [ ] **Login properly** - Use exact same username and password
- [ ] **Verify dashboard** - Check that your files are visible
- [ ] **Test download** - Download a file to verify it works

### **If Issues Occur:**
- [ ] **Check network** - Ensure same Wi-Fi network
- [ ] **Verify credentials** - Double-check username and password
- [ ] **Clear browser cache** - Remove old session data
- [ ] **Try incognito mode** - Test without cached data
- [ ] **Restart browser** - Close and reopen browser

---

## 🔧 Advanced Troubleshooting

### **Check Session Status**
If downloads fail, check if you're properly logged in:
1. **Go to dashboard** - Should show your username in top-right
2. **Check file list** - Should show all your uploaded files
3. **Look for encryption status** - Should show "Encryption: ✓ Enabled"

### **Clear Browser Data**
If persistent issues occur:
1. **Clear cookies** for your Pi's IP address
2. **Clear cache** for the site
3. **Try incognito/private mode**
4. **Try different browser**

### **Verify Network Connectivity**
```bash
# On the device having issues, test connectivity:
ping 192.168.1.100  # Replace with your Pi's IP

# Should show successful ping responses
```

### **Check Pi Status**
```bash
# On Raspberry Pi, verify PocketCloud is running:
sudo systemctl status pocketcloud

# Check logs for errors:
sudo journalctl -u pocketcloud -n 20
```

---

## 💡 Best Practices

### **For Reliable Cross-Device Access:**
1. **Use same credentials everywhere** - Never create multiple accounts
2. **Login fresh on each device** - Don't rely on saved sessions
3. **Verify before uploading** - Make sure you can download existing files first
4. **Use bookmarks** - Save `http://[PI_IP]:3000` as bookmark on each device
5. **Test regularly** - Verify access from all devices periodically

### **For Mobile Devices:**
1. **Add to home screen** - Makes access easier
2. **Use full browser** - Not in-app browsers (like Facebook browser)
3. **Enable desktop mode** if needed for better compatibility

### **For Security:**
1. **Logout when done** - Especially on shared devices
2. **Use private browsing** on public/shared devices
3. **Don't save passwords** in browsers on shared devices

---

## 🔍 Understanding the Technology

### **Why Same Password Works Everywhere**
```
Your Password → Scrypt Key Derivation → Master Key → File-Specific Keys
     ↓                    ↓                  ↓              ↓
Same Input         Same Algorithm      Same Output    Same Decryption
```

### **Session vs Encryption**
- **Session:** Temporary login state (device-specific)
- **Encryption:** Permanent file protection (password-based)
- **Key Point:** Sessions expire, but files remain encrypted with your password

### **Zero-Knowledge Design**
- **Server never stores your password**
- **Keys generated fresh on each login**
- **Same password = Same keys = Same access**
- **Different device = New session = Need to login again**

---

## 📞 Still Having Issues?

### **Diagnostic Information to Collect:**
1. **Device type** - Phone, tablet, laptop, etc.
2. **Browser** - Chrome, Safari, Firefox, etc.
3. **Network** - Same Wi-Fi as Pi?
4. **Error messages** - Exact text of any errors
5. **Pi logs** - Output from `sudo journalctl -u pocketcloud -n 20`

### **Quick Test:**
1. **Upload a small text file** from Device A
2. **Login on Device B** with same credentials
3. **Download the same file** on Device B
4. **Verify file opens correctly**

If this basic test works, your cross-device access is properly configured!

---

*Last updated: February 7, 2026*  
*For PocketCloud v1.0.0+*