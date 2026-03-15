# CLI Tool and Hardware Monitoring System

## Overview

Pocket Cloud Drive includes a professional command-line tool (`pcd-ctl`) and comprehensive hardware monitoring system designed specifically for Raspberry Pi 4B management.

## Part 1: CLI Tool (`pcd-ctl`)

### Installation

#### On Mac (for remote management)
```bash
# From project directory
./scripts/install-cli.sh

# Or manually
cp cli/pcd-ctl.sh /usr/local/bin/pcd-ctl
chmod +x /usr/local/bin/pcd-ctl
```

#### On Raspberry Pi (for local management)
```bash
# From project directory
sudo ./scripts/install-cli.sh

# Or manually
sudo cp cli/pcd-ctl.sh /usr/local/bin/pcd-ctl
sudo chmod +x /usr/local/bin/pcd-ctl
```

### First-Time Setup
```bash
pcd-ctl init
```
This will:
- Configure API URL (default: http://192.168.4.1:3000)
- Test connection to Pocket Cloud Drive
- Authenticate with admin credentials
- Save configuration to `~/.pcd-ctl.conf`

### Available Commands

#### System Status
```bash
pcd-ctl status              # Complete system overview
pcd-ctl health              # Health check (exit 0 if OK)
pcd-ctl temp                # CPU temperature with ASCII graph
```

#### Log Management
```bash
pcd-ctl logs                # Show recent logs
pcd-ctl logs --follow       # Follow logs in real-time
```

#### User Management
```bash
pcd-ctl users list          # List all users
pcd-ctl users create alice  # Create user (interactive)
pcd-ctl users delete alice  # Delete user (with confirmation)
```

#### Storage Management
```bash
pcd-ctl storage info        # Disk usage breakdown
pcd-ctl storage clean       # Run cleanup job
```

#### Backup Management
```bash
pcd-ctl backup now          # Create backup immediately
pcd-ctl backup list         # List available backups
pcd-ctl backup restore backup.db  # Restore from backup
```

#### WiFi Management
```bash
pcd-ctl wifi list           # Show connected clients
pcd-ctl wifi password newpass  # Change WiFi password
pcd-ctl wifi ssid "MyCloud"    # Change WiFi SSID
```

#### System Maintenance
```bash
pcd-ctl update              # Update from git (if using git deploy)
pcd-ctl help                # Show all commands
```

### CLI Features

#### Colorized Output
- ✓ Green for success messages
- ⚠ Yellow for warnings
- ✗ Red for errors
- ℹ Blue for information
- Automatic color detection (disabled in non-TTY environments)

#### Smart Error Handling
- Connection timeout detection
- API error parsing and display
- Graceful fallbacks for missing dependencies
- Clear error messages with suggested fixes

#### Cross-Platform Compatibility
- Works on macOS (zsh/bash)
- Works on Linux (Raspberry Pi)
- Automatic OS detection
- Platform-specific installation paths

#### Bash Completion
Automatically installed completion script supports:
- Command completion
- Subcommand completion
- Option completion (--follow, etc.)

### Configuration File

Location: `~/.pcd-ctl.conf`
```bash
# Pocket Cloud Drive CLI Configuration
API_URL="http://192.168.4.1:3000"
API_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
TIMEOUT="30"
```

### Dependencies
- `curl` - For API requests
- `jq` - For JSON parsing
- `bc` - For temperature calculations (optional)

Install on macOS: `brew install curl jq`
Install on Ubuntu: `sudo apt install curl jq`

## Part 2: Hardware Monitoring System

### Backend Implementation

#### Hardware Service (`backend/src/services/hardware.service.ts`)
Monitors Pi hardware every 5 seconds:

**CPU Metrics:**
- Temperature from `/sys/class/thermal/thermal_zone0/temp`
- Usage calculated from `/proc/stat` deltas
- Load average from `/proc/loadavg`

**Memory Metrics:**
- Total, available, used, buffers, cached from `/proc/meminfo`
- Real-time usage calculations

**Storage Metrics:**
- Disk usage from `df` command
- I/O statistics from `/proc/diskstats`
- Read/write speeds calculated from deltas

**Network Metrics:**
- Interface statistics from `/proc/net/dev`
- RX/TX bytes and speeds for wlan0
- Connected WiFi clients from `/proc/net/arp`

**System Metrics:**
- Uptime from `/proc/uptime`
- WiFi client list with hostname resolution

#### Thermal Protection System
Automatic thermal management:

- **Normal (< 55°C)**: All systems operational
- **Warning (55-70°C)**: Monitoring increased
- **Throttling (70-80°C)**: Upload processing throttled
- **Critical (> 80°C)**: Media processing paused
- **Emergency (> 85°C)**: All processing paused

Thermal events broadcast via WebSocket to admin connections.

#### API Endpoints (`backend/src/routes/hardware.routes.ts`)
```
GET /api/admin/hardware          # Current stats snapshot
GET /api/admin/hardware/history  # Last 5 minutes (60 data points)
GET /api/admin/hardware/thermal  # Thermal status
GET /api/admin/hardware/summary  # Key metrics summary
GET /api/admin/hardware/wifi-clients  # Connected devices
POST /api/admin/hardware/start   # Start monitoring
POST /api/admin/hardware/stop    # Stop monitoring
```

### Frontend Dashboard

#### Live Hardware Dashboard (`frontend/src/pages/admin/AdminSystem.tsx`)

**CPU Temperature Gauge:**
- Circular gauge (0-100°C)
- Color-coded: teal < 55°C, amber 55-70°C, red > 70°C
- Animated needle with CSS transforms
- "Throttling at 80°C" warning label

**CPU Usage Chart:**
- Real-time sparkline (last 60 seconds)
- Area chart using Recharts
- Current percentage in large text
- Load average display

**Memory Visualization:**
- Segmented progress bar: used | buffers/cache | free
- Pie chart breakdown
- Real-time usage numbers

**Network I/O:**
- Dual sparklines for upload/download
- Speed in MB/s
- Real-time throughput display

**Storage I/O:**
- Read/write speed sparklines
- Disk activity visualization
- Performance metrics

**WiFi Clients Panel:**
- Live connected device list
- IP addresses, MAC addresses, hostnames
- Connection count badge

#### Real-Time Updates
- WebSocket connection for live data
- 5-second update interval
- Automatic reconnection on disconnect
- Smooth animations and transitions

#### Thermal Warning System
- Red banner for critical temperatures
- Amber banner for warnings
- Auto-dismiss after 10 seconds
- Real-time temperature monitoring

### Performance Optimizations

#### Pi 4B Specific Optimizations
- Efficient file system reads
- Delta calculations for rates
- Circular buffer for history (memory-efficient)
- Debounced WebSocket broadcasts
- Minimal CPU overhead (< 1% usage)

#### Memory Management
- Fixed-size history buffers
- Automatic cleanup of old data
- Efficient data structures
- No memory leaks

#### Network Efficiency
- Compressed WebSocket messages
- Batched updates
- Client-side caching
- Minimal bandwidth usage

## Integration Points

### CLI ↔ Backend API
The CLI tool communicates with the backend via REST API:
- Authentication using JWT tokens
- JSON request/response format
- Error handling and retries
- Timeout management

### Hardware Service ↔ Realtime Service
Hardware monitoring integrates with WebSocket system:
```typescript
// Hardware stats broadcast
hardwareService.on('stats', (stats) => {
  realtimeService.broadcastHardwareStats(stats);
});

// Thermal warnings
hardwareService.on('thermal-warning', (status) => {
  realtimeService.broadcastThermalWarning(status);
});
```

### Frontend ↔ WebSocket
Real-time dashboard updates:
```typescript
// WebSocket message handling
if (data.type === 'HARDWARE_STATS') {
  setHardwareStats(data.data);
  updateCharts(data.data);
}
```

## Usage Examples

### Daily Operations
```bash
# Morning health check
pcd-ctl health && echo "System OK" || echo "Issues detected"

# Check overnight activity
pcd-ctl logs | grep ERROR

# Monitor temperature during heavy usage
pcd-ctl temp

# Weekly maintenance
pcd-ctl storage clean
pcd-ctl backup now
```

### Remote Management from Mac
```bash
# SSH tunnel for secure access
ssh -L 3000:localhost:3000 pi@192.168.4.1

# Configure CLI for tunneled connection
pcd-ctl init  # Use http://localhost:3000

# Remote monitoring
pcd-ctl status
pcd-ctl users list
pcd-ctl storage info
```

### Automated Monitoring
```bash
#!/bin/bash
# Health check script for cron
if ! pcd-ctl health >/dev/null 2>&1; then
    echo "Pocket Cloud Drive health check failed" | mail -s "Alert" admin@example.com
fi

# Add to crontab: */15 * * * * /path/to/health-check.sh
```

## Troubleshooting

### CLI Issues
```bash
# Connection problems
pcd-ctl init  # Reconfigure

# Permission errors
sudo pcd-ctl logs  # Run with sudo for system logs

# Missing dependencies
brew install curl jq  # macOS
sudo apt install curl jq  # Linux
```

### Hardware Monitoring Issues
```bash
# Check if service is running
curl http://192.168.4.1:3000/api/admin/hardware

# Restart hardware monitoring
curl -X POST http://192.168.4.1:3000/api/admin/hardware/start

# Check thermal status
pcd-ctl temp
```

### Dashboard Issues
- Refresh browser if WebSocket disconnects
- Check network connectivity to Pi
- Verify admin authentication
- Clear browser cache if needed

## Security Considerations

### CLI Security
- JWT tokens stored in `~/.pcd-ctl.conf` (mode 600)
- API communication over local network only
- Admin role required for all operations
- Rate limiting on API endpoints

### Hardware Monitoring Security
- Admin-only access to hardware endpoints
- No sensitive system information exposed
- Local network access only
- Audit logging of all admin actions

## Future Enhancements

### Planned CLI Features
- Interactive mode with menus
- Configuration profiles for multiple Pis
- Bulk operations (multi-user creation)
- Export/import functionality
- Plugin system for custom commands

### Planned Monitoring Features
- Historical data storage (SQLite)
- Performance alerts and notifications
- Custom dashboard layouts
- Mobile-optimized monitoring
- Integration with external monitoring systems

This comprehensive CLI and monitoring system provides professional-grade management capabilities for Pocket Cloud Drive, optimized specifically for Raspberry Pi 4B hardware constraints while maintaining excellent performance and usability.