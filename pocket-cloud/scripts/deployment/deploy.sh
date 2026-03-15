#!/bin/bash

# Production deployment script for Pocket Cloud Drive
# Builds frontend, syncs all code to Pi, and restarts services

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
VERSION=$(date +"%Y%m%d-%H%M%S")

# Check dependencies
check_dependencies() {
  local missing_deps=()
  
  if ! command -v rsync &> /dev/null; then
    missing_deps+=("rsync")
  fi
  
  if ! command -v ssh &> /dev/null; then
    missing_deps+=("ssh")
  fi
  
  if ! command -v npm &> /dev/null; then
    missing_deps+=("npm")
  fi
  
  if ! command -v curl &> /dev/null; then
    missing_deps+=("curl")
  fi
  
  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    echo -e "${RED}Error: Missing required dependencies:${NC}"
    for dep in "${missing_deps[@]}"; do
      echo -e "  ${YELLOW}$dep${NC}"
    done
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
    exit 1
  fi
  echo -e "${GREEN}SSH connection OK${NC}"
}

# Build frontend
build_frontend() {
  echo -e "${BLUE}Building frontend...${NC}"
  
  if [[ ! -d "./frontend" ]]; then
    echo -e "${RED}Error: Frontend directory not found${NC}"
    echo "Run this script from the project root directory"
    exit 1
  fi
  
  cd frontend
  
  # Install dependencies if needed
  if [[ ! -d "node_modules" ]] || [[ package.json -nt node_modules/.last-install ]]; then
    echo "Installing frontend dependencies..."
    npm install
    touch node_modules/.last-install
  fi
  
  # Build for production
  echo "Building frontend for production..."
  npm run build || {
    echo -e "${RED}Error: Frontend build failed${NC}"
    exit 1
  }
  
  cd ..
  echo -e "${GREEN}Frontend build completed${NC}"
}

# Sync frontend to Pi
sync_frontend() {
  echo -e "${BLUE}Syncing frontend to Pi...${NC}"
  
  if [[ ! -d "./frontend/dist" ]]; then
    echo -e "${RED}Error: Frontend dist directory not found${NC}"
    echo "Make sure frontend build completed successfully"
    exit 1
  fi
  
  # Sync built frontend
  rsync -avz --delete \
    ./frontend/dist/ "$PI_HOST:$PI_PATH/frontend/dist/" || {
    echo -e "${RED}Error: Failed to sync frontend${NC}"
    exit 1
  }
  
  echo -e "${GREEN}Frontend synced successfully${NC}"
}

# Sync backend to Pi
sync_backend() {
  echo -e "${BLUE}Syncing backend to Pi...${NC}"
  
  if [[ ! -d "./backend" ]]; then
    echo -e "${RED}Error: Backend directory not found${NC}"
    exit 1
  fi
  
  # Sync backend source code
  rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.env.local' \
    --exclude 'dist' \
    --exclude 'uploads' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    --exclude 'dev.db*' \
    --exclude 'dev-storage' \
    --exclude 'dev-uploads' \
    ./backend/ "$PI_HOST:$PI_PATH/backend/" || {
    echo -e "${RED}Error: Failed to sync backend${NC}"
    exit 1
  }
  
  echo -e "${GREEN}Backend synced successfully${NC}"
}

# Install dependencies and build on Pi
build_on_pi() {
  echo -e "${BLUE}Installing dependencies and building on Pi...${NC}"
  
  ssh "$PI_HOST" << EOF
    set -e
    cd $PI_PATH/backend
    
    # Install production dependencies
    echo "Installing backend dependencies..."
    npm install --production
    
    # Build TypeScript
    echo "Building TypeScript..."
    npm run build
    
    # Set proper permissions
    sudo chown -R pi:pi $PI_PATH
    sudo chmod +x $PI_PATH/scripts/*.sh
EOF
  
  if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}Build completed on Pi${NC}"
  else
    echo -e "${RED}Error: Build failed on Pi${NC}"
    exit 1
  fi
}

# Restart services on Pi
restart_services() {
  echo -e "${BLUE}Restarting services on Pi...${NC}"
  
  ssh "$PI_HOST" << 'EOF'
    set -e
    
    # Restart backend service
    echo "Restarting backend service..."
    sudo systemctl restart pocketcloud-backend
    
    # Restart nginx (frontend)
    echo "Restarting nginx..."
    sudo systemctl restart nginx
    
    # Wait for services to start
    sleep 3
    
    # Check service status
    echo "Checking service status..."
    
    if systemctl is-active --quiet pocketcloud-backend; then
      echo "✓ Backend service is running"
    else
      echo "✗ Backend service failed to start"
      systemctl status pocketcloud-backend --no-pager -l
      exit 1
    fi
    
    if systemctl is-active --quiet nginx; then
      echo "✓ Nginx service is running"
    else
      echo "✗ Nginx service failed to start"
      systemctl status nginx --no-pager -l
      exit 1
    fi
EOF
  
  if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}Services restarted successfully${NC}"
  else
    echo -e "${RED}Error: Failed to restart services${NC}"
    exit 1
  fi
}

# Wait for backend health check
wait_for_health() {
  echo -e "${BLUE}Waiting for backend health check...${NC}"
  
  local max_attempts=30
  local attempt=1
  
  while [[ $attempt -le $max_attempts ]]; do
    if curl -s -f "http://192.168.4.1:3000/api/health" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Backend is healthy and responding${NC}"
      return 0
    fi
    
    echo -e "${YELLOW}Attempt $attempt/$max_attempts - waiting for backend...${NC}"
    sleep 2
    ((attempt++))
  done
  
  echo -e "${RED}Error: Backend health check failed after $max_attempts attempts${NC}"
  
  # Show recent logs for debugging
  echo -e "${YELLOW}Recent backend logs:${NC}"
  ssh "$PI_HOST" "sudo journalctl -u pocketcloud-backend --no-pager -l -n 20"
  
  return 1
}

# Get deployment info
get_deployment_info() {
  echo -e "${BLUE}Getting deployment information...${NC}"
  
  # Get backend version/health info
  local health_response=$(curl -s "http://192.168.4.1:3000/api/health" 2>/dev/null || echo "{}")
  local backend_version=$(echo "$health_response" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
  local uptime=$(echo "$health_response" | grep -o '"uptime":[0-9.]*' | cut -d':' -f2 || echo "0")
  
  # Get system info from Pi
  local system_info=$(ssh "$PI_HOST" "uname -a && uptime" 2>/dev/null || echo "System info unavailable")
  
  echo -e "${GREEN}Deployment Information:${NC}"
  echo "  Version: $VERSION"
  echo "  Backend Version: $backend_version"
  echo "  Backend Uptime: ${uptime}s"
  echo "  Pi System: $system_info"
  echo "  Frontend URL: http://192.168.4.1"
  echo "  Backend API: http://192.168.4.1:3000/api"
}

# Rollback deployment
rollback() {
  echo -e "${YELLOW}Rolling back deployment...${NC}"
  
  ssh "$PI_HOST" << 'EOF'
    set -e
    cd /opt/pocketcloud
    
    # Restore from backup if available
    if [[ -d "backup" ]]; then
      echo "Restoring from backup..."
      cp -r backup/* .
      
      # Restart services
      sudo systemctl restart pocketcloud-backend
      sudo systemctl restart nginx
      
      echo "Rollback completed"
    else
      echo "No backup available for rollback"
      exit 1
    fi
EOF
  
  if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}Rollback completed successfully${NC}"
  else
    echo -e "${RED}Rollback failed${NC}"
  fi
}

# Create backup before deployment
create_backup() {
  echo -e "${BLUE}Creating backup on Pi...${NC}"
  
  ssh "$PI_HOST" << EOF
    set -e
    cd $PI_PATH
    
    # Create backup directory
    sudo rm -rf backup
    mkdir -p backup
    
    # Backup current deployment
    if [[ -d backend/dist ]]; then
      cp -r backend/dist backup/backend-dist
    fi
    
    if [[ -d frontend/dist ]]; then
      cp -r frontend/dist backup/frontend-dist
    fi
    
    echo "Backup created"
EOF
}

# Main deployment process
main() {
  local start_time=$(date +%s)
  
  echo -e "${BLUE}Pocket Cloud Drive - Production Deployment${NC}"
  echo -e "${BLUE}Version: $VERSION${NC}"
  echo ""
  
  # Pre-deployment checks
  check_dependencies
  test_ssh_connection
  
  # Create backup
  create_backup
  
  # Build and sync
  build_frontend
  sync_frontend
  sync_backend
  
  # Deploy on Pi
  build_on_pi
  restart_services
  
  # Verify deployment
  if wait_for_health; then
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo -e "${GREEN}🎉 Deployment completed successfully in ${duration}s${NC}"
    echo ""
    get_deployment_info
  else
    echo ""
    echo -e "${RED}❌ Deployment failed - backend health check failed${NC}"
    echo ""
    read -p "Attempt rollback? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      rollback
    fi
    
    exit 1
  fi
}

# Handle Ctrl+C gracefully
trap 'echo -e "\n${YELLOW}Deployment interrupted${NC}"; exit 1' INT

main "$@"