#!/bin/bash

# PocketCloud System Status Checker
# Quick health check for running PocketCloud installation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check service status
check_service() {
    echo "🔧 PocketCloud Service Status"
    echo "============================="
    
    if systemctl is-active --quiet pocketcloud; then
        log_success "PocketCloud service is running"
        
        # Show uptime
        local uptime=$(systemctl show pocketcloud --property=ActiveEnterTimestamp --value)
        if [[ -n "$uptime" ]]; then
            echo "   Started: $uptime"
        fi
        
        # Show memory usage
        local memory=$(systemctl show pocketcloud --property=MemoryCurrent --value)
        if [[ -n "$memory" && "$memory" != "[not set]" ]]; then
            local memory_mb=$((memory / 1024 / 1024))
            echo "   Memory usage: ${memory_mb}MB"
        fi
        
    else
        log_error "PocketCloud service is not running"
        echo "   Start with: sudo systemctl start pocketcloud"
        echo "   Check logs: sudo journalctl -u pocketcloud -n 20"
    fi
    
    # Check if enabled for startup
    if systemctl is-enabled --quiet pocketcloud; then
        log_success "Service enabled for startup"
    else
        log_warning "Service not enabled for startup"
        echo "   Enable with: sudo systemctl enable pocketcloud"
    fi
    
    echo
}

# Check network connectivity
check_network() {
    echo "🌐 Network Status"
    echo "================="
    
    # Check if port 3000 is listening
    if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
        log_success "Port 3000 is listening"
        
        # Show which process is using it
        local process=$(netstat -tlnp 2>/dev/null | grep ":3000 " | awk '{print $7}' | head -1)
        if [[ -n "$process" ]]; then
            echo "   Process: $process"
        fi
    else
        log_error "Port 3000 is not listening"
        echo "   PocketCloud may not be running or may be using a different port"
    fi
    
    # Test local connectivity
    if curl -s --connect-timeout 5 http://localhost:3000/health > /dev/null 2>&1; then
        log_success "Local health check passed"
    else
        log_warning "Local health check failed"
        echo "   Service may still be starting or there may be an issue"
    fi
    
    # Show IP addresses
    local ip_addresses=$(hostname -I)
    echo "   Local IP addresses: $ip_addresses"
    
    # Show access URLs
    for ip in $ip_addresses; do
        echo "   Access URL: http://$ip:3000"
    done
    
    echo
}

# Check USB storage
check_storage() {
    echo "💾 Storage Status"
    echo "================="
    
    # Check if mount point exists and is mounted
    if mountpoint -q /mnt/pocketcloud 2>/dev/null; then
        log_success "USB storage is mounted at /mnt/pocketcloud"
        
        # Show filesystem info
        local fs_info=$(df -h /mnt/pocketcloud | tail -1)
        local device=$(echo $fs_info | awk '{print $1}')
        local size=$(echo $fs_info | awk '{print $2}')
        local used=$(echo $fs_info | awk '{print $3}')
        local free=$(echo $fs_info | awk '{print $4}')
        local percent=$(echo $fs_info | awk '{print $5}')
        
        echo "   Device: $device"
        echo "   Size: $size, Used: $used, Free: $free ($percent full)"
        
        # Check filesystem type
        local fstype=$(df -T /mnt/pocketcloud | tail -1 | awk '{print $2}')
        echo "   Filesystem: $fstype"
        
        if [[ "$fstype" == "ext4" ]]; then
            log_success "Optimal filesystem (ext4)"
        elif [[ "$fstype" == "ext3" ]]; then
            log_warning "Supported filesystem (ext3) - ext4 recommended"
        else
            log_warning "Non-optimal filesystem ($fstype) - ext4 recommended"
        fi
        
        # Check if PocketCloud directories exist
        if [[ -d "/mnt/pocketcloud/pocketcloud-data" ]]; then
            log_success "Data directory exists"
            local data_size=$(du -sh /mnt/pocketcloud/pocketcloud-data 2>/dev/null | awk '{print $1}')
            echo "   Data size: $data_size"
        else
            log_warning "Data directory not found"
        fi
        
        if [[ -d "/mnt/pocketcloud/pocketcloud-storage" ]]; then
            log_success "Storage directory exists"
            local storage_size=$(du -sh /mnt/pocketcloud/pocketcloud-storage 2>/dev/null | awk '{print $1}')
            echo "   Storage size: $storage_size"
        else
            log_warning "Storage directory not found"
        fi
        
    else
        log_error "USB storage not mounted at /mnt/pocketcloud"
        echo "   Check USB connection and run: sudo bash setup-usb-storage.sh"
    fi
    
    echo
}

# Check system resources
check_resources() {
    echo "📊 System Resources"
    echo "==================="
    
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    echo "CPU usage: ${cpu_usage}%"
    
    # Memory usage
    local mem_info=$(free -h | grep "Mem:")
    local mem_total=$(echo $mem_info | awk '{print $2}')
    local mem_used=$(echo $mem_info | awk '{print $3}')
    local mem_free=$(echo $mem_info | awk '{print $4}')
    echo "Memory: $mem_used used / $mem_total total ($mem_free free)"
    
    # Disk usage for root
    local root_usage=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
    echo "Root disk usage: ${root_usage}%"
    
    if [[ $root_usage -gt 90 ]]; then
        log_warning "Root disk usage is high (${root_usage}%)"
    elif [[ $root_usage -gt 80 ]]; then
        log_warning "Root disk usage is getting high (${root_usage}%)"
    else
        log_success "Root disk usage is normal (${root_usage}%)"
    fi
    
    # Temperature (if available)
    if command -v vcgencmd &> /dev/null; then
        local temp=$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//' | sed 's/°C//')
        if [[ -n "$temp" ]]; then
            echo "CPU temperature: ${temp}°C"
            
            local temp_num=$(echo $temp | sed 's/\..*//')
            if [[ $temp_num -gt 80 ]]; then
                log_warning "CPU temperature is high (${temp}°C)"
            elif [[ $temp_num -gt 70 ]]; then
                log_warning "CPU temperature is getting warm (${temp}°C)"
            else
                log_success "CPU temperature is normal (${temp}°C)"
            fi
        fi
    fi
    
    echo
}

# Check logs for errors
check_logs() {
    echo "📋 Recent Log Status"
    echo "===================="
    
    # Check for recent errors
    local error_count=$(journalctl -u pocketcloud --since "1 hour ago" -p err --no-pager -q | wc -l)
    local warning_count=$(journalctl -u pocketcloud --since "1 hour ago" -p warning --no-pager -q | wc -l)
    
    if [[ $error_count -eq 0 ]]; then
        log_success "No errors in the last hour"
    else
        log_warning "$error_count errors in the last hour"
        echo "   View with: sudo journalctl -u pocketcloud --since '1 hour ago' -p err"
    fi
    
    if [[ $warning_count -eq 0 ]]; then
        log_success "No warnings in the last hour"
    else
        log_info "$warning_count warnings in the last hour"
        echo "   View with: sudo journalctl -u pocketcloud --since '1 hour ago' -p warning"
    fi
    
    # Show last few log entries
    echo
    echo "Last 5 log entries:"
    journalctl -u pocketcloud -n 5 --no-pager -o short-iso | sed 's/^/   /'
    
    echo
}

# Show quick access info
show_access_info() {
    echo "🚀 Quick Access"
    echo "==============="
    
    # Get IP addresses
    local ip_addresses=$(hostname -I)
    
    echo "Access PocketCloud from:"
    echo "   This device: http://localhost:3000"
    
    for ip in $ip_addresses; do
        echo "   Network:     http://$ip:3000"
    done
    
    echo
    echo "Useful commands:"
    echo "   Status:  sudo systemctl status pocketcloud"
    echo "   Logs:    sudo journalctl -u pocketcloud -f"
    echo "   Restart: sudo systemctl restart pocketcloud"
    echo "   Stop:    sudo systemctl stop pocketcloud"
    echo
}

# Main function
main() {
    echo "=============================================="
    echo "🔍 PocketCloud System Status"
    echo "=============================================="
    echo
    
    check_service
    check_network
    check_storage
    check_resources
    check_logs
    show_access_info
    
    echo "Status check complete!"
    echo "Run this script anytime with: bash system-status.sh"
    echo
}

# Run main function
main "$@"