#!/bin/bash

# WiFi Optimization Script for Raspberry Pi
# Optimizes WiFi settings for maximum throughput and QoS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root (use sudo)"
   exit 1
fi

# Detect WiFi interface
WIFI_INTERFACE=$(iw dev | awk '$1=="Interface"{print $2}' | head -n1)
if [[ -z "$WIFI_INTERFACE" ]]; then
    error "No WiFi interface found"
    exit 1
fi

log "Found WiFi interface: $WIFI_INTERFACE"

# Get country code (default to US if not set)
COUNTRY_CODE=${1:-US}
log "Using country code: $COUNTRY_CODE"

# Function to scan for least congested channel
find_best_channel() {
    log "Scanning for least congested 2.4GHz channel..."
    
    # Scan for networks and count by channel
    iw dev $WIFI_INTERFACE scan | grep -E "freq: 24[0-9][0-9]" | \
    awk '{
        freq = $2
        if (freq == 2412) ch = 1
        else if (freq == 2417) ch = 2
        else if (freq == 2422) ch = 3
        else if (freq == 2427) ch = 4
        else if (freq == 2432) ch = 5
        else if (freq == 2437) ch = 6
        else if (freq == 2442) ch = 7
        else if (freq == 2447) ch = 8
        else if (freq == 2452) ch = 9
        else if (freq == 2457) ch = 10
        else if (freq == 2462) ch = 11
        else if (freq == 2467) ch = 12
        else if (freq == 2472) ch = 13
        else if (freq == 2484) ch = 14
        else ch = 0
        if (ch > 0) count[ch]++
    }
    END {
        min_count = 999
        best_ch = 6
        for (ch in count) {
            if (count[ch] < min_count) {
                min_count = count[ch]
                best_ch = ch
            }
        }
        print best_ch
    }' 2>/dev/null || echo "6"
}

# Function to optimize hostapd configuration
optimize_hostapd() {
    local best_channel=$1
    local hostapd_conf="/etc/hostapd/hostapd.conf"
    
    if [[ ! -f "$hostapd_conf" ]]; then
        warn "hostapd.conf not found at $hostapd_conf"
        return 1
    fi

    log "Optimizing hostapd configuration..."
    
    # Backup original config
    cp "$hostapd_conf" "${hostapd_conf}.backup.$(date +%s)"
    
    # Create optimized configuration
    cat > "$hostapd_conf" << EOF
# Optimized hostapd configuration for Pocket Cloud Drive
interface=$WIFI_INTERFACE
driver=nl80211

# Network settings
ssid=PocketCloud
hw_mode=g
channel=$best_channel
country_code=$COUNTRY_CODE

# Security
wpa=2
wpa_passphrase=pocketcloud123
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP

# Performance optimizations
ieee80211n=1
wmm_enabled=1
ht_capab=[HT40][SHORT-GI-20][SHORT-GI-40][DSSS_CCK-40]

# QoS settings
wmm_ac_bk_cwmin=4
wmm_ac_bk_cwmax=10
wmm_ac_bk_aifs=7
wmm_ac_bk_txop_limit=0
wmm_ac_bk_acm=0

wmm_ac_be_aifs=3
wmm_ac_be_cwmin=4
wmm_ac_be_cwmax=6
wmm_ac_be_txop_limit=0
wmm_ac_be_acm=0

wmm_ac_vi_aifs=2
wmm_ac_vi_cwmin=3
wmm_ac_vi_cwmax=4
wmm_ac_vi_txop_limit=94
wmm_ac_vi_acm=0

wmm_ac_vo_aifs=2
wmm_ac_vo_cwmin=2
wmm_ac_vo_cwmax=3
wmm_ac_vo_txop_limit=47
wmm_ac_vo_acm=0

# Additional optimizations
ignore_broadcast_ssid=0
max_num_sta=20
beacon_int=100
dtim_period=2
rts_threshold=2347
fragm_threshold=2346
EOF

    success "hostapd configuration optimized (channel $best_channel)"
}

# Function to set regulatory domain
set_regulatory_domain() {
    log "Setting regulatory domain to $COUNTRY_CODE..."
    
    # Set regulatory domain
    iw reg set $COUNTRY_CODE
    
    # Make it persistent
    echo "REGDOMAIN=$COUNTRY_CODE" > /etc/default/crda
    
    success "Regulatory domain set to $COUNTRY_CODE"
}

# Function to optimize WiFi interface settings
optimize_interface() {
    log "Optimizing WiFi interface settings..."
    
    # Set transmit power to maximum allowed
    iw dev $WIFI_INTERFACE set txpower fixed 2000 2>/dev/null || \
    iw dev $WIFI_INTERFACE set txpower auto
    
    # Enable 802.11n features if available
    iw dev $WIFI_INTERFACE set bitrates legacy-2.4 54 2>/dev/null || true
    
    success "WiFi interface optimized"
}

# Function to optimize TCP settings
optimize_tcp() {
    log "Optimizing TCP settings for WiFi..."
    
    # Backup original sysctl.conf
    cp /etc/sysctl.conf /etc/sysctl.conf.backup.$(date +%s) 2>/dev/null || true
    
    # Add WiFi-optimized TCP settings
    cat >> /etc/sysctl.conf << EOF

# WiFi optimizations for Pocket Cloud Drive
# Increase network buffer sizes
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=262144
net.core.wmem_default=262144

# TCP buffer sizes (min, default, max)
net.ipv4.tcp_rmem=4096 87380 16777216
net.ipv4.tcp_wmem=4096 65536 16777216

# Enable TCP window scaling
net.ipv4.tcp_window_scaling=1

# Enable selective acknowledgments
net.ipv4.tcp_sack=1

# Enable timestamps
net.ipv4.tcp_timestamps=1

# Increase TCP congestion window
net.ipv4.tcp_congestion_control=bbr

# Reduce TCP keepalive time
net.ipv4.tcp_keepalive_time=600
net.ipv4.tcp_keepalive_probes=3
net.ipv4.tcp_keepalive_intvl=90

# Optimize for WiFi latency
net.ipv4.tcp_low_latency=1
net.ipv4.tcp_no_delay_ack=1

# Increase network device queue length
net.core.netdev_max_backlog=5000
net.core.netdev_budget=600
EOF

    # Apply settings immediately
    sysctl -p /etc/sysctl.conf >/dev/null
    
    success "TCP settings optimized"
}

# Function to optimize WiFi power management
optimize_power_management() {
    log "Optimizing WiFi power management..."
    
    # Disable WiFi power saving
    iw dev $WIFI_INTERFACE set power_save off 2>/dev/null || true
    
    # Make it persistent by adding to rc.local
    if ! grep -q "iw dev.*set power_save off" /etc/rc.local 2>/dev/null; then
        sed -i '/^exit 0/i iw dev '"$WIFI_INTERFACE"' set power_save off 2>/dev/null || true' /etc/rc.local
    fi
    
    success "WiFi power management optimized"
}

# Function to optimize network queues
optimize_queues() {
    log "Optimizing network queue discipline..."
    
    # Install fq_codel (fair queuing with controlled delay)
    tc qdisc replace dev $WIFI_INTERFACE root fq_codel 2>/dev/null || true
    
    # Create script to apply on boot
    cat > /etc/systemd/system/wifi-qos.service << EOF
[Unit]
Description=WiFi QoS Optimization
After=network.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'tc qdisc replace dev $WIFI_INTERFACE root fq_codel'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

    systemctl enable wifi-qos.service >/dev/null 2>&1 || true
    
    success "Network queues optimized"
}

# Function to create monitoring script
create_monitoring_script() {
    log "Creating WiFi monitoring script..."
    
    cat > /usr/local/bin/wifi-monitor.sh << 'EOF'
#!/bin/bash

# WiFi Performance Monitor
INTERFACE=$(iw dev | awk '$1=="Interface"{print $2}' | head -n1)

if [[ -z "$INTERFACE" ]]; then
    echo "No WiFi interface found"
    exit 1
fi

echo "WiFi Performance Report - $(date)"
echo "=================================="

# Interface status
echo "Interface: $INTERFACE"
echo "Status: $(cat /sys/class/net/$INTERFACE/operstate)"

# Signal info (if in station mode)
if iw dev $INTERFACE info | grep -q "type managed"; then
    iw dev $INTERFACE link 2>/dev/null | grep -E "(Connected|signal|tx bitrate|rx bitrate)" || echo "Not connected"
fi

# Channel and frequency
iw dev $INTERFACE info | grep -E "(channel|freq)"

# Transmit power
iw dev $INTERFACE info | grep "txpower"

# Network statistics
echo -e "\nNetwork Statistics:"
cat /proc/net/dev | grep $INTERFACE | awk '{
    printf "RX: %d bytes (%d packets)\n", $2, $3
    printf "TX: %d bytes (%d packets)\n", $10, $11
    printf "RX errors: %d, TX errors: %d\n", $4, $12
}'

# Active connections
echo -e "\nActive Connections:"
ss -tuln | grep -E ":(80|443|8080|3000)" | wc -l | xargs echo "HTTP/HTTPS connections:"

# Load average
echo -e "\nSystem Load:"
uptime

# Memory usage
echo -e "\nMemory Usage:"
free -h | grep Mem

# Temperature (Pi specific)
if [[ -f /sys/class/thermal/thermal_zone0/temp ]]; then
    temp=$(cat /sys/class/thermal/thermal_zone0/temp)
    temp_c=$((temp / 1000))
    echo -e "\nCPU Temperature: ${temp_c}°C"
fi
EOF

    chmod +x /usr/local/bin/wifi-monitor.sh
    
    success "WiFi monitoring script created at /usr/local/bin/wifi-monitor.sh"
}

# Main optimization process
main() {
    log "Starting WiFi optimization for Pocket Cloud Drive..."
    
    # Find best channel
    BEST_CHANNEL=$(find_best_channel)
    log "Best channel found: $BEST_CHANNEL"
    
    # Apply optimizations
    set_regulatory_domain
    optimize_interface
    optimize_hostapd $BEST_CHANNEL
    optimize_tcp
    optimize_power_management
    optimize_queues
    create_monitoring_script
    
    # Restart services
    log "Restarting network services..."
    systemctl restart hostapd 2>/dev/null || warn "Could not restart hostapd"
    systemctl restart dnsmasq 2>/dev/null || warn "Could not restart dnsmasq"
    
    success "WiFi optimization completed!"
    
    echo ""
    echo "Optimization Summary:"
    echo "===================="
    echo "• Regulatory domain: $COUNTRY_CODE"
    echo "• Optimal channel: $BEST_CHANNEL"
    echo "• 802.11n enabled with HT40"
    echo "• WMM/QoS enabled"
    echo "• TCP buffers optimized"
    echo "• Power saving disabled"
    echo "• Fair queuing enabled"
    echo ""
    echo "To monitor WiFi performance:"
    echo "  sudo /usr/local/bin/wifi-monitor.sh"
    echo ""
    echo "To test bandwidth:"
    echo "  # On Pi:"
    echo "  iperf3 -s"
    echo "  # On client:"
    echo "  iperf3 -c <pi-ip-address>"
    echo ""
    
    warn "Reboot recommended to ensure all optimizations take effect"
}

# Run main function
main "$@"