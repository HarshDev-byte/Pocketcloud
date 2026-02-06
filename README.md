# PocketCloud

**PocketCloud encrypts your files automatically on external USB storage with zero cloud dependencies.**

Offline personal cloud storage system designed for Raspberry Pi.

## Features

- ✅ **Zero-knowledge encryption** (AES-256-GCM)
- ✅ Offline-first architecture
- ✅ Browser-based access (mobile + laptop)
- ✅ User authentication with bcrypt
- ✅ File upload, download, delete
- ✅ Storage usage tracking
- ✅ Lightweight and Pi-optimized
- ✅ No internet dependency
- ✅ Production-grade security

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: EJS templates + vanilla JS
- **Database**: SQLite
- **Storage**: Direct filesystem access
- **Auth**: Session-based with bcrypt

## Quick Start

```bash
# Install dependencies
npm install

# Run encryption tests (verify crypto works)
npm run test:crypto

# Start server
npm start

# Access at http://localhost:3000
```

### First Time Setup

1. Register new account (encryption enabled automatically)
2. Upload files (encrypted automatically)
3. Download files (decrypted automatically)

**That's it.** Encryption is transparent.

---

## Encryption

PocketCloud implements **production-grade, zero-knowledge encryption**:

- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key derivation:** scrypt (memory-hard, GPU-resistant)
- **Key hierarchy:** HKDF (unique key per file)
- **Security model:** Server never stores encryption keys

### What This Means

✅ **If someone steals your storage device:** Files are unreadable  
✅ **If someone steals your database:** No keys to extract  
✅ **If someone tampers with files:** Automatically detected  
✅ **If you forget your password:** Files are unrecoverable (by design)

### Documentation

- **Quick start:** See `ENCRYPTION_QUICKSTART.md`
- **Technical details:** See `ENCRYPTION.md`
- **Test suite:** Run `npm run test:crypto`

### Migration (Existing Users)

If you installed PocketCloud before encryption:

```bash
npm run migrate:encryption
```

This adds encryption support. Old files remain unencrypted (backward compatible).

---

1. Install Node.js (if not already installed):
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. Clone and setup:
```bash
cd pocketcloud
npm install
```

3. Start the server:
```bash
npm start
```

4. Access from any device on the same network:
```
http://<raspberry-pi-ip>:3000
```

### For Development (Windows/Mac/Linux)

```bash
npm install
npm run dev
```

Access at: `http://localhost:3000`

## Configuration

### Storage Path

By default, files are stored in `./storage`. To use external HDD/SSD:

```bash
export STORAGE_PATH=/mnt/pocketcloud
npm start
```

### Port Configuration

```bash
export PORT=8080
npm start
```

## Production Deployment

### Using PM2 (Recommended for Pi)

```bash
# Install PM2
sudo npm install -g pm2

# Start PocketCloud
pm2 start server.js --name pocketcloud

# Enable startup on boot
pm2 startup
pm2 save
```

### Configure as Wi-Fi Hotspot

For offline portability, configure your Pi as a Wi-Fi access point. Users can then connect directly to the Pi's network.

## Project Structure

```
pocketcloud/
├── config/
│   ├── database.js      # SQLite setup
│   └── storage.js       # File storage logic
├── middleware/
│   └── auth.js          # Authentication middleware
├── routes/
│   ├── index.js         # Landing page
│   ├── auth.js          # Login/register
│   └── files.js         # File operations
├── views/
│   ├── landing.ejs      # Home page
│   ├── login.ejs        # Login page
│   ├── register.ejs     # Registration
│   ├── files.ejs        # File dashboard
│   └── error.ejs        # Error page
├── public/
│   └── css/
│       └── style.css    # Styling
├── data/                # SQLite database (auto-created)
├── storage/             # User files (auto-created)
├── server.js            # Main server
└── package.json
```

## Security Notes

- **Encryption:** AES-256-GCM with zero-knowledge design
- **Passwords:** Hashed with bcrypt (authentication) + scrypt (encryption)
- **Session security:** httpOnly cookies, sameSite protection
- **Path traversal:** Explicit validation on all file operations
- **File integrity:** Authenticated encryption detects tampering
- **Network:** Local network only (no public internet exposure)
- **User isolation:** Complete separation between user files

## Quick Start

## Quick Start

**For Raspberry Pi OS 64-bit (February 2026):**

### 🎯 New User (Recommended)
```bash
# Complete interactive setup with detailed guidance
bash setup.sh
# Choose option 1: Interactive Setup
```

### ⚡ Experienced User
```bash
# Quick automated setup
bash setup.sh --quick

# Or run individual steps:
bash setup/check-requirements.sh        # 1. Check requirements
sudo bash setup/setup-usb-storage.sh    # 2. Set up USB storage  
sudo bash setup/install.sh              # 3. Install PocketCloud
bash tools/system-status.sh             # 4. Verify installation
```

**Access**: http://localhost:3000

### 📚 Documentation (Read First!)

- **[Complete Setup Guide 2026](docs/COMPLETE_SETUP_GUIDE_2026.md)** - Ultra-detailed instructions
- **[Pre-Setup Checklist](docs/PRE_SETUP_CHECKLIST.md)** - What to buy and prepare (printable)
- **[Visual Setup Guide](docs/VISUAL_SETUP_GUIDE.md)** - ASCII diagrams and visual instructions
- **[Troubleshooting 2026](docs/TROUBLESHOOTING_2026.md)** - Common problems and solutions
- **[Quick Start](docs/QUICKSTART.txt)** - Brief instructions for experienced users

### 🛠️ Management Tools
- **System status**: `bash tools/system-status.sh`
- **Create backup**: `sudo bash tools/backup-pocketcloud.sh`
- **Interactive help**: `bash setup.sh --docs`

**TL;DR for experienced users:**
```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Complete setup (interactive)
bash setup.sh

# Or manual steps:
sudo bash setup/setup-usb-storage.sh && sudo bash setup/install.sh
```

## Product Scope

PocketCloud 1.0.0 is feature-complete. The product provides automatic file encryption on external USB storage with backup/restore capability. No additional features will be added to the 1.x series.

**Core Promise:** PocketCloud encrypts your files automatically on external USB storage with zero cloud dependencies.

## License

MIT

## Academic Use

This project was developed as a mini-project for academic purposes, demonstrating:
- Embedded systems programming
- Web application development
- Offline-first architecture
- Raspberry Pi deployment
