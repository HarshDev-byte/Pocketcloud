#!/bin/bash
set -euo pipefail

# Install and configure systemd services for PocketCloud

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_DIR="$SCRIPT_DIR/../systemd"

print_ok()   { echo -e "\033[1;32m✓\033[0m $1"; }
print_err()  { echo -e "\033[1;31m✗\033[0m $1"; exit 1; }

echo "Installing PocketCloud systemd services..."

# Copy service files
sudo cp "$SYSTEMD_DIR"/*.service /etc/systemd/system/
sudo cp "$SYSTEMD_DIR"/*.timer /etc/systemd/system/

print_ok "Service files copied"

# Create network watchdog script
sudo mkdir -p /opt/pocketcloud/scripts
sudo tee /opt/pocketcloud/scripts/network-watchdog.sh > /dev/null << 'EOF'
#!/bin/bash
# PocketCloud Network Watchdog
# Monitors and maintains network configuration

STORAGE_DIR="${POCKETCLOUD_STORAGE:-/mnt/pocketcloud}"
LOG_FILE="$STORAGE_DIR/logs/network-watchdog.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

check_hotspot() {
    # Check if wlan0 has hotspot IP
    if ip addr show wlan0 | grep -q "192.168.4.1"; then
        return 0
    else
        return 1
    fi
}

check_client_mode() {
    # Check if wlan0 has any IP (client mode)
    if ip addr show wlan0 | grep -q "inet.*scope global"; then
        return 0
    else
        return 1
    fi
}

heal_network() {
    log "Network healing triggered"
    
    # Check if any active transfers (don't interrupt)
    if pgrep -f "upload\|download" >/dev/null; then
        log "Active transfers detected, skipping network heal"
        return
    fi
    
    # Restart network services
    systemctl restart hostapd dnsmasq
    log "Network services restarted"
}

# Main monitoring loop
while true; do
    if ! check_hotspot && ! check_client_mode; then
        log "Network interface down, attempting heal"
        heal_network
    fi
    
    sleep 30
done
EOF

sudo chmod +x /opt/pocketcloud/scripts/network-watchdog.sh

# Reload systemd
sudo systemctl daemon-reload
print_ok "Systemd daemon reloaded"
# Enable services
sudo systemctl enable pocketcloud-backend
sudo systemctl enable pocketcloud-network-watch
sudo systemctl enable pocketcloud-cleanup.timer

print_ok "Services enabled"

# Start services
sudo systemctl start pocketcloud-backend
sudo systemctl start pocketcloud-network-watch
sudo systemctl start pocketcloud-cleanup.timer

print_ok "Services started"

# Wait for backend to be healthy
echo "Waiting for backend to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
        print_ok "Backend is healthy"
        break
    fi
    sleep 1
done

if ! curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
    print_err "Backend failed to start properly"
fi

echo "All services installed and running!"