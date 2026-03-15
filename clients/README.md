# PocketCloud Client Applications

This directory contains client applications for different platforms that connect to PocketCloud servers.

## Available Clients

### 🖥️ Desktop Clients

- **[desktop-mac/](desktop-mac/)** - macOS desktop client (Electron-based)
  - System tray integration
  - WebDAV mounting
  - Automatic discovery
  - Native notifications

- **[desktop-windows/](desktop-windows/)** - Windows desktop client (Electron-based)
  - System tray integration
  - Network drive mapping
  - Background sync
  - Windows notifications

- **[desktop-linux/](desktop-linux/)** - Linux desktop client (GTK-based)
  - System tray integration
  - GNOME/KDE compatibility
  - Native file manager integration

### 💻 Command Line Interface

- **[cli/](cli/)** - Cross-platform CLI client
  - File upload/download
  - Folder synchronization
  - Encryption support
  - Scripting-friendly

## Quick Start

### Desktop Clients

1. Download the appropriate client for your platform
2. Install and run the application
3. The client will automatically discover PocketCloud devices on your network
4. Connect and start syncing

### CLI Client

```bash
# Install globally
npm install -g @pocketcloud/cli

# Connect to your PocketCloud
pcd connect pocketcloud.local

# Upload files
pcd put ./documents /remote/documents

# Download files
pcd get /remote/photos ./local-photos

# Sync folders
pcd sync ./local-folder /remote/folder
```

## Development

Each client has its own development setup. See the README in each directory for specific instructions.

### Building All Clients

```bash
# From project root
./scripts/build-clients.sh
```

### Testing Clients

```bash
# Test individual clients
cd clients/desktop-mac && npm test
cd clients/cli && npm test

# Test all clients
npm run test:clients
```

## Architecture

All clients share common patterns:

- **Discovery**: Automatic PocketCloud server discovery via mDNS
- **Authentication**: JWT-based authentication with the server
- **Sync**: Real-time file synchronization
- **Encryption**: Optional end-to-end encryption
- **Offline**: Offline-first design with conflict resolution

## Platform-Specific Features

| Feature | macOS | Windows | Linux | CLI |
|---------|-------|---------|-------|-----|
| System Tray | ✅ | ✅ | ✅ | ❌ |
| File System Integration | ✅ | ✅ | ✅ | ❌ |
| Background Sync | ✅ | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ | ❌ |
| Auto-start | ✅ | ✅ | ✅ | ❌ |
| WebDAV Mounting | ✅ | ✅ | ✅ | ❌ |
| Scripting | ❌ | ❌ | ❌ | ✅ |

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for general guidelines.

### Client-Specific Guidelines

- Follow platform conventions (HIG for macOS, Material Design for Linux, etc.)
- Maintain consistent UX across platforms
- Test on the target platform thoroughly
- Use platform-native APIs where possible
- Ensure accessibility compliance

## Distribution

Clients are distributed through:

- **GitHub Releases**: Pre-built binaries for all platforms
- **Package Managers**: Homebrew (macOS), Chocolatey (Windows), APT/RPM (Linux)
- **App Stores**: Mac App Store, Microsoft Store (planned)
- **NPM**: CLI client available via npm

## Support

For client-specific issues:

1. Check the client's README for troubleshooting
2. Search existing [Issues](https://github.com/pocketcloud/pocketcloud/issues)
3. Create a new issue with platform details
4. Join our [Discord](https://discord.gg/pocketcloud) for community support