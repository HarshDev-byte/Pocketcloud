# PocketCloud Drive - macOS Menu Bar Application

A native macOS menu bar application for PocketCloud Drive that provides seamless integration with Finder, automatic folder synchronization, and native macOS notifications.

## Features

- **Menu Bar Integration**: Native macOS menu bar app with status indicators
- **WebDAV Mounting**: Mounts PocketCloud as a network drive in Finder
- **Auto-Discovery**: Finds PocketCloud devices automatically via mDNS/Bonjour
- **Folder Sync**: Automatic bidirectional sync with bandwidth throttling
- **Native Notifications**: macOS Notification Center integration
- **Drag & Drop**: Upload files by dragging to mounted volume
- **Universal Binary**: Supports both Apple Silicon and Intel Macs

## Requirements

- macOS 12.0+ (Monterey or later)
- PocketCloud backend server running on local network
- Node.js 18+ (for development)

## Installation

### From Release (Recommended)

1. Download the latest `.dmg` file from [Releases](https://github.com/pocketcloud/pocketcloud-mac/releases)
2. Open the DMG and drag PocketCloud Drive to Applications
3. Launch from Applications or Spotlight

### From Source

```bash
# Clone repository
git clone https://github.com/pocketcloud/pocketcloud-mac.git
cd pocketcloud-mac

# Install dependencies
npm install

# Build application
npm run build

# Run in development
npm run dev

# Build distributable
npm run dist:mac
```

## Development

### Project Structure

```
pocketcloud-mac/
├── src/
│   ├── main.ts          # Electron main process
│   ├── tray.ts          # Menu bar tray management
│   ├── discovery.ts     # Network device discovery
│   ├── sync.ts          # Folder synchronization
│   ├── mount.ts         # WebDAV mounting
│   ├── notifications.ts # Native notifications
│   └── preload.ts       # Context bridge
├── renderer/            # Settings window (React)
├── assets/              # Icons and resources
└── build/               # Build configuration
```

### Available Scripts

```bash
npm run dev              # Development mode with hot reload
npm run build            # Build for production
npm run build:main       # Build main process only
npm run build:renderer   # Build renderer process only
npm run pack             # Package without distribution
npm run dist             # Build DMG and ZIP distributables
npm run dist:mac         # Build macOS distributables only
npm run clean            # Clean build artifacts
npm run lint             # Run ESLint
npm run test             # Run tests
```

### Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Create Tray Icons** (if needed)
   ```bash
   cd assets
   ./create-simple-icons.sh
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Test Application**
   ```bash
   node test-app.js
   ```

## Configuration

The app stores settings in `~/Library/Application Support/pocketcloud-mac/config.json`:

```json
{
  "connection": {
    "lastKnownIP": "192.168.4.1",
    "username": "admin",
    "password": "",
    "autoConnect": true
  },
  "sync": {
    "enabled": true,
    "folder": "~/PocketCloud",
    "bandwidthLimit": 10,
    "ignorePatterns": [".DS_Store", ".Spotlight-V100", "._*", "Thumbs.db"]
  },
  "notifications": {
    "uploadComplete": true,
    "syncComplete": true,
    "lowStorage": true,
    "connectionLost": true
  },
  "startup": {
    "launchAtLogin": false
  }
}
```

## Menu Bar Interface

The menu bar shows PocketCloud status and provides quick actions:

```
● PocketCloud Drive          ← Status indicator
192.168.4.1 · 850GB free    ← Connection info
─────────────────────────
📂 Open in Browser          ← Web interface
🗂 Open in Finder           ← Mounted volume
─────────────────────────
⬆ Upload Files...          ← File upload
⬆ Upload Folder...         ← Folder upload
─────────────────────────
⟳ Sync: ~/PocketCloud      ← Sync toggle
Last synced: 2 min ago     ← Sync status
─────────────────────────
📊 Storage: ████░░ 15%     ← Storage usage
─────────────────────────
Preferences...             ← Settings window
Check for Updates          ← Auto-updater
─────────────────────────
Quit PocketCloud           ← Exit app
```

## WebDAV Integration

The app mounts PocketCloud as a WebDAV volume using macOS native mounting:

```bash
# Mounting command used internally
osascript -e 'mount volume "http://pocketcloud.local/webdav"'

# Volume appears in Finder at:
/Volumes/PocketCloud Drive
```

### Supported WebDAV Operations

- **PROPFIND**: Directory listing
- **GET**: File download
- **PUT**: File upload
- **DELETE**: File/folder deletion
- **MKCOL**: Create directories
- **MOVE**: Move/rename files
- **COPY**: Copy files

## Auto-Discovery

The app discovers PocketCloud devices using a three-method approach:

1. **mDNS/Bonjour**: `pocketcloud.local`
2. **Fixed IP**: `192.168.4.1` (default)
3. **Network Scan**: `192.168.4.2-20` range

Discovery runs every 10 seconds and caches the last known IP for faster reconnection.

## Folder Synchronization

### Sync Features

- **Bidirectional**: Changes sync both ways
- **Bandwidth Throttling**: Configurable upload speed limit
- **Conflict Resolution**: Keeps both versions with rename
- **File Filtering**: Ignores system files (.DS_Store, etc.)
- **Checksum Verification**: Ensures file integrity

### Sync Behavior

- **File Added**: Uploads to PocketCloud
- **File Modified**: Uploads new version
- **File Deleted**: Moves to PocketCloud trash (soft delete)
- **Startup**: Compares local vs remote files

## Notifications

Native macOS notifications for key events:

- **Upload Complete**: "✓ photo.jpg uploaded (2.3 MB)"
- **Sync Complete**: "✓ 12 files synced to PocketCloud"
- **Low Storage**: "⚠ PocketCloud storage almost full (95% used)"
- **Connection Lost**: "PocketCloud Drive disconnected"

## Building for Distribution

### Code Signing (Required for Distribution)

1. **Get Developer Certificate**
   ```bash
   # List available certificates
   security find-identity -v -p codesigning
   ```

2. **Configure Signing**
   ```json
   // In package.json build config
   "mac": {
     "identity": "Developer ID Application: Your Name (TEAM_ID)"
   }
   ```

3. **Build Signed App**
   ```bash
   npm run dist:mac
   ```

### Notarization (Required for macOS 10.15+)

```bash
# After building, notarize the app
xcrun notarytool submit build/PocketCloud\ Drive-1.0.0.dmg \
  --apple-id your-apple-id@example.com \
  --password app-specific-password \
  --team-id YOUR_TEAM_ID \
  --wait
```

## Troubleshooting

### Common Issues

1. **App Won't Start**
   - Check console for errors: `Console.app`
   - Verify all dependencies installed: `npm install`
   - Rebuild: `npm run clean && npm run build`

2. **Can't Find PocketCloud**
   - Check network connection
   - Verify PocketCloud is running
   - Try manual IP in Preferences

3. **WebDAV Mount Fails**
   - Check credentials in Preferences
   - Verify WebDAV server is running on PocketCloud
   - Try unmounting existing volumes: `diskutil list`

4. **Sync Not Working**
   - Check sync folder permissions
   - Verify network connectivity
   - Check bandwidth limit settings

### Debug Mode

```bash
# Run with debug logging
DEBUG=pocketcloud:* npm run dev

# Or set environment variable
export DEBUG=pocketcloud:*
npm run dev
```

### Log Files

- **Main Process**: `~/Library/Logs/pocketcloud-mac/main.log`
- **Renderer Process**: `~/Library/Logs/pocketcloud-mac/renderer.log`
- **System Console**: `Console.app` → Search "PocketCloud"

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Use ESLint configuration provided
- Test on both Apple Silicon and Intel Macs
- Ensure proper error handling
- Add appropriate logging

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/pocketcloud/pocketcloud-mac/issues)
- **Discussions**: [GitHub Discussions](https://github.com/pocketcloud/pocketcloud-mac/discussions)
- **Documentation**: [Wiki](https://github.com/pocketcloud/pocketcloud-mac/wiki)