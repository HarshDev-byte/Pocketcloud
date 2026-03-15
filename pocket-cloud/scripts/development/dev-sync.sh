#!/bin/bash

# Development sync script for Pocket Cloud Drive
# Syncs backend code from Mac to Raspberry Pi and restarts services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PI_HOST="pi@192.168.4.1"
PI_PATH="/opt/pocketcloud"
LOCAL_BACKEND="./backend"
WATCH_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --watch)
      WATCH_MODE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--watch]"
      echo "  --watch    Enable watch mode for automatic syncing"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check dependencies
check_dependencies() {
  local missing_deps=()
  
  if ! command -v rsync &> /dev/null; then
    missing_deps+=("rsync")
  fi
  
  if ! command -v ssh &> /dev/null; then
    missing_deps+=("ssh")
  fi
  
  if [[ "$WATCH_MODE" == true ]] && ! command -v fswatch &> /dev/null; then
    missing_deps+=("fswatch")
  fi
  
  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    echo -e "${RED}Error: Missing required dependencies:${NC}"
    for dep in "${missing_deps[@]}"; do
      echo -e "  ${YELLOW}$dep${NC}"
    done
    echo ""
    echo "Install missing dependencies:"
    if [[ " ${missing_deps[@]} " =~ " fswatch " ]]; then
      echo "  brew install fswatch"
    fi
    if [[ " ${missing_deps[@]} " =~ " rsync " ]]; then
      echo "  brew install rsync"
    fi
    exit 1
  fi
}

# Test SSH connection
test_ssh_connection() {
  echo -e "${BLUE}Testing SSH connection to Pi...${NC}"
  if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$PI_HOST" exit 2>/dev/null; then
    echo -e "${RED}Error: Cannot connect to Pi at $PI_HOST${NC}"
    echo "Make sure:"
    echo "  1. Pi is powered on and connected to network"
    echo "  2. SSH is enabled on Pi"
    echo "  3. SSH key is configured (run: make ssh-config)"
    echo "  4. Pi IP address is correct (192.168.4.1)"
    exit 1
  fi
  echo -e "${GREEN}SSH connection OK${NC}"
}

# Sync files to Pi
sync_files() {
  local start_time=$(date +%s.%N)
  
  echo -e "${BLUE}Syncing backend files to Pi...${NC}"
  
  # Ensure backend directory exists
  if [[ ! -d "$LOCAL_BACKEND" ]]; then
    echo -e "${RED}Error: Backend directory not found: $LOCAL_BACKEND${NC}"
    echo "Run this script from the project root directory"
    exit 1
  fi
  
  # Sync backend source code
  rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude 'dist' \
    --exclude 'uploads' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    --exclude 'dev.db*' \
    --exclude 'dev-storage' \
    --exclude 'dev-uploads' \
    "$LOCAL_BACKEND/" "$PI_HOST:$PI_PATH/backend/" || {
    echo -e "${RED}Error: Failed to sync files${NC}"
    exit 1
  }
  
  local end_time=$(date +%s.%N)
  local duration=$(echo "$end_time - $start_time" | bc -l)
  
  echo -e "${GREEN}Sync completed in ${duration}s${NC}"
}

# Restart backend service on Pi
restart_backend() {
  echo -e "${BLUE}Building and restarting backend on Pi...${NC}"
  
  ssh "$PI_HOST" << 'EOF'
    set -e
    cd /opt/pocketcloud/backend
    
    # Install dependencies if package.json changed
    if [[ package.json -nt node_modules/.last-install ]] 2>/dev/null || [[ ! -d node_modules ]]; then
      echo "Installing dependencies..."
      npm install --production
      touch node_modules/.last-install
    fi
    
    # Build TypeScript
    echo "Building TypeScript..."
    npm run build
    
    # Restart service
    echo "Restarting backend service..."
    sudo systemctl restart pocketcloud-backend
    
    # Wait for service to start
    sleep 2
    
    # Check service status
    if systemctl is-active --quiet pocketcloud-backend; then
      echo "Backend service started successfully"
    else
      echo "Warning: Backend service may not have started properly"
      systemctl status pocketcloud-backend --no-pager -l
    fi
EOF
  
  if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}Backend restarted successfully${NC}"
  else
    echo -e "${RED}Error: Failed to restart backend${NC}"
    exit 1
  fi
}

# Check backend health
check_health() {
  echo -e "${BLUE}Checking backend health...${NC}"
  
  local max_attempts=10
  local attempt=1
  
  while [[ $attempt -le $max_attempts ]]; do
    if curl -s -f "http://192.168.4.1:3000/api/health" > /dev/null 2>&1; then
      echo -e "${GREEN}Backend is healthy and responding${NC}"
      return 0
    fi
    
    echo -e "${YELLOW}Attempt $attempt/$max_attempts - waiting for backend...${NC}"
    sleep 1
    ((attempt++))
  done
  
  echo -e "${RED}Warning: Backend health check failed after $max_attempts attempts${NC}"
  return 1
}

# Single sync operation
do_sync() {
  local start_time=$(date +%s.%N)
  
  sync_files
  restart_backend
  check_health
  
  local end_time=$(date +%s.%N)
  local total_duration=$(echo "$end_time - $start_time" | bc -l | xargs printf "%.1f")
  
  echo -e "${GREEN}✓ Sync complete in ${total_duration}s${NC}"
  echo ""
}

# Watch mode
watch_files() {
  echo -e "${BLUE}Starting watch mode...${NC}"
  echo -e "${YELLOW}Watching for changes in $LOCAL_BACKEND${NC}"
  echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
  echo ""
  
  # Initial sync
  do_sync
  
  # Watch for changes
  fswatch -o "$LOCAL_BACKEND" | while read f; do
    echo -e "${BLUE}Files changed, syncing...${NC}"
    do_sync
  done
}

# Main execution
main() {
  echo -e "${BLUE}Pocket Cloud Drive - Development Sync${NC}"
  echo ""
  
  check_dependencies
  test_ssh_connection
  
  if [[ "$WATCH_MODE" == true ]]; then
    watch_files
  else
    do_sync
  fi
}

# Handle Ctrl+C gracefully
trap 'echo -e "\n${YELLOW}Sync stopped${NC}"; exit 0' INT

main "$@"