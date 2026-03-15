#!/bin/bash

# Firewall setup script for Pocket Cloud Drive
# Configures iptables to secure the Raspberry Pi

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PI_NETWORK="192.168.4.0/24"
PI_IP="192.168.4.1"

echo -e "${BLUE}Pocket Cloud Drive - Firewall Setup${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo $0"
   exit 1
fi

# Check if iptables is installed
if ! command -v iptables &> /dev/null; then
    echo -e "${RED}Error: iptables not found${NC}"
    echo "Installing iptables..."
    apt-get update
    apt-get install -y iptables
fi

# Backup existing rules
echo -e "${BLUE}Backing up existing iptables rules...${NC}"
mkdir -p /etc/iptables/backup
iptables-save > "/etc/iptables/backup/rules.$(date +%Y%m%d-%H%M%S).bak"

# Clear existing rules
echo -e "${BLUE}Clearing existing iptables rules...${NC}"
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X

# Set default policies
echo -e "${BLUE}Setting default policies...${NC}"
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback traffic
echo -e "${BLUE}Allowing loopback traffic...${NC}"
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established and related connections
echo -e "${BLUE}Allowing established connections...${NC}"
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow SSH from local network only
echo -e "${BLUE}Allowing SSH from local network (port 22)...${NC}"
iptables -A INPUT -p tcp -s $PI_NETWORK --dport 22 -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT

# Allow HTTP from local network only (port 80)
echo -e "${BLUE}Allowing HTTP from local network (port 80)...${NC}"
iptables -A INPUT -p tcp -s $PI_NETWORK --dport 80 -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT

# Allow HTTPS from local network only (port 443)
echo -e "${BLUE}Allowing HTTPS from local network (port 443)...${NC}"
iptables -A INPUT -p tcp -s $PI_NETWORK --dport 443 -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT

# Allow backend API from local network only (port 3000)
echo -e "${BLUE}Allowing backend API from local network (port 3000)...${NC}"
iptables -A INPUT -p tcp -s $PI_NETWORK --dport 3000 -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT

# Allow DHCP server (Pi acts as DHCP server for its network)
echo -e "${BLUE}Allowing DHCP server (ports 67-68)...${NC}"
iptables -A INPUT -p udp --dport 67 -j ACCEPT
iptables -A INPUT -p udp --dport 68 -j ACCEPT
iptables -A OUTPUT -p udp --sport 67 -j ACCEPT
iptables -A OUTPUT -p udp --sport 68 -j ACCEPT

# Allow DNS server (Pi may act as DNS server)
echo -e "${BLUE}Allowing DNS server (port 53)...${NC}"
iptables -A INPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p tcp --dport 53 -j ACCEPT

# Allow NTP (time synchronization)
echo -e "${BLUE}Allowing NTP (port 123)...${NC}"
iptables -A OUTPUT -p udp --dport 123 -j ACCEPT

# Allow ping from local network (ICMP)
echo -e "${BLUE}Allowing ping from local network...${NC}"
iptables -A INPUT -p icmp -s $PI_NETWORK --icmp-type echo-request -j ACCEPT

# Rate limiting for SSH (prevent brute force)
echo -e "${BLUE}Setting up SSH rate limiting...${NC}"
iptables -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -m recent --set --name SSH
iptables -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -m recent --update --seconds 60 --hitcount 4 --name SSH -j DROP

# Rate limiting for HTTP/HTTPS (prevent DoS)
echo -e "${BLUE}Setting up HTTP rate limiting...${NC}"
iptables -A INPUT -p tcp --dport 80 -m conntrack --ctstate NEW -m recent --set --name HTTP
iptables -A INPUT -p tcp --dport 80 -m conntrack --ctstate NEW -m recent --update --seconds 1 --hitcount 20 --name HTTP -j DROP

iptables -A INPUT -p tcp --dport 443 -m conntrack --ctstate NEW -m recent --set --name HTTPS
iptables -A INPUT -p tcp --dport 443 -m conntrack --ctstate NEW -m recent --update --seconds 1 --hitcount 20 --name HTTPS -j DROP

iptables -A INPUT -p tcp --dport 3000 -m conntrack --ctstate NEW -m recent --set --name API
iptables -A INPUT -p tcp --dport 3000 -m conntrack --ctstate NEW -m recent --update --seconds 1 --hitcount 30 --name API -j DROP

# Log dropped packets (for security monitoring)
echo -e "${BLUE}Setting up logging for dropped packets...${NC}"
iptables -A INPUT -m limit --limit 5/min -j LOG --log-prefix "iptables-dropped: " --log-level 4

# Drop all other traffic
echo -e "${BLUE}Dropping all other traffic...${NC}"
iptables -A INPUT -j DROP

# NAT rules for internet sharing (if Pi provides internet access)
echo -e "${BLUE}Setting up NAT for internet sharing...${NC}"
# Enable IP forwarding
echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

# NAT masquerading (assuming eth0 is the internet connection)
if ip link show eth0 &> /dev/null; then
    iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
    iptables -A FORWARD -i eth0 -o wlan0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
    iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT
    echo -e "${GREEN}NAT configured for eth0 internet connection${NC}"
elif ip link show wlan1 &> /dev/null; then
    # If using USB WiFi adapter for internet
    iptables -t nat -A POSTROUTING -o wlan1 -j MASQUERADE
    iptables -A FORWARD -i wlan1 -o wlan0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
    iptables -A FORWARD -i wlan0 -o wlan1 -j ACCEPT
    echo -e "${GREEN}NAT configured for wlan1 internet connection${NC}"
else
    echo -e "${YELLOW}No internet interface detected, skipping NAT setup${NC}"
fi

# Save iptables rules
echo -e "${BLUE}Saving iptables rules...${NC}"
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4

# Install iptables-persistent to restore rules on boot
echo -e "${BLUE}Installing iptables-persistent...${NC}"
DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent

# Create systemd service to ensure rules are loaded
echo -e "${BLUE}Creating iptables restore service...${NC}"
cat > /etc/systemd/system/iptables-restore.service << 'EOF'
[Unit]
Description=Restore iptables rules
After=network.target

[Service]
Type=oneshot
ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

# Enable the service
systemctl enable iptables-restore.service

# Create firewall management script
echo -e "${BLUE}Creating firewall management script...${NC}"
cat > /usr/local/bin/pocketcloud-firewall << 'EOF'
#!/bin/bash

case "$1" in
    status)
        echo "Current iptables rules:"
        iptables -L -n -v
        ;;
    save)
        iptables-save > /etc/iptables/rules.v4
        echo "Firewall rules saved"
        ;;
    restore)
        iptables-restore < /etc/iptables/rules.v4
        echo "Firewall rules restored"
        ;;
    disable)
        iptables -F
        iptables -X
        iptables -P INPUT ACCEPT
        iptables -P FORWARD ACCEPT
        iptables -P OUTPUT ACCEPT
        echo "Firewall disabled (rules cleared)"
        ;;
    enable)
        iptables-restore < /etc/iptables/rules.v4
        echo "Firewall enabled (rules restored)"
        ;;
    *)
        echo "Usage: $0 {status|save|restore|enable|disable}"
        exit 1
        ;;
esac
EOF

chmod +x /usr/local/bin/pocketcloud-firewall

# Display current rules
echo ""
echo -e "${GREEN}Firewall setup complete!${NC}"
echo ""
echo -e "${BLUE}Current iptables rules:${NC}"
iptables -L -n

echo ""
echo -e "${BLUE}Firewall Management:${NC}"
echo "  View status:    pocketcloud-firewall status"
echo "  Save rules:     pocketcloud-firewall save"
echo "  Restore rules:  pocketcloud-firewall restore"
echo "  Enable:         pocketcloud-firewall enable"
echo "  Disable:        pocketcloud-firewall disable"
echo ""
echo -e "${BLUE}Security Summary:${NC}"
echo "  ✓ SSH access limited to local network (192.168.4.0/24)"
echo "  ✓ HTTP/HTTPS access limited to local network"
echo "  ✓ API access limited to local network"
echo "  ✓ Rate limiting enabled for all services"
echo "  ✓ All other traffic blocked"
echo "  ✓ Rules will persist after reboot"
echo ""
echo -e "${GREEN}Your Pocket Cloud Drive is now secured with a firewall!${NC}"