#!/bin/bash

# SSH configuration script for Pocket Cloud Drive development
# Sets up SSH access to Raspberry Pi for seamless development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PI_HOST="192.168.4.1"
PI_USER="pi"
SSH_CONFIG_FILE="$HOME/.ssh/config"
SSH_KEY_FILE="$HOME/.ssh/id_rsa"

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
  
  if ! command -v ssh-keygen &> /dev/null; then
    missing_deps+=("ssh-keygen")
  fi
  
  if ! command -v ssh-copy-id &> /dev/null; then
    missing_deps+=("ssh-copy-id")
  fi
  
  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    echo -e "${RED}Error: Missing required dependencies:${NC}"
    for dep in "${missing_deps[@]}"; do
      echo -e "  ${YELLOW}$dep${NC}"
    done
    echo ""
    echo "Install missing dependencies:"
    echo "  brew install openssh"
    exit 1
  fi
}

# Create SSH directory if it doesn't exist
setup_ssh_directory() {
  if [[ ! -d "$HOME/.ssh" ]]; then
    echo -e "${BLUE}Creating SSH directory...${NC}"
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
  fi
}

# Generate SSH key if it doesn't exist
generate_ssh_key() {
  if [[ ! -f "$SSH_KEY_FILE" ]]; then
    echo -e "${BLUE}Generating SSH key...${NC}"
    ssh-keygen -t rsa -b 4096 -f "$SSH_KEY_FILE" -N "" -C "$(whoami)@$(hostname)-pocketcloud"
    echo -e "${GREEN}SSH key generated${NC}"
  else
    echo -e "${GREEN}SSH key already exists${NC}"
  fi
}

# Test Pi connectivity
test_pi_connectivity() {
  echo -e "${BLUE}Testing Pi connectivity...${NC}"
  
  if ping -c 1 -W 2000 "$PI_HOST" > /dev/null 2>&1; then
    echo -e "${GREEN}Pi is reachable at $PI_HOST${NC}"
  else
    echo -e "${RED}Error: Cannot reach Pi at $PI_HOST${NC}"
    echo "Make sure:"
    echo "  1. Pi is powered on"
    echo "  2. You're connected to the Pi's WiFi network"
    echo "  3. Pi IP address is correct ($PI_HOST)"
    echo ""
    echo "To find Pi IP address, try:"
    echo "  nmap -sn 192.168.4.0/24"
    echo "  arp -a | grep -i raspberry"
    exit 1
  fi
}

# Copy SSH key to Pi
copy_ssh_key() {
  echo -e "${BLUE}Copying SSH key to Pi...${NC}"
  echo "You may be prompted for the Pi password (default: raspberry)"
  echo ""
  
  # Try to copy SSH key
  if ssh-copy-id -i "$SSH_KEY_FILE.pub" "$PI_USER@$PI_HOST" 2>/dev/null; then
    echo -e "${GREEN}SSH key copied successfully${NC}"
  else
    echo -e "${YELLOW}SSH key copy failed, trying alternative method...${NC}"
    
    # Alternative method using ssh and manual key append
    echo "Enter Pi password when prompted:"
    cat "$SSH_KEY_FILE.pub" | ssh "$PI_USER@$PI_HOST" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    
    if [[ $? -eq 0 ]]; then
      echo -e "${GREEN}SSH key copied successfully (alternative method)${NC}"
    else
      echo -e "${RED}Failed to copy SSH key${NC}"
      echo "Manual setup required:"
      echo "1. SSH to Pi: ssh $PI_USER@$PI_HOST"
      echo "2. Create .ssh directory: mkdir -p ~/.ssh && chmod 700 ~/.ssh"
      echo "3. Add this key to ~/.ssh/authorized_keys:"
      echo ""
      cat "$SSH_KEY_FILE.pub"
      echo ""
      exit 1
    fi
  fi
}

# Add Pi to SSH config
add_ssh_config() {
  echo -e "${BLUE}Adding Pi to SSH config...${NC}"
  
  # Check if config already exists
  if [[ -f "$SSH_CONFIG_FILE" ]] && grep -q "Host pocketcloud" "$SSH_CONFIG_FILE"; then
    echo -e "${YELLOW}SSH config entry already exists, updating...${NC}"
    
    # Remove existing entry
    sed -i '' '/^Host pocketcloud$/,/^$/d' "$SSH_CONFIG_FILE"
  fi
  
  # Add new config entry
  cat >> "$SSH_CONFIG_FILE" << EOF

Host pocketcloud
    HostName $PI_HOST
    User $PI_USER
    IdentityFile $SSH_KEY_FILE
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    LogLevel QUIET
    ServerAliveInterval 60
    ServerAliveCountMax 3

EOF
  
  # Set proper permissions
  chmod 600 "$SSH_CONFIG_FILE"
  
  echo -e "${GREEN}SSH config updated${NC}"
}

# Test SSH connection
test_ssh_connection() {
  echo -e "${BLUE}Testing SSH connection...${NC}"
  
  if ssh -o ConnectTimeout=5 pocketcloud 'echo "SSH connection successful"' 2>/dev/null; then
    echo -e "${GREEN}✓ SSH connection working${NC}"
  else
    echo -e "${RED}✗ SSH connection failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check Pi is powered on and accessible"
    echo "2. Verify Pi SSH service is running"
    echo "3. Try manual connection: ssh $PI_USER@$PI_HOST"
    echo "4. Check Pi logs: sudo journalctl -u ssh"
    exit 1
  fi
}

# Show connection info
show_connection_info() {
  echo ""
  echo -e "${GREEN}SSH Configuration Complete!${NC}"
  echo ""
  echo "You can now connect to your Pi using:"
  echo -e "  ${BLUE}ssh pocketcloud${NC}"
  echo -e "  ${BLUE}make ssh${NC}"
  echo ""
  echo "Available development commands:"
  echo -e "  ${BLUE}make sync${NC}        - Sync code to Pi"
  echo -e "  ${BLUE}make deploy${NC}      - Full deployment"
  echo -e "  ${BLUE}make logs${NC}        - View Pi logs"
  echo -e "  ${BLUE}make status${NC}      - Check Pi services"
  echo ""
  echo "SSH config saved to: $SSH_CONFIG_FILE"
  echo "SSH key location: $SSH_KEY_FILE"
}

# Enable SSH on Pi (if needed)
enable_pi_ssh() {
  echo -e "${BLUE}Checking if SSH is enabled on Pi...${NC}"
  
  # Try to connect and enable SSH if needed
  if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$PI_USER@$PI_HOST" exit 2>/dev/null; then
    echo -e "${YELLOW}SSH may not be enabled on Pi${NC}"
    echo ""
    echo "To enable SSH on Pi:"
    echo "1. Connect monitor and keyboard to Pi"
    echo "2. Run: sudo systemctl enable ssh"
    echo "3. Run: sudo systemctl start ssh"
    echo "4. Or use raspi-config: sudo raspi-config -> Interface Options -> SSH -> Enable"
    echo ""
    read -p "Press Enter when SSH is enabled on Pi, or Ctrl+C to exit..."
  fi
}

# Main execution
main() {
  echo -e "${BLUE}Pocket Cloud Drive - SSH Configuration${NC}"
  echo ""
  
  check_dependencies
  setup_ssh_directory
  generate_ssh_key
  test_pi_connectivity
  enable_pi_ssh
  copy_ssh_key
  add_ssh_config
  test_ssh_connection
  show_connection_info
}

# Handle Ctrl+C gracefully
trap 'echo -e "\n${YELLOW}SSH configuration cancelled${NC}"; exit 1' INT

main "$@"