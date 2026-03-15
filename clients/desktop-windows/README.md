# PocketCloud Drive - Windows System Tray Application

Windows desktop application for seamless PocketCloud integration with system tray, WebDAV mounting, and folder synchronization.

## Features

### 🖥️ System Tray Integration
- **Right-click context menu** with all app functions
- **Left-click quick upload** for instant file sharing
- **Dynamic icon states** (connected/disconnected/syncing)
- **Jump list integration** for taskbar right-click
- **Balloon notifications** with Windows Toast support

### 💾 WebDAV Network Drive
- **Map as Network Drive** using Windows built-in WebDAV client
- **Two mounting methods** with automatic fallback:
  - Method A: Direct WebDAV via `net use` command
  - Method B: Registry tweak + WebClient service restart for HTTP support
- **Automatic drive letter assignment** (prefers P: for PocketCloud)
- **Persistent mounting** across reboots
- **Mount verification** and health monitoring

### 📁 Folder Synchronization
- **Real-time sync** using Chokidar file system watcher
- **Windows shell integration** - right-click any file → "Upload to PocketCloud"
- **Bandwidth throttling** (configurable MB/s limit)
- **Windows-specific file filtering** (Thumbs.db, desktop.ini, *.tmp files)
- **Conflict resolution** (keeps both files with timestamp)
- **Chunked upload** for large files with progress tracking

### 🔔 Windows Notifications
- **Windows 10/11 Toast notifications** with app icon
- **Action buttons** (Open Folder, View All) on notifications
- **Progress toasts** for uploads (updates in place)
- **Sound and visual feedback** for different event types
- **Notification preferences** in settings

### 🚀 Auto-Discovery & Connection
- **Zero-configuration discovery** using mDNS/Bonjour (pocketcloud.local)
- **Fallback to IP address** (192.168.4.1) if mDNS fails
- **Automatic reconnection** with exponential backoff
- **Connection health monitoring** every 10 seconds
- **Device information caching** (storage, uptime, version)

## Installation

### Requirements
- **Windows 10 or 11** (x64 or ARM64)
- **Node.js 18+** for development
- **Administrator privileges** for WebDAV HTTP support (one-time setup)

### Download & Install
1. Download `PocketCloud-Setup-1.0.0.exe` from releases
2. Run installer as Administrator (for WebDAV configuration)
3. Follow setup wizard:
   - Choose installation directory
   - Enable WebDAV network drive support (recommended)
   - Create desktop shortcut (optional)
4. Launch PocketCloud Drive from Start Menu or system tray

### Manual Installation
```bash
# Clone repository
git clone https://github.com/pocketcloud/pocketcloud-windows
cd pocketcloud-windows

# Install dependencies
npm install

# Build application
npm run build

# Package for distribution
npm run electron:dist
```

## Usage

### First Setup
1. **Launch application** - appears in system tray
2. **Right-click tray icon** → "Preferences" to open settings
3. **Configure connection**:
   - Hostname: `pocketcloud.local` (auto-discovered)
   - IP Address: `192.168.4.1` (fallback)
   - Port: `3000` (default)
   - Username/Password: your PocketCloud credentials
4. **Enable folder sync** and choose sync folder location
5. **Configure notifications** as desired

### Daily Usage
- **Upload files**: Left-click tray icon or right-click any file → "Upload to PocketCloud"
- **Access files**: Open mounted P: drive in File Explorer
- **Browse web interface**: Right-click tray → "Open in Browser"
- **Monitor sync**: Check tray icon status and tooltip

### WebDAV Network Drive
The installer automatically configures Windows for HTTP WebDAV support:

```powershell
# Manual WebDAV mount (if needed)
net use P: http://pocketcloud.local:3000/webdav /user:admin yourpassword /persistent:yes

# Verify mount
dir P:

# Unmount
net use P: /delete
```

### Shell Integration
After installation, right-click any file or folder:
- **"Upload to PocketCloud"** - uploads selected items
- Works in File Explorer, Desktop, and folder backgrounds

## Configuration

### Settings Window
Access via right-click tray icon → "Preferences":

#### Connection Tab
- Device status and information
- Hostname/IP configuration
- Port and credentials
- Connection testing

#### Sync & Drive Tab
- Enable/disable folder synchronization
- Sync folder location
- Bandwidth limiting
- WebDAV mount status

#### Notifications Tab
- Upload complete notifications
- Sync complete alerts
- Low storage warnings
- Connection lost notifications

#### Advanced Tab
- Auto-start with Windows
- Application version info
- Help and documentation links

### Registry Configuration
The installer configures these registry entries:

```registry
# WebDAV HTTP support
HKLM\SYSTEM\CurrentControlSet\Services\WebClient\Parameters
  BasicAuthLevel = 2

# Auto-start
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
  "PocketCloud Drive" = "C:\Program Files\PocketCloud\PocketCloud Drive.exe"

# Shell integration
HKCU\Software\Classes\*\shell\PocketCloudUpload
HKCU\Software\Classes\Directory\shell\PocketCloudUpload
```

## Development

### Build Commands
```bash
# Development mode
npm run dev

# Build main process
npm run build:main

# Build renderer process
npm run build:renderer

# Build everything
npm run build

# Package application
npm run electron:pack

# Create installer
npm run electron:dist

# Clean build files
npm run clean
```

### Project Structure
```
pocketcloud-win/
├── src/                    # Main process (Node.js)
│   ├── main.ts            # App coordination
│   ├── tray.ts            # System tray management
│   ├── discovery.ts       # Device discovery
│   ├── mount-windows.ts   # WebDAV mounting
│   ├── sync-windows.ts    # Folder synchronization
│   ├── notifications.ts   # Windows notifications
│   └── preload.ts         # IPC bridge
├── renderer/              # UI process (React)
│   ├── App.tsx           # Settings interface
│   ├── App.css           # Styles
│   └── index.html        # HTML template
├── assets/               # Icons and resources
├── installer/            # NSIS installer scripts
└── dist/                # Build output
```

### Architecture
- **Main Process**: Electron main process handles system integration
- **Renderer Process**: React-based settings UI
- **IPC Communication**: Secure bridge via preload script
- **Services**: Modular services for discovery, sync, mount, notifications
- **Event-Driven**: EventEmitter pattern for service communication

## Troubleshooting

### WebDAV Mount Issues
```powershell
# Check WebClient service
sc query webclient

# Start WebClient service
net start webclient

# Check registry setting
reg query "HKLM\SYSTEM\CurrentControlSet\Services\WebClient\Parameters" /v BasicAuthLevel

# Manual registry fix (as Administrator)
reg add "HKLM\SYSTEM\CurrentControlSet\Services\WebClient\Parameters" /v BasicAuthLevel /t REG_DWORD /d 2 /f
net stop webclient
net start webclient
```

### Connection Issues
1. **Check Windows Firewall** - ensure port 3000 is allowed
2. **Verify network adapter** - use correct network interface
3. **Test mDNS resolution**: `nslookup pocketcloud.local`
4. **Check PocketCloud device** - ensure it's powered on and connected

### Sync Problems
1. **Check sync folder permissions** - ensure write access
2. **Verify available disk space** - both local and remote
3. **Review ignored file patterns** - check if files are being filtered
4. **Monitor bandwidth limit** - adjust if uploads are slow

### Notification Issues
1. **Check Windows notification settings** - ensure app notifications are enabled
2. **Verify Focus Assist** - notifications may be suppressed
3. **Test notification**: Right-click tray → Preferences → Test Notification

## Building Installer

### Prerequisites
- **NSIS 3.0+** for Windows installer creation
- **Code signing certificate** (optional, for trusted installation)

### Build Process
```bash
# Build application
npm run build

# Create installer (requires NSIS)
npm run electron:dist

# Output files
build/
├── PocketCloud-Setup-1.0.0.exe        # NSIS installer
├── PocketCloud-1.0.0-portable.exe     # Portable version
├── PocketCloud-Setup-1.0.0-arm64.exe  # ARM64 installer
└── PocketCloud-1.0.0-portable-arm64.exe
```

### Code Signing
```bash
# Sign with certificate (optional)
signtool sign /f certificate.p12 /p password /t http://timestamp.digicert.com "PocketCloud-Setup-1.0.0.exe"
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [https://pocketcloud.local/help](https://pocketcloud.local/help)
- **Issues**: [GitHub Issues](https://github.com/pocketcloud/pocketcloud-windows/issues)
- **Discussions**: [GitHub Discussions](https://github.com/pocketcloud/pocketcloud-windows/discussions)