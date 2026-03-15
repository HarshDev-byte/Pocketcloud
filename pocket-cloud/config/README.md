# PocketCloud Configuration

This directory contains configuration files and templates for PocketCloud.

## Configuration Files

### Environment Configuration
- **`.env.example`** - Environment variables template
  - Copy to `.env` for local development
  - Contains all configurable options with examples
  - Never commit actual `.env` files with secrets

### Hardware Configuration
- **`boot-config.txt`** - Raspberry Pi boot configuration
  - GPU memory split settings
  - Hardware acceleration options
  - Performance optimizations
  - Copy to `/boot/config.txt` on Pi

## Environment Variables

### Core Settings
```bash
# Server Configuration
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# Database
DATABASE_PATH=/mnt/pocketcloud/data/storage.db

# Storage
STORAGE_PATH=/mnt/pocketcloud/files
UPLOAD_PATH=/mnt/pocketcloud/uploads
```

### Security Settings
```bash
# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

# Session Management
SESSION_SECRET=your-session-secret
```

### Network Configuration
```bash
# Network Interfaces
WIFI_INTERFACE=wlan0
ETHERNET_INTERFACE=eth0

# Hotspot Settings
HOTSPOT_SSID=PocketCloud
HOTSPOT_PASSWORD=pocketcloud123
HOTSPOT_IP=192.168.4.1
```

### Media Processing
```bash
# FFmpeg Configuration
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
ENABLE_HARDWARE_ACCELERATION=true
VIDEO_TRANSCODE_PRESET=fast
```

### Performance Tuning
```bash
# File Upload Limits
MAX_FILE_SIZE=10737418240  # 10GB
MAX_FILES_PER_UPLOAD=100

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=1000

# Caching
ENABLE_COMPRESSION=true
ENABLE_CACHING=true
CACHE_TTL=3600
```

## Configuration Management

### Development Setup
1. Copy `.env.example` to `.env`
2. Modify values for your development environment
3. Never commit `.env` files

### Production Setup
1. Use environment variables or secure config management
2. Generate strong secrets for JWT and sessions
3. Configure appropriate file paths and limits
4. Enable security features (HTTPS, rate limiting, etc.)

### Raspberry Pi Setup
1. Copy `boot-config.txt` to `/boot/config.txt`
2. Adjust GPU memory based on your Pi model
3. Enable hardware acceleration for media processing
4. Reboot after configuration changes

## Security Considerations

### Secrets Management
- Use strong, randomly generated secrets
- Rotate secrets regularly
- Never commit secrets to version control
- Use environment variables in production

### File Permissions
- Ensure config files have appropriate permissions
- Restrict access to sensitive configuration
- Use dedicated service accounts

### Network Security
- Configure firewall rules appropriately
- Use strong WiFi passwords
- Enable HTTPS in production
- Implement proper CORS policies

## Configuration Validation

The application validates configuration on startup:
- Required environment variables
- File path accessibility
- Network interface availability
- External tool dependencies (FFmpeg, etc.)

### Validation Errors
Common configuration issues:
- Missing required environment variables
- Inaccessible file paths
- Invalid network configuration
- Missing external dependencies

## Environment-Specific Configurations

### Development
```bash
NODE_ENV=development
DEBUG=true
LOG_LEVEL=debug
ENABLE_CORS=true
```

### Production
```bash
NODE_ENV=production
DEBUG=false
LOG_LEVEL=info
ENABLE_HTTPS=true
```

### Testing
```bash
NODE_ENV=test
DATABASE_PATH=:memory:
STORAGE_PATH=./test-storage
```

## Backup and Recovery

### Configuration Backup
- Include configuration in system backups
- Document custom configuration changes
- Keep configuration templates updated

### Recovery Procedures
- Restore from known-good configuration
- Validate configuration after restore
- Test system functionality

## Troubleshooting

### Common Issues
1. **Invalid environment variables**: Check syntax and values
2. **Permission errors**: Verify file/directory permissions
3. **Network issues**: Check interface names and IP ranges
4. **Missing dependencies**: Install required system packages

### Debugging Configuration
```bash
# Check environment variables
printenv | grep POCKETCLOUD

# Validate configuration
npm run config:validate

# Test network configuration
./scripts/network/test-network.sh
```

## Contributing

When adding new configuration options:
1. Add to `.env.example` with documentation
2. Update this README
3. Add validation in the application
4. Document in relevant feature documentation

---

**Security Note**: Never commit actual configuration files with secrets. Always use templates and environment variables for sensitive data.