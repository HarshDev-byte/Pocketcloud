#!/bin/bash

# Development tunnel script for Pocket Cloud Drive
# Sets up USB ethernet connection and SSH tunnel for faster development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PI_USB_IP="192.168.7.1"
PI_WIFI_IP="192.168.4.1"
LOCAL_PORT="3000"
REMOTE_PORT="3000"
USB_INTERFACE="usb0"

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
  echo -e "${RED}Error: This script is designed for macOS${NC}"
  exit 1
fi

# Check dependencies
check_dependencies() {
  local missing_deps=()
  
  if ! command -v ssh &> /dev/null; then
    missing_deps+=("ssh")
  fi
  
  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    echo -e "${RED}Error: Missing required dependencies:${NC}"
    for dep in "${missing_deps[@]}"; do
      echo -e "  ${YELLOW}$dep${NC}"
    done
    exit 1
  fi
}

# Check if Pi is connected via USB
check_usb_connection() {
  echo -e "${BLUE}Checking USB connection to Pi...${NC}"
  
  # Check if USB ethernet interface exists
  if ! ifconfig | grep -q "usb"; then
    echo -e "${YELLOW}USB ethernet interface not found${NC}"
    echo "Make sure:"
    echo "  1. Pi is connected via USB cable"
    echo "  2. Pi is configured for USB gadget ethernet"
    echo "  3. USB ethernet drivers are loaded"
    echo ""
    echo "To configure Pi for USB ethernet, add to /boot/config.txt:"
    echo "  dtoverlay=dwc2"
    echo ""
    echo "And add to /boot/cmdline.txt after rootwait:"
    echo "  modules-load=dwc2,g_ether"
    echo ""
    return 1
  fi
  
  # Try to ping Pi via USB
  if ping -c 1 -W 2000 "$PI_USB_IP" > /dev/null 2>&1; then
    echo -e "${GREEN}Pi reachable via USB at $PI_USB_IP${NC}"
    return 0
  else
    echo -e "${YELLOW}Pi not reachable via USB, trying WiFi...${NC}"
    return 1
  fi
}

# Check WiFi connection as fallback
check_wifi_connection() {
  echo -e "${BLUE}Checking WiFi connection to Pi...${NC}"
  
  if ping -c 1 -W 2000 "$PI_WIFI_IP" > /dev/null 2>&1; then
    echo -e "${GREEN}Pi reachable via WiFi at $PI_WIFI_IP${NC}"
    return 0
  else
    echo -e "${RED}Pi not reachable via WiFi${NC}"
    return 1
  fi
}

# Determine best connection method
determine_connection() {
  if check_usb_connection; then
    PI_IP="$PI_USB_IP"
    CONNECTION_TYPE="USB"
  elif check_wifi_connection; then
    PI_IP="$PI_WIFI_IP"
    CONNECTION_TYPE="WiFi"
  else
    echo -e "${RED}Error: Cannot reach Pi via USB or WiFi${NC}"
    echo "Make sure Pi is powered on and properly configured"
    exit 1
  fi
  
  echo -e "${GREEN}Using $CONNECTION_TYPE connection ($PI_IP)${NC}"
}

# Test SSH connection
test_ssh_connection() {
  echo -e "${BLUE}Testing SSH connection...${NC}"
  
  if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "pi@$PI_IP" exit 2>/dev/null; then
    echo -e "${RED}Error: Cannot SSH to Pi at $PI_IP${NC}"
    echo "Make sure:"
    echo "  1. SSH is enabled on Pi"
    echo "  2. SSH key is configured (run: make ssh-config)"
    echo "  3. Pi user account is set up correctly"
    exit 1
  fi
  
  echo -e "${GREEN}SSH connection OK${NC}"
}

# Check if port is already in use
check_local_port() {
  if lsof -Pi :$LOCAL_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Port $LOCAL_PORT is already in use locally${NC}"
    
    # Try to find what's using the port
    local process=$(lsof -Pi :$LOCAL_PORT -sTCP:LISTEN | tail -n 1)
    echo "Process using port: $process"
    echo ""
    
    read -p "Kill existing process and continue? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      local pid=$(lsof -Pi :$LOCAL_PORT -sTCP:LISTEN -t)
      kill "$pid" 2>/dev/null || true
      sleep 1
    else
      echo "Tunnel setup cancelled"
      exit 0
    fi
  fi
}

# Start SSH tunnel
start_tunnel() {
  echo -e "${BLUE}Starting SSH tunnel...${NC}"
  echo -e "${YELLOW}Local: http://localhost:$LOCAL_PORT${NC}"
  echo -e "${YELLOW}Remote: http://$PI_IP:$REMOTE_PORT${NC}"
  echo ""
  
  # Start tunnel in background
  ssh -f -N -L "$LOCAL_PORT:localhost:$REMOTE_PORT" "pi@$PI_IP" || {
    echo -e "${RED}Error: Failed to start SSH tunnel${NC}"
    exit 1
  }
  
  # Wait a moment for tunnel to establish
  sleep 2
  
  # Test tunnel
  if curl -s -f "http://localhost:$LOCAL_PORT/api/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Tunnel established successfully${NC}"
    echo -e "${GREEN}✓ Backend is responding at http://localhost:$LOCAL_PORT${NC}"
  else
    echo -e "${YELLOW}Warning: Tunnel created but backend may not be responding${NC}"
    echo "Check that the backend service is running on Pi"
  fi
  
  echo ""
  echo -e "${BLUE}Tunnel is running in background${NC}"
  echo "To stop the tunnel, run: make tunnel-stop"
  echo "Or find and kill the SSH process manually"
}

# Stop existing tunnels
stop_tunnel() {
  echo -e "${BLUE}Stopping existing SSH tunnels...${NC}"
  
  # Find and kill SSH tunnel processes
  local pids=$(ps aux | grep "ssh.*-L.*$LOCAL_PORT:localhost:$REMOTE_PORT" | grep -v grep | awk '{print $2}')
  
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs kill 2>/dev/null || true
    echo -e "${GREEN}Existing tunnels stopped${NC}"
  else
    echo -e "${YELLOW}No existing tunnels found${NC}"
  fi
}

# Show tunnel status
show_status() {
  echo -e "${BLUE}SSH Tunnel Status:${NC}"
  
  local tunnel_pids=$(ps aux | grep "ssh.*-L.*$LOCAL_PORT:localhost:$REMOTE_PORT" | grep -v grep | awk '{print $2}')
  
  if [[ -n "$tunnel_pids" ]]; then
    echo -e "${GREEN}✓ Tunnel is running (PID: $tunnel_pids)${NC}"
    echo -e "${GREEN}✓ Local endpoint: http://localhost:$LOCAL_PORT${NC}"
    
    # Test if tunnel is working
    if curl -s -f "http://localhost:$LOCAL_PORT/api/health" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Backend is responding${NC}"
    else
      echo -e "${YELLOW}⚠ Tunnel exists but backend not responding${NC}"
    fi
  else
    echo -e "${YELLOW}No tunnel running${NC}"
  fi
}

# Main execution
main() {
  local action="${1:-start}"
  
  echo -e "${BLUE}Pocket Cloud Drive - Development Tunnel${NC}"
  echo ""
  
  case "$action" in
    start)
      check_dependencies
      determine_connection
      test_ssh_connection
      check_local_port
      stop_tunnel  # Stop any existing tunnels first
      start_tunnel
      ;;
    stop)
      stop_tunnel
      ;;
    status)
      show_status
      ;;
    *)
      echo "Usage: $0 [start|stop|status]"
      echo "  start   - Start SSH tunnel (default)"
      echo "  stop    - Stop SSH tunnel"
      echo "  status  - Show tunnel status"
      exit 1
      ;;
  esac
}

main "$@"