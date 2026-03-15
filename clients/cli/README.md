# PocketCloud Drive CLI (pcd)

Universal Linux command-line client for PocketCloud Drive. Works on Ubuntu 20.04+, Kali Linux 2023+, Debian 11+, Raspberry Pi OS, and any Debian-based distribution.

## Features

### 🖥️ **Universal Compatibility**
- Works on ALL Linux distributions (even headless servers)
- Single compiled binary - no Node.js required
- Supports x64 and ARM64 architectures
- Offline installation from PocketCloud device

### 📁 **Complete File Operations**
- `pcd ls` - List files with detailed formatting
- `pcd get` - Download files with resume support
- `pcd put` - Upload files with chunking and resume
- `pcd rm` - Delete files (to trash or permanent)
- `pcd mv` - Move/rename files and folders
- `pcd cp` - Copy files and folders
- `pcd mkdir` - Create directories

### 🔄 **Advanced Sync & Mount**
- `pcd sync` - Two-way folder synchronization
- `pcd mount` - WebDAV mounting via davfs2
- `pcd watch` - Real-time folder monitoring
- Resume interrupted transfers automatically

### 🔍 **Discovery & Management**
- `pcd connect` - Auto-discover PocketCloud devices
- `pcd status` - System status and storage info
- `pcd search` - Search files by name/content
- `pcd share` - Create share links

### 🛡️ **Kali Linux Security Features**
- `pcd secure-wipe` - DoD 3-pass secure deletion
- `pcd encrypt` - AES-256 encryption before upload
- `pcd decrypt` - Download and decrypt files
- `pcd audit` - View security audit logs
- `pcd stealth` - Connect without mDNS broadcast

## Installation

### One-Line Install (Recommended)
```bash
curl -fsSL http://192.168.4.1/downloads/install.sh | bash
```

### Manual Installation
```bash
# Download CLI binary
curl -fsSL http://192.168.4.1/downloads/pcd-linux-$(uname -m | sed 's/x86_64/x64/') -o pcd
chmod +x pcd
sudo mv pcd /usr/local/bin/

# Install dependencies
sudo apt install davfs2 avahi-utils
```

### From Source
```bash
git clone https://github.com/pocketcloud/pcd-cli
cd pcd-cli
npm install
npm run build:binary
```

## Quick Start

1. **Connect to PocketCloud**
   ```bash
   pcd connect
   # Auto-discovers device and prompts for credentials
   ```

2. **List files**
   ```bash
   pcd ls                    # List root directory
   pcd ls /Documents         # List specific folder
   pcd ls -l                 # Long format with details
   ```

3. **Upload files**
   ```bash
   pcd put myfile.pdf        # Upload to root
   pcd put myfile.pdf /docs/ # Upload to specific folder
   pcd put largefile.zip     # Chunked upload with progress
   ```

4. **Download files**
   ```bash
   pcd get /docs/report.pdf  # Download to current directory
   pcd get /docs/report.pdf ./downloads/  # Download to specific location
   ```

5. **Sync folders**
   ```bash
   pcd sync ~/Documents /Documents  # Two-way sync
   pcd sync ~/Photos /Photos --watch  # Continuous sync
   ```

## Usage Examples

### File Operations
```bash
# Upload with progress bar
pcd put largefile.zip
# [████████████░░░░░░░░] 62% · 8.3 MB/s · 23s remaining

# Resume interrupted upload
pcd put largefile.zip --resume

# Download with resume
pcd get /backup/database.sql --resume

# List files in detailed format
pcd ls -l /Documents
# drwxr-xr-x  Photos/           2 days ago
# -rw-r--r--  vacation.mp4  4.2GB  1 hour ago
# -rw-r--r--  report.pdf    2.1MB  3 days ago
```

### Folder Sync
```bash
# Sync with confirmation
pcd sync ~/Documents /Documents
# Scanning local...  847 files
# Scanning remote... 831 files
#   → Upload 16 new files
#   → Update 3 changed files
#   → Skip 828 unchanged files
# Proceed? [Y/n]

# Dry run (show what would be synced)
pcd sync ~/Documents /Documents --dry-run

# Exclude patterns
pcd sync ~/Documents /Documents --exclude "*.tmp,*.log"
```

### WebDAV Mounting
```bash
# Mount PocketCloud as filesystem
pcd mount ~/pocketcloud

# Manual mount with davfs2
mount ~/pocketcloud
# Now access files at ~/pocketcloud/

# Unmount
pcd mount --unmount
```

### System Status
```bash
# Show status
pcd status
# PocketCloud Status
# ==================
# Connection:  pocketcloud.local:3000
# Status:      Connected
# Uptime:      2d 14h 32m
# Storage:     45GB free of 64GB
# CPU:         12.3%
# Memory:      34.7%
# Temp:        42°C

# JSON output
pcd status --json

# Watch status (updates every 5s)
pcd status --watch
```

### Kali Linux Security Features
```bash
# Secure wipe (DoD 3-pass overwrite)
pcd secure-wipe /sensitive/data.txt --passes 3

# Encrypt before upload
pcd encrypt secret.pdf --password mypassword

# Download and decrypt
pcd decrypt /encrypted/secret.pdf.enc --password mypassword

# View audit log
pcd audit --days 7 --action encrypt

# Stealth connection (no mDNS)
pcd stealth 192.168.1.100
```

## Configuration

Configuration is stored in `~/.config/pocketcloud/config.json`:

```json
{
  "host": "pocketcloud.local",
  "ip": "192.168.4.1",
  "port": 3000,
  "username": "admin",
  "token": "...",
  "chunkSize": 10,
  "debug": false,
  "stealthMode": false,
  "encryptionEnabled": false
}
```

### Environment Variables
- `POCKETCLOUD_HOST` - Override default host
- `POCKETCLOUD_PORT` - Override default port
- `POCKETCLOUD_DEBUG` - Enable debug logging

## WebDAV Integration

PocketCloud can be mounted as a standard filesystem using davfs2:

```bash
# Install davfs2
sudo apt install davfs2

# Add credentials (done by installer)
echo "http://192.168.4.1/webdav admin" >> ~/.davfs2/secrets

# Mount manually
sudo mount -t davfs http://192.168.4.1/webdav ~/pocketcloud

# Auto-mount via fstab
echo "http://192.168.4.1/webdav /home/user/pocketcloud davfs user,rw,noauto 0 0" | sudo tee -a /etc/fstab
```

## Platform Support

### Tested Distributions
- ✅ Ubuntu 20.04 LTS, 22.04 LTS, 24.04 LTS
- ✅ Kali Linux 2023.1+, 2024.1+
- ✅ Debian 11 (Bullseye), 12 (Bookworm)
- ✅ Raspberry Pi OS (32-bit and 64-bit)
- ✅ Linux Mint 20+, 21+
- ✅ Pop!_OS 20.04+, 22.04+

### Architecture Support
- ✅ x86_64 (Intel/AMD 64-bit)
- ✅ aarch64 (ARM 64-bit)
- ✅ armv7l (ARM 32-bit) - uses ARM64 binary

### Requirements
- Linux kernel 3.10+ (any modern distribution)
- glibc 2.17+ (included in all supported distributions)
- Optional: davfs2 for WebDAV mounting
- Optional: avahi-utils for mDNS discovery

## Troubleshooting

### Connection Issues
```bash
# Test connectivity
ping pocketcloud.local
curl http://192.168.4.1:3000/api/health

# Force IP connection
pcd connect 192.168.4.1

# Stealth mode (no mDNS)
pcd stealth 192.168.4.1
```

### Authentication Problems
```bash
# Clear stored credentials
rm ~/.config/pocketcloud/config.json
pcd connect

# Debug mode
POCKETCLOUD_DEBUG=1 pcd connect
```

### Upload/Download Issues
```bash
# Check resume state
ls ~/.config/pocketcloud/uploads/

# Force fresh upload
pcd put file.zip --no-resume

# Smaller chunks for slow connections
pcd put file.zip --chunk-size 5
```

### WebDAV Mount Issues
```bash
# Check davfs2 installation
which mount.davfs

# Test manual mount
sudo mount -t davfs http://192.168.4.1/webdav /mnt/test

# Check credentials
cat ~/.davfs2/secrets
```

## Development

### Building from Source
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Create binary
npm run build:binary

# Test
./build/pcd-linux-x64 --version
```

### Project Structure
```
pcd-cli/
├── src/
│   ├── commands/          # CLI command implementations
│   ├── lib/              # Core libraries
│   │   ├── api.ts        # API client
│   │   ├── config.ts     # Configuration management
│   │   ├── upload.ts     # Chunked upload
│   │   ├── download.ts   # Resumable download
│   │   ├── progress.ts   # Progress bars
│   │   ├── discover.ts   # Device discovery
│   │   └── auth.ts       # Authentication
│   └── index.ts          # Main CLI entry point
├── package.json          # Dependencies and build config
└── tsconfig.json         # TypeScript configuration
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: Available at your PocketCloud web interface
- **Issues**: Report bugs via the web interface or CLI
- **Community**: Join discussions in the PocketCloud community