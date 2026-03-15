#!/bin/bash

# Pocket Cloud Drive Control Tool
# Professional CLI for managing Pocket Cloud Drive from Mac or Pi
# Version: 1.0.0

set -euo pipefail

# Configuration
SCRIPT_NAME="pcd-ctl"
VERSION="1.0.0"
CONFIG_FILE="$HOME/.pcd-ctl.conf"

# Default configuration
DEFAULT_API_URL="http://192.168.4.1:3000"
DEFAULT_TIMEOUT=30

# Colors (only if terminal supports it)
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
    RED=$(tput setaf 1)
    GREEN=$(tput setaf 2)
    YELLOW=$(tput setaf 3)
    BLUE=$(tput setaf 4)
    MAGENTA=$(tput setaf 5)
    CYAN=$(tput setaf 6)
    WHITE=$(tput setaf 7)
    BOLD=$(tput bold)
    RESET=$(tput sgr0)
else
    RED="" GREEN="" YELLOW="" BLUE="" MAGENTA="" CYAN="" WHITE="" BOLD="" RESET=""
fi

# Utility functions
log_info() {
    echo "${BLUE}ℹ${RESET} $*"
}

log_success() {
    echo "${GREEN}✓${RESET} $*"
}

log_warning() {
    echo "${YELLOW}⚠${RESET} $*"
}

log_error() {
    echo "${RED}✗${RESET} $*" >&2
}

log_header() {
    echo "${BOLD}${CYAN}$*${RESET}"
}

# Check dependencies
check_dependencies() {
    local missing=()
    
    if ! command -v curl >/dev/null 2>&1; then
        missing+=("curl")
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        missing+=("jq")
    fi
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing[*]}"
        echo "Please install them:"
        echo "  macOS: brew install curl jq"
        echo "  Ubuntu/Debian: sudo apt install curl jq"
        echo "  CentOS/RHEL: sudo yum install curl jq"
        exit 1
    fi
}

# Load configuration
load_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        # shellcheck source=/dev/null
        source "$CONFIG_FILE"
    fi
    
    # Set defaults if not configured
    API_URL="${API_URL:-$DEFAULT_API_URL}"
    API_TOKEN="${API_TOKEN:-}"
    TIMEOUT="${TIMEOUT:-$DEFAULT_TIMEOUT}"
}

# Save configuration
save_config() {
    cat > "$CONFIG_FILE" << EOF
# Pocket Cloud Drive CLI Configuration
API_URL="$API_URL"
API_TOKEN="$API_TOKEN"
TIMEOUT="$TIMEOUT"
EOF
    chmod 600 "$CONFIG_FILE"
    log_success "Configuration saved to $CONFIG_FILE"
}

# API request wrapper
api_request() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"
    
    local curl_args=(
        -s
        -X "$method"
        -H "Content-Type: application/json"
        -H "Accept: application/json"
        --connect-timeout "$TIMEOUT"
        --max-time "$((TIMEOUT * 2))"
    )
    
    if [[ -n "$API_TOKEN" ]]; then
        curl_args+=(-H "Authorization: Bearer $API_TOKEN")
    fi
    
    if [[ -n "$data" ]]; then
        curl_args+=(-d "$data")
    fi
    
    local response
    if ! response=$(curl "${curl_args[@]}" "$API_URL$endpoint" 2>/dev/null); then
        log_error "Failed to connect to Pocket Cloud Drive at $API_URL"
        log_error "Check that the service is running and the URL is correct"
        return 1
    fi
    
    # Check if response is valid JSON
    if ! echo "$response" | jq . >/dev/null 2>&1; then
        log_error "Invalid response from server"
        return 1
    fi
    
    # Check for API errors
    if echo "$response" | jq -e '.error' >/dev/null 2>&1; then
        local error_msg
        error_msg=$(echo "$response" | jq -r '.error // .message // "Unknown error"')
        log_error "API Error: $error_msg"
        return 1
    fi
    
    echo "$response"
}

# Initialize configuration
cmd_init() {
    log_header "Pocket Cloud Drive CLI Setup"
    echo
    
    # Get API URL
    read -p "API URL [$DEFAULT_API_URL]: " input_url
    API_URL="${input_url:-$DEFAULT_API_URL}"
    
    # Test connection
    log_info "Testing connection to $API_URL..."
    if ! curl -s --connect-timeout 5 "$API_URL/api/health" >/dev/null 2>&1; then
        log_warning "Cannot connect to $API_URL"
        log_warning "Make sure Pocket Cloud Drive is running and accessible"
    else
        log_success "Connection successful"
    fi
    
    # Get admin credentials
    echo
    echo "Admin credentials are required for most operations."
    read -p "Admin username: " username
    read -s -p "Admin password: " password
    echo
    
    # Authenticate and get token
    log_info "Authenticating..."
    local auth_data
    auth_data=$(jq -n --arg username "$username" --arg password "$password" '{username: $username, password: $password}')
    
    if response=$(api_request "POST" "/api/auth/login" "$auth_data"); then
        API_TOKEN=$(echo "$response" | jq -r '.token // empty')
        if [[ -n "$API_TOKEN" ]]; then
            log_success "Authentication successful"
            save_config
        else
            log_error "Authentication failed: No token received"
            exit 1
        fi
    else
        log_error "Authentication failed"
        exit 1
    fi
}

# Show status
cmd_status() {
    log_header "Pocket Cloud Drive Status"
    echo
    
    # System info
    if response=$(api_request "GET" "/api/admin/system/info"); then
        echo "${BOLD}System Information:${RESET}"
        echo "$response" | jq -r '
            "  OS: " + (.os // "Unknown") + " " + (.arch // "") + 
            "\n  Node.js: " + (.nodeVersion // "Unknown") +
            "\n  Uptime: " + (.uptime // "Unknown") +
            "\n  Memory: " + ((.memoryUsage.used / 1024 / 1024) | floor | tostring) + "MB / " + 
                         ((.memoryUsage.total / 1024 / 1024) | floor | tostring) + "MB"
        '
        echo
    fi
    
    # Storage info
    if response=$(api_request "GET" "/api/admin/storage/stats"); then
        echo "${BOLD}Storage:${RESET}"
        echo "$response" | jq -r '
            "  Total: " + ((.total / 1024 / 1024 / 1024) | floor | tostring) + "GB" +
            "\n  Used: " + ((.used / 1024 / 1024 / 1024) | floor | tostring) + "GB (" + 
                        ((.used / .total * 100) | floor | tostring) + "%)" +
            "\n  Available: " + ((.available / 1024 / 1024 / 1024) | floor | tostring) + "GB"
        '
        echo
    fi
    
    # Hardware info (if available)
    if response=$(api_request "GET" "/api/admin/hardware" 2>/dev/null); then
        echo "${BOLD}Hardware:${RESET}"
        local temp
        temp=$(echo "$response" | jq -r '.cpuTemp // empty')
        if [[ -n "$temp" ]]; then
            local temp_color="$GREEN"
            if (( $(echo "$temp > 70" | bc -l 2>/dev/null || echo 0) )); then
                temp_color="$RED"
            elif (( $(echo "$temp > 55" | bc -l 2>/dev/null || echo 0) )); then
                temp_color="$YELLOW"
            fi
            echo "  CPU Temperature: ${temp_color}${temp}°C${RESET}"
        fi
        
        local cpu_usage
        cpu_usage=$(echo "$response" | jq -r '.cpuUsage // empty')
        if [[ -n "$cpu_usage" ]]; then
            echo "  CPU Usage: ${cpu_usage}%"
        fi
        
        local load_avg
        load_avg=$(echo "$response" | jq -r '.loadAvg[0] // empty')
        if [[ -n "$load_avg" ]]; then
            echo "  Load Average: $load_avg"
        fi
        echo
    fi
    
    # Service status
    echo "${BOLD}Services:${RESET}"
    if systemctl is-active --quiet pocketcloud 2>/dev/null; then
        echo "  ${GREEN}●${RESET} pocketcloud (active)"
    else
        echo "  ${RED}●${RESET} pocketcloud (inactive)"
    fi
    
    if systemctl is-active --quiet hostapd 2>/dev/null; then
        echo "  ${GREEN}●${RESET} hostapd (active)"
    else
        echo "  ${RED}●${RESET} hostapd (inactive)"
    fi
    
    if systemctl is-active --quiet dnsmasq 2>/dev/null; then
        echo "  ${GREEN}●${RESET} dnsmasq (active)"
    else
        echo "  ${RED}●${RESET} dnsmasq (inactive)"
    fi
}

# Show logs
cmd_logs() {
    local follow=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --follow|-f)
                follow=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    if [[ "$follow" == true ]]; then
        log_info "Following logs (Ctrl+C to stop)..."
        if command -v journalctl >/dev/null 2>&1; then
            journalctl -u pocketcloud -f --no-pager
        else
            tail -f /var/log/pocketcloud/app.log 2>/dev/null || {
                log_error "Cannot access logs. Try running with sudo or check log file location."
                exit 1
            }
        fi
    else
        if command -v journalctl >/dev/null 2>&1; then
            journalctl -u pocketcloud --no-pager -n 50
        else
            tail -n 50 /var/log/pocketcloud/app.log 2>/dev/null || {
                log_error "Cannot access logs. Try running with sudo or check log file location."
                exit 1
            }
        fi
    fi
}

# User management
cmd_users() {
    local action="$1"
    shift
    
    case "$action" in
        list)
            if response=$(api_request "GET" "/api/admin/users"); then
                log_header "Users"
                echo "$response" | jq -r '.users[] | "  " + .username + " (" + .role + ") - " + (.quotaBytes / 1024 / 1024 / 1024 | floor | tostring) + "GB quota"'
            fi
            ;;
        create)
            if [[ $# -lt 1 ]]; then
                log_error "Usage: $SCRIPT_NAME users create <username>"
                exit 1
            fi
            
            local username="$1"
            read -s -p "Password: " password
            echo
            read -p "Role [user]: " role
            role="${role:-user}"
            read -p "Quota in GB [10]: " quota_gb
            quota_gb="${quota_gb:-10}"
            
            local quota_bytes=$((quota_gb * 1024 * 1024 * 1024))
            local user_data
            user_data=$(jq -n \
                --arg username "$username" \
                --arg password "$password" \
                --arg role "$role" \
                --argjson quotaBytes "$quota_bytes" \
                '{username: $username, password: $password, role: $role, quotaBytes: $quotaBytes}')
            
            if api_request "POST" "/api/admin/users" "$user_data" >/dev/null; then
                log_success "User '$username' created successfully"
            fi
            ;;
        delete)
            if [[ $# -lt 1 ]]; then
                log_error "Usage: $SCRIPT_NAME users delete <username>"
                exit 1
            fi
            
            local username="$1"
            read -p "Are you sure you want to delete user '$username'? [y/N]: " confirm
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                if api_request "DELETE" "/api/admin/users/$username" >/dev/null; then
                    log_success "User '$username' deleted successfully"
                fi
            else
                log_info "Operation cancelled"
            fi
            ;;
        *)
            log_error "Unknown users command: $action"
            log_error "Available commands: list, create, delete"
            exit 1
            ;;
    esac
}

# Storage management
cmd_storage() {
    local action="$1"
    shift
    
    case "$action" in
        info)
            if response=$(api_request "GET" "/api/admin/storage/stats"); then
                log_header "Storage Information"
                echo "$response" | jq -r '
                    "Total Space: " + ((.total / 1024 / 1024 / 1024) | floor | tostring) + "GB" +
                    "\nUsed Space: " + ((.used / 1024 / 1024 / 1024) | floor | tostring) + "GB (" + 
                                     ((.used / .total * 100) | floor | tostring) + "%)" +
                    "\nAvailable: " + ((.available / 1024 / 1024 / 1024) | floor | tostring) + "GB" +
                    "\nFiles: " + (.fileCount | tostring) + 
                    "\nFolders: " + (.folderCount | tostring)
                '
            fi
            ;;
        clean)
            log_info "Running cleanup job..."
            if api_request "POST" "/api/admin/storage/cleanup" >/dev/null; then
                log_success "Cleanup completed successfully"
            fi
            ;;
        *)
            log_error "Unknown storage command: $action"
            log_error "Available commands: info, clean"
            exit 1
            ;;
    esac
}

# Backup management
cmd_backup() {
    local action="$1"
    shift
    
    case "$action" in
        now)
            log_info "Creating backup..."
            if response=$(api_request "POST" "/api/admin/backup/create"); then
                local backup_file
                backup_file=$(echo "$response" | jq -r '.filename')
                log_success "Backup created: $backup_file"
            fi
            ;;
        list)
            if response=$(api_request "GET" "/api/admin/backup/list"); then
                log_header "Available Backups"
                echo "$response" | jq -r '.backups[] | "  " + .filename + " (" + .size + ", " + .date + ")"'
            fi
            ;;
        restore)
            if [[ $# -lt 1 ]]; then
                log_error "Usage: $SCRIPT_NAME backup restore <filename>"
                exit 1
            fi
            
            local filename="$1"
            read -p "Are you sure you want to restore from '$filename'? This will overwrite current data. [y/N]: " confirm
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                log_info "Restoring from backup..."
                local restore_data
                restore_data=$(jq -n --arg filename "$filename" '{filename: $filename}')
                if api_request "POST" "/api/admin/backup/restore" "$restore_data" >/dev/null; then
                    log_success "Backup restored successfully"
                    log_warning "Please restart the service: sudo systemctl restart pocketcloud"
                fi
            else
                log_info "Operation cancelled"
            fi
            ;;
        *)
            log_error "Unknown backup command: $action"
            log_error "Available commands: now, list, restore"
            exit 1
            ;;
    esac
}

# WiFi management
cmd_wifi() {
    local action="$1"
    shift
    
    case "$action" in
        list)
            log_header "Connected WiFi Clients"
            if [[ -f /proc/net/arp ]]; then
                awk '/192\.168\.4\./ && !/00:00:00:00:00:00/ {print "  " $1 " - " $4}' /proc/net/arp | sort -V
            else
                log_error "ARP table not accessible"
            fi
            ;;
        password)
            if [[ $# -lt 1 ]]; then
                log_error "Usage: $SCRIPT_NAME wifi password <new_password>"
                exit 1
            fi
            
            local new_password="$1"
            if [[ ${#new_password} -lt 8 ]]; then
                log_error "Password must be at least 8 characters long"
                exit 1
            fi
            
            log_info "Updating WiFi password..."
            # Update hostapd configuration
            if [[ -f /etc/hostapd/hostapd.conf ]]; then
                sudo sed -i "s/^wpa_passphrase=.*/wpa_passphrase=$new_password/" /etc/hostapd/hostapd.conf
                sudo systemctl restart hostapd
                log_success "WiFi password updated and hostapd restarted"
            else
                log_error "hostapd configuration not found"
            fi
            ;;
        ssid)
            if [[ $# -lt 1 ]]; then
                log_error "Usage: $SCRIPT_NAME wifi ssid <new_ssid>"
                exit 1
            fi
            
            local new_ssid="$1"
            log_info "Updating WiFi SSID..."
            # Update hostapd configuration
            if [[ -f /etc/hostapd/hostapd.conf ]]; then
                sudo sed -i "s/^ssid=.*/ssid=$new_ssid/" /etc/hostapd/hostapd.conf
                sudo systemctl restart hostapd
                log_success "WiFi SSID updated and hostapd restarted"
            else
                log_error "hostapd configuration not found"
            fi
            ;;
        *)
            log_error "Unknown wifi command: $action"
            log_error "Available commands: list, password, ssid"
            exit 1
            ;;
    esac
}

# Update system
cmd_update() {
    log_info "Updating Pocket Cloud Drive..."
    
    # Check if we're in a git repository
    if [[ -d .git ]]; then
        log_info "Pulling latest changes..."
        git pull origin main
        
        log_info "Installing dependencies..."
        cd backend && npm install && cd ..
        cd frontend && npm install && cd ..
        
        log_info "Building frontend..."
        cd frontend && npm run build && cd ..
        
        log_info "Restarting service..."
        sudo systemctl restart pocketcloud
        
        log_success "Update completed successfully"
    else
        log_error "Not in a git repository. Manual update required."
        exit 1
    fi
}

# Health check
cmd_health() {
    local exit_code=0
    
    log_header "Health Check"
    
    # Check API connectivity
    if api_request "GET" "/api/health" >/dev/null 2>&1; then
        log_success "API is responding"
    else
        log_error "API is not responding"
        exit_code=1
    fi
    
    # Check disk space
    if response=$(api_request "GET" "/api/admin/storage/stats" 2>/dev/null); then
        local usage_percent
        usage_percent=$(echo "$response" | jq -r '(.used / .total * 100) | floor')
        if [[ $usage_percent -lt 90 ]]; then
            log_success "Disk usage: ${usage_percent}%"
        else
            log_warning "Disk usage high: ${usage_percent}%"
            exit_code=1
        fi
    fi
    
    # Check CPU temperature
    if response=$(api_request "GET" "/api/admin/hardware" 2>/dev/null); then
        local temp
        temp=$(echo "$response" | jq -r '.cpuTemp // empty')
        if [[ -n "$temp" ]]; then
            if (( $(echo "$temp < 80" | bc -l 2>/dev/null || echo 1) )); then
                log_success "CPU temperature: ${temp}°C"
            else
                log_error "CPU temperature high: ${temp}°C"
                exit_code=1
            fi
        fi
    fi
    
    # Check services
    for service in pocketcloud hostapd dnsmasq; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            log_success "$service is running"
        else
            log_error "$service is not running"
            exit_code=1
        fi
    done
    
    if [[ $exit_code -eq 0 ]]; then
        log_success "All health checks passed"
    else
        log_error "Some health checks failed"
    fi
    
    exit $exit_code
}

# Temperature display with ASCII bar
cmd_temp() {
    if response=$(api_request "GET" "/api/admin/hardware" 2>/dev/null); then
        local temp
        temp=$(echo "$response" | jq -r '.cpuTemp // empty')
        if [[ -n "$temp" ]]; then
            log_header "CPU Temperature: ${temp}°C"
            
            # ASCII temperature bar (0-100°C)
            local bar_width=50
            local temp_int=${temp%.*}  # Remove decimal part
            local filled=$((temp_int * bar_width / 100))
            local empty=$((bar_width - filled))
            
            # Color based on temperature
            local bar_color="$GREEN"
            if [[ $temp_int -gt 70 ]]; then
                bar_color="$RED"
            elif [[ $temp_int -gt 55 ]]; then
                bar_color="$YELLOW"
            fi
            
            printf "0°C ["
            printf "%*s" $filled | tr ' ' '█'
            printf "%*s" $empty | tr ' ' '░'
            printf "] 100°C\n"
            
            if [[ $temp_int -gt 80 ]]; then
                log_warning "Temperature is high! Throttling may occur at 80°C"
            fi
        else
            log_error "Temperature data not available"
        fi
    else
        log_error "Cannot retrieve hardware information"
    fi
}

# Show help
cmd_help() {
    cat << EOF
${BOLD}Pocket Cloud Drive Control Tool v$VERSION${RESET}

${BOLD}USAGE:${RESET}
    $SCRIPT_NAME <command> [options]

${BOLD}COMMANDS:${RESET}
    ${CYAN}init${RESET}                     Interactive setup of CLI configuration
    ${CYAN}status${RESET}                   Show system status, services, and hardware
    ${CYAN}logs${RESET} [--follow]          Show backend logs (use --follow to tail)
    
    ${CYAN}users list${RESET}               List all users
    ${CYAN}users create${RESET} <name>      Create new user (interactive)
    ${CYAN}users delete${RESET} <name>      Delete user (with confirmation)
    
    ${CYAN}storage info${RESET}             Show disk usage breakdown
    ${CYAN}storage clean${RESET}            Run cleanup job (purge trash + stale uploads)
    
    ${CYAN}backup now${RESET}               Create database backup immediately
    ${CYAN}backup list${RESET}              List available backups
    ${CYAN}backup restore${RESET} <file>    Restore database from backup
    
    ${CYAN}wifi list${RESET}                Show connected WiFi clients
    ${CYAN}wifi password${RESET} <new>      Change WiFi password and restart hostapd
    ${CYAN}wifi ssid${RESET} <name>         Change WiFi SSID and restart hostapd
    
    ${CYAN}update${RESET}                   Update from git and restart (git deployments)
    ${CYAN}health${RESET}                   Run full health check (exit 0 if OK)
    ${CYAN}temp${RESET}                     Show CPU temperature with ASCII graph
    ${CYAN}help${RESET}                     Show this help message

${BOLD}EXAMPLES:${RESET}
    $SCRIPT_NAME init                    # First-time setup
    $SCRIPT_NAME status                  # Quick system overview
    $SCRIPT_NAME logs --follow           # Watch logs in real-time
    $SCRIPT_NAME users create alice      # Create user 'alice'
    $SCRIPT_NAME backup now              # Create backup
    $SCRIPT_NAME wifi password newpass  # Change WiFi password
    $SCRIPT_NAME health                  # Check if everything is OK

${BOLD}CONFIGURATION:${RESET}
    Config file: $CONFIG_FILE
    Run '$SCRIPT_NAME init' to configure API URL and credentials.

${BOLD}REQUIREMENTS:${RESET}
    - curl (for API requests)
    - jq (for JSON parsing)
    - bc (for temperature calculations, optional)
EOF
}

# Main command dispatcher
main() {
    # Check dependencies first
    check_dependencies
    
    # Load configuration
    load_config
    
    # Handle no arguments
    if [[ $# -eq 0 ]]; then
        cmd_help
        exit 0
    fi
    
    # Check if configuration exists for commands that need it
    local needs_config=("status" "logs" "users" "storage" "backup" "health" "temp")
    local command="$1"
    
    if [[ " ${needs_config[*]} " =~ " $command " ]] && [[ ! -f "$CONFIG_FILE" ]]; then
        log_error "Configuration not found. Run '$SCRIPT_NAME init' first."
        exit 1
    fi
    
    # Dispatch commands
    case "$command" in
        init)
            cmd_init
            ;;
        status)
            cmd_status
            ;;
        logs)
            shift
            cmd_logs "$@"
            ;;
        users)
            shift
            cmd_users "$@"
            ;;
        storage)
            shift
            cmd_storage "$@"
            ;;
        backup)
            shift
            cmd_backup "$@"
            ;;
        wifi)
            shift
            cmd_wifi "$@"
            ;;
        update)
            cmd_update
            ;;
        health)
            cmd_health
            ;;
        temp)
            cmd_temp
            ;;
        help|--help|-h)
            cmd_help
            ;;
        --version|-v)
            echo "$SCRIPT_NAME v$VERSION"
            ;;
        *)
            log_error "Unknown command: $command"
            echo "Run '$SCRIPT_NAME help' for available commands."
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"