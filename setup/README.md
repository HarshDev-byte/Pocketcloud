# PocketCloud Setup Scripts

This directory contains the installation scripts for setting up PocketCloud on Raspberry Pi OS 64-bit.

## Scripts

### `check-requirements.sh`
Comprehensive system requirements checker that verifies:
- Operating system compatibility (Raspberry Pi OS, Debian, Ubuntu)
- Hardware resources (RAM, CPU, disk space)
- Node.js version (18+)
- USB storage configuration
- Network and firewall status
- Service conflicts

**Usage:**
```bash
bash setup/check-requirements.sh
```

### `setup-usb-storage.sh`
Interactive USB drive setup script that:
- Detects available USB drives
- Formats drives as ext4 (with confirmation)
- Creates mount point at `/mnt/pocketcloud`
- Configures automatic mounting via fstab
- Sets proper permissions
- Tests write access

**Usage:**
```bash
sudo bash setup/setup-usb-storage.sh
```

### `install.sh`
Complete PocketCloud installation script that:
- Validates system requirements
- Creates `pocketcloud` system user
- Installs application files to `/opt/pocketcloud`
- Configures USB storage with symlinks
- Installs Node.js dependencies
- Sets up systemd service
- Configures firewall (UFW)
- Starts and verifies the service

**Usage:**
```bash
sudo bash setup/install.sh
```

## Quick Setup

For a complete automated setup, use the main setup script from the project root:

```bash
# From project root directory
bash setup.sh
```

This will run all three scripts in sequence with interactive prompts.

## Individual Steps

You can also run each script individually:

```bash
# 1. Check if your system is ready
bash setup/check-requirements.sh

# 2. Set up USB storage (requires root)
sudo bash setup/setup-usb-storage.sh

# 3. Install PocketCloud (requires root)
sudo bash setup/install.sh
```

## Requirements

- **OS**: Raspberry Pi OS 64-bit, Debian, or Ubuntu
- **Hardware**: Raspberry Pi 4 (2GB+ RAM recommended)
- **Storage**: External USB drive (32GB+ recommended)
- **Network**: Internet connection for Node.js packages
- **Software**: Node.js 18+ (installation script available)

## Troubleshooting

If any script fails:

1. Check the error messages - they usually indicate what's wrong
2. Ensure you're running with proper permissions (`sudo` where required)
3. Verify your USB drive is connected and working
4. Check that you have internet connectivity for package downloads
5. Review the logs: `sudo journalctl -u pocketcloud -n 50`

## After Installation

Once installation is complete:

- **Access PocketCloud**: http://localhost:3000
- **Check status**: `bash tools/system-status.sh`
- **View logs**: `sudo journalctl -u pocketcloud -f`
- **Create backup**: `sudo bash tools/backup-pocketcloud.sh`

## Files Created

The installation process creates:

- `/opt/pocketcloud/` - Application directory
- `/mnt/pocketcloud/` - USB storage mount point
- `/mnt/pocketcloud/pocketcloud-data/` - Database and config
- `/mnt/pocketcloud/pocketcloud-storage/` - User files
- `/etc/systemd/system/pocketcloud.service` - System service
- Entry in `/etc/fstab` for USB auto-mounting