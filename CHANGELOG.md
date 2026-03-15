# Changelog

All notable changes to PocketCloud Drive will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Work in progress features

### Changed
- Improvements to existing features

### Fixed
- Bug fixes

## [1.1.0] - 2024-02-01

### Added
- WebDAV server for native OS mounting
- Linux CLI client with GTK tray integration
- Battery monitoring for UPS HAT support
- Hardware interface layer (LED, OLED, buttons)
- Power management with graceful shutdown
- Real-time bandwidth monitoring and QoS
- Advanced search with full-text indexing
- File versioning and conflict resolution
- Webhook system for automation
- Developer API with SDK

### Changed
- Improved mobile PWA with offline support
- Enhanced security with fail2ban integration
- Better hardware optimization for Pi 4/5
- Faster startup and reduced memory usage

### Fixed
- Upload progress bar freezing on large files
- OLED display flickering on Pi 5
- WebDAV compatibility with macOS Finder
- Memory leaks in transcoding service

### Security
- Added API key authentication
- Improved input validation
- Enhanced CORS protection

## [1.0.0] - 2024-01-15

### Added
- Initial release of PocketCloud Drive
- Raspberry Pi OS image with pre-installed software
- Web-based file manager interface
- WiFi hotspot for device connectivity
- Real-time file synchronization
- Video streaming with HLS transcoding
- Photo and document viewing
- File sharing with password protection
- WebDAV server for network drive mounting
- Mobile-responsive Progressive Web App
- Zero-configuration setup
- Hardware optimization for Raspberry Pi 4/5
- Automatic USB storage detection and formatting
- Admin panel for system management
- Multi-user support with role-based access
- File encryption and secure storage
- Backup and restore functionality
- System monitoring and health checks
- Captive portal for easy device onboarding
- mDNS discovery for automatic device detection

### Technical Features
- Node.js backend with Express framework
- React frontend with TypeScript
- SQLite database with WAL mode
- FFmpeg integration for media processing
- nginx reverse proxy and static file serving
- systemd services for process management
- Comprehensive logging and error handling
- Performance monitoring and optimization
- Security hardening with firewall rules
- Automated testing and CI/CD pipeline

### Supported Platforms
- Raspberry Pi 4B (4GB+ recommended)
- Raspberry Pi 5 (all variants)
- Desktop clients: macOS, Windows, Linux
- Mobile: iOS Safari, Android Chrome
- Command-line interface for all platforms

### Hardware Requirements
- 32GB+ microSD card (Class 10/A1 minimum, A2 recommended)
- USB 3.0 storage drive (optional but recommended)
- 3A+ USB-C power supply or 20,000mAh power bank
- Ventilated case for optimal cooling

[Unreleased]: https://github.com/pocketcloud/pocketcloud/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/pocketcloud/pocketcloud/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/pocketcloud/pocketcloud/releases/tag/v1.0.0