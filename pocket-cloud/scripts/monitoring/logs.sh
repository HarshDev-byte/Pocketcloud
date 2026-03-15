#!/bin/bash
# Pocket Cloud Drive - Log Viewer Script
# Convenience script for viewing service logs

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_usage() {
    echo "Usage: $0 [service] [options]"
    echo
    echo "Services:"
    echo "  backend    - Backend API server logs (default)"
    echo "  frontend   - Frontend static server logs"
    echo "  watchdog   - Watchdog service logs"
    echo "  cleanup    - Cleanup service logs"
    echo "  all        - All Pocket Cloud services"
    echo "  system     - System logs (kernel, systemd)"
    echo
    echo "Options:"
    echo "  -f, --follow    Follow log output (default)"
    echo "  -n, --lines N   Show last N lines (default: 50)"
    echo "  --since TIME    Show logs since TIME (e.g., '1 hour ago')"
    echo "  --until TIME    Show logs until TIME"
    echo "  --no-pager      Don't use pager"
    echo
    echo "Examples:"
    echo "  $0                          # Follow backend logs"
    echo "  $0 all -n 100              # Last 100 lines from all services"
    echo "  $0 backend --since '1h ago' # Backend logs from last hour"
}

# Default options
SERVICE="backend"
FOLLOW=true
LINES=50
SINCE=""
UNTIL=""
NO_PAGER=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        backend|frontend|watchdog|cleanup|all|system)
            SERVICE="$1"
            shift
            ;;
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        -n|--lines)
            LINES="$2"
            FOLLOW=false
            shift 2
            ;;
        --since)
            SINCE="$2"
            shift 2
            ;;
        --until)
            UNTIL="$2"
            shift 2
            ;;
        --no-pager)
            NO_PAGER=true
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

# Build journalctl command
build_journalctl_cmd() {
    local cmd="sudo journalctl"
    
    # Add service units
    case "$SERVICE" in
        backend)
            cmd="$cmd -u pocketcloud-backend.service"
            ;;
        frontend)
            cmd="$cmd -u pocketcloud-frontend.service"
            ;;
        watchdog)
            cmd="$cmd -u pocketcloud-watchdog.service"
            ;;
        cleanup)
            cmd="$cmd -u pocketcloud-cleanup.service"
            ;;
        all)
            cmd="$cmd -u pocketcloud-backend.service -u pocketcloud-frontend.service -u pocketcloud-watchdog.service -u pocketcloud-cleanup.service"
            ;;
        system)
            cmd="$cmd -u systemd-* -u kernel"
            ;;
    esac
    
    # Add options
    if [[ "$FOLLOW" == true ]]; then
        cmd="$cmd -f"
    else
        cmd="$cmd -n $LINES"
    fi
    
    if [[ -n "$SINCE" ]]; then
        cmd="$cmd --since '$SINCE'"
    fi
    
    if [[ -n "$UNTIL" ]]; then
        cmd="$cmd --until '$UNTIL'"
    fi
    
    if [[ "$NO_PAGER" == true ]]; then
        cmd="$cmd --no-pager"
    fi
    
    echo "$cmd"
}

main() {
    echo -e "${BLUE}Pocket Cloud Drive Logs${NC}"
    echo -e "${YELLOW}Service: $SERVICE${NC}"
    
    if [[ "$FOLLOW" == true ]]; then
        echo -e "${YELLOW}Following logs... (Ctrl+C to exit)${NC}"
    else
        echo -e "${YELLOW}Showing last $LINES lines${NC}"
    fi
    
    echo "----------------------------------------"
    
    # Execute journalctl command
    local cmd=$(build_journalctl_cmd)
    eval "$cmd"
}

main "$@"