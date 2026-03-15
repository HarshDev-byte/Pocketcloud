# PocketCloud Scripts

This directory contains scripts for managing, deploying, and maintaining PocketCloud installations.

## Directory Structure

### 🔧 [admin/](admin/)
Administrative and control scripts:
- `create-admin.ts` - Create admin user accounts
- `pcd-ctl.sh` - PocketCloud control script

### 🚀 [deployment/](deployment/)
Deployment and release scripts:
- `deploy.sh` - Production deployment
- `create-release.sh` - Create release packages
- `bundle-clients.sh` - Bundle client applications

### 💻 [development/](development/)
Development utilities:
- `dev-sync.sh` - Development file synchronization
- `dev-tunnel.sh` - Development tunneling

### 📊 [monitoring/](monitoring/)
System monitoring and logging:
- `health-check.sh` - System health checks
- `logs.sh` - Log management
- `status.sh` - System status reporting

### 🌐 [network/](network/)
Network configuration and management:
- `network-mode.sh` - Switch network modes
- `wifi-connect.sh` - WiFi connection management
- `captive-portal.sh` - Captive portal setup
- `firewall-setup.sh` - Firewall configuration

### ⚡ [optimization/](optimization/)
Performance optimization scripts:
- `optimize-pi.sh` - Raspberry Pi optimization
- `optimize-ram.sh` - Memory optimization
- `optimize-wifi.sh` - WiFi performance tuning
- `boot-report.sh` - Boot performance analysis

### 🛠️ [setup/](setup/)
Installation and setup scripts:
- `setup.sh` - Main setup script
- `setup-*.sh` - Component-specific setup
- `install-*.sh` - Installation scripts

### 🧪 [testing/](testing/)
Testing and validation scripts:
- `run-tests.sh` - Test execution
- `test-*.sh` - Specific test suites
- `benchmark.sh` - Performance benchmarking

### 🔧 [utilities/](utilities/)
General utility scripts:
- `cleanup.sh` - System cleanup
- `generate-icons.sh` - Icon generation
- `discover-pocketcloud.sh` - Device discovery
- `mount-examples.sh` - Mount examples
- `print-qr.sh` - QR code generation

## Usage

### Quick Commands

```bash
# System status
./scripts/monitoring/status.sh

# Health check
./scripts/monitoring/health-check.sh

# Deploy to production
./scripts/deployment/deploy.sh

# Run tests
./scripts/testing/run-tests.sh

# Optimize system
./scripts/optimization/optimize-pi.sh
```

### Script Conventions

- All scripts should be executable (`chmod +x`)
- Use `.sh` extension for shell scripts
- Use `.ts` extension for TypeScript scripts
- Include usage information in script headers
- Return appropriate exit codes (0 for success, non-zero for errors)

### Environment Variables

Many scripts use these common environment variables:

- `POCKETCLOUD_ENV` - Environment (development, production)
- `POCKETCLOUD_HOST` - Host IP address
- `POCKETCLOUD_PORT` - Service port
- `STORAGE_PATH` - Storage directory path
- `LOG_LEVEL` - Logging level

### Dependencies

Scripts may require:
- Node.js and npm
- Docker (for containerized deployments)
- System utilities (curl, wget, systemctl, etc.)
- PocketCloud-specific tools

## Development

### Adding New Scripts

1. Place scripts in the appropriate subdirectory
2. Follow naming conventions
3. Include proper error handling
4. Add usage documentation
5. Test thoroughly before committing

### Script Template

```bash
#!/bin/bash
# Script Name: example-script.sh
# Description: Brief description of what this script does
# Usage: ./example-script.sh [options]

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Functions
usage() {
    echo "Usage: $0 [options]"
    echo "Options:"
    echo "  -h, --help    Show this help message"
    exit 1
}

main() {
    # Script logic here
    echo "Script executed successfully"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Execute main function
main "$@"
```

## Troubleshooting

### Common Issues

1. **Permission denied**: Ensure scripts are executable
2. **Command not found**: Check if required tools are installed
3. **Environment variables**: Verify required env vars are set
4. **Path issues**: Use absolute paths or proper relative paths

### Getting Help

- Check script usage with `-h` or `--help` flag
- Review logs in `/var/log/pocketcloud/`
- Join our [Discord](https://discord.gg/pocketcloud) for support
- Create an issue on [GitHub](https://github.com/pocketcloud/pocketcloud/issues)

---

**Note**: Always test scripts in a development environment before running in production.