#!/bin/bash

# GPIO Setup Script for PocketCloud Drive Hardware Interface
# Configures I2C, SPI, and GPIO libraries for LED, OLED, and buttons

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== PocketCloud GPIO Hardware Setup ===${NC}"
echo "Configuring hardware interfaces for LED, OLED, and buttons..."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root${NC}"
    echo "Usage: sudo $0"
    exit 1
fi

# 1. Enable I2C interface (for OLED display)
echo -e "${YELLOW}1. Enabling I2C interface${NC}"
raspi-config nonint do_i2c 0
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} I2C interface enabled"
else
    echo -e "${RED}✗${NC} Failed to enable I2C interface"
    exit 1
fi

# 2. Enable SPI interface (may be needed for some displays)
echo -e "${YELLOW}2. Enabling SPI interface${NC}"
raspi-config nonint do_spi 0
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} SPI interface enabled"
else
    echo -e "${YELLOW}⚠${NC} SPI enable failed (may not be critical)"
fi

echo ""

# 3. Install system GPIO libraries
echo -e "${YELLOW}3. Installing system GPIO libraries${NC}"

# Update package list
apt-get update -qq

# Install pigpio daemon and libraries
echo "Installing pigpio..."
apt-get install -y pigpio python3-pigpio
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} pigpio installed"
else
    echo -e "${RED}✗${NC} Failed to install pigpio"
    exit 1
fi

# Install I2C tools
echo "Installing I2C tools..."
apt-get install -y i2c-tools
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} I2C tools installed"
else
    echo -e "${RED}✗${NC} Failed to install I2C tools"
    exit 1
fi

echo ""

# 4. Enable and start pigpio daemon
echo -e "${YELLOW}4. Configuring pigpio daemon${NC}"

# Enable pigpio daemon to start on boot
systemctl enable pigpiod
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} pigpiod service enabled"
else
    echo -e "${RED}✗${NC} Failed to enable pigpiod service"
    exit 1
fi

# Start pigpio daemon
systemctl start pigpiod
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} pigpiod service started"
else
    echo -e "${RED}✗${NC} Failed to start pigpiod service"
    exit 1
fi

# Wait for daemon to be ready
sleep 2

echo ""

# 5. Test I2C bus and detect OLED
echo -e "${YELLOW}5. Testing I2C bus and detecting OLED display${NC}"

# Check if I2C bus 1 is available
if [ -e /dev/i2c-1 ]; then
    echo -e "${GREEN}✓${NC} I2C bus 1 available"
    
    # Scan for I2C devices
    echo "Scanning I2C bus for devices..."
    i2c_scan=$(i2cdetect -y 1)
    echo "$i2c_scan"
    
    # Check for OLED at address 0x3C
    if echo "$i2c_scan" | grep -q "3c"; then
        echo -e "${GREEN}✓${NC} OLED display detected at address 0x3C"
    else
        echo -e "${YELLOW}⚠${NC} OLED display not detected at 0x3C (may not be connected)"
    fi
    
else
    echo -e "${RED}✗${NC} I2C bus 1 not available"
    echo "Check /boot/config.txt for dtparam=i2c_arm=on"
fi

echo ""

# 6. Install Node.js GPIO bindings
echo -e "${YELLOW}6. Installing Node.js GPIO bindings${NC}"

# Check if we're in the correct directory
if [ -d "/opt/pocketcloud/backend" ]; then
    cd /opt/pocketcloud/backend
elif [ -d "$(pwd)/pocket-cloud/backend" ]; then
    cd "$(pwd)/pocket-cloud/backend"
else
    echo -e "${YELLOW}⚠${NC} Backend directory not found, skipping npm install"
    echo "Run 'npm install pigpio oled-i2c-bus i2c-bus' in your backend directory"
fi

# Install Node.js packages if package.json exists
if [ -f "package.json" ]; then
    echo "Installing Node.js GPIO packages..."
    
    # Install pigpio bindings
    npm install pigpio
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} pigpio Node.js bindings installed"
    else
        echo -e "${RED}✗${NC} Failed to install pigpio bindings"
    fi
    
    # Install OLED libraries
    npm install oled-i2c-bus i2c-bus
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} OLED libraries installed"
    else
        echo -e "${RED}✗${NC} Failed to install OLED libraries"
    fi
    
else
    echo -e "${YELLOW}⚠${NC} package.json not found, install packages manually:"
    echo "  npm install pigpio oled-i2c-bus i2c-bus"
fi

echo ""
# 7. Configure GPIO permissions
echo -e "${YELLOW}7. Configuring GPIO permissions${NC}"

# Add pi user to gpio group
usermod -a -G gpio pi
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} User 'pi' added to gpio group"
else
    echo -e "${YELLOW}⚠${NC} Failed to add user to gpio group (may already be member)"
fi

# Set GPIO permissions
if [ -d "/sys/class/gpio" ]; then
    chown -R root:gpio /sys/class/gpio
    chmod -R 664 /sys/class/gpio
    echo -e "${GREEN}✓${NC} GPIO permissions configured"
else
    echo -e "${YELLOW}⚠${NC} GPIO sysfs not available"
fi

echo ""

# 8. Test GPIO functionality
echo -e "${YELLOW}8. Testing GPIO functionality${NC}"

# Test pigpio daemon connection
if pigs hwver > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} pigpio daemon responding"
    
    # Get Pi hardware version
    hw_version=$(pigs hwver)
    echo "Hardware version: $hw_version"
    
else
    echo -e "${RED}✗${NC} pigpio daemon not responding"
    echo "Try: sudo systemctl restart pigpiod"
fi

# Test GPIO pin access (non-destructive)
echo "Testing GPIO pin access..."
if pigs modes 18 0 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} GPIO pin access working"
    # Reset pin to input
    pigs modes 18 0
else
    echo -e "${RED}✗${NC} GPIO pin access failed"
fi

echo ""

# 9. Create hardware test script
echo -e "${YELLOW}9. Creating hardware test script${NC}"

cat > /usr/local/bin/test-pocketcloud-hardware << 'EOF'
#!/bin/bash

# PocketCloud Hardware Test Script
echo "=== PocketCloud Hardware Test ==="

echo "1. Testing I2C bus..."
if i2cdetect -y 1 | grep -q "3c"; then
    echo "✓ OLED display detected"
else
    echo "✗ OLED display not found"
fi

echo ""
echo "2. Testing pigpio daemon..."
if pigs hwver > /dev/null 2>&1; then
    echo "✓ pigpio daemon working"
    echo "Hardware version: $(pigs hwver)"
else
    echo "✗ pigpio daemon not responding"
fi

echo ""
echo "3. Testing GPIO pins..."
# Test LED pins (non-destructive)
for pin in 17 27 22; do
    if pigs modes $pin 1 > /dev/null 2>&1; then
        echo "✓ GPIO $pin accessible"
        pigs modes $pin 0  # Reset to input
    else
        echo "✗ GPIO $pin failed"
    fi
done

echo ""
echo "4. Testing button pins..."
# Test button pins
for pin in 3 26; do
    if pigs modes $pin 0 > /dev/null 2>&1; then
        echo "✓ GPIO $pin (button) accessible"
    else
        echo "✗ GPIO $pin (button) failed"
    fi
done

echo ""
echo "Hardware test complete!"
EOF

chmod +x /usr/local/bin/test-pocketcloud-hardware
echo -e "${GREEN}✓${NC} Hardware test script created: /usr/local/bin/test-pocketcloud-hardware"

echo ""

# 10. Update boot configuration if needed
echo -e "${YELLOW}10. Checking boot configuration${NC}"

boot_config="/boot/config.txt"
config_updated=false

# Check if I2C is enabled in config
if ! grep -q "dtparam=i2c_arm=on" "$boot_config"; then
    echo "dtparam=i2c_arm=on" >> "$boot_config"
    config_updated=true
    echo -e "${GREEN}✓${NC} I2C enabled in boot config"
fi

# Check if SPI is enabled in config
if ! grep -q "dtparam=spi=on" "$boot_config"; then
    echo "dtparam=spi=on" >> "$boot_config"
    config_updated=true
    echo -e "${GREEN}✓${NC} SPI enabled in boot config"
fi

# Add GPIO configuration section if not present
if ! grep -q "# PocketCloud GPIO Configuration" "$boot_config"; then
    cat >> "$boot_config" << 'EOF'

# PocketCloud GPIO Configuration
# Enable I2C for OLED display
dtparam=i2c_arm=on
dtparam=i2c1=on

# Enable SPI (optional)
dtparam=spi=on

# GPIO pull-up/down configuration
# Power button (GPIO 3) - built-in pull-up
# WiFi button (GPIO 26) - enable pull-up
gpio=26=pu

# LED pins (GPIO 17, 27, 22) - no pull resistors needed
EOF
    config_updated=true
    echo -e "${GREEN}✓${NC} GPIO configuration added to boot config"
fi

if [ "$config_updated" = true ]; then
    echo -e "${YELLOW}⚠${NC} Boot configuration updated - reboot required"
fi

echo ""

# Final summary
echo -e "${BLUE}=== GPIO Setup Complete ===${NC}"
echo ""
echo "Hardware interfaces configured:"
echo "• I2C bus 1 enabled (OLED display)"
echo "• SPI enabled (optional)"
echo "• pigpio daemon installed and running"
echo "• GPIO permissions configured"
echo "• Node.js bindings ready for installation"
echo ""

echo "GPIO Pin Assignments:"
echo "• RGB LED: GPIO 17 (Red), 27 (Green), 22 (Blue)"
echo "• OLED Display: I2C bus 1 (SDA=GPIO 2, SCL=GPIO 3)"
echo "• Power Button: GPIO 3 (built-in)"
echo "• WiFi Button: GPIO 26 (optional)"
echo ""

echo "Next steps:"
echo "1. Connect hardware according to wiring diagram"
echo "2. Run: test-pocketcloud-hardware"
echo "3. Install Node.js packages: npm install pigpio oled-i2c-bus i2c-bus"
echo "4. Start PocketCloud GPIO service"

if [ "$config_updated" = true ]; then
    echo ""
    echo -e "${YELLOW}REBOOT REQUIRED${NC} - Boot configuration was updated"
    echo "Run: sudo reboot"
fi

echo ""
echo -e "${GREEN}GPIO setup completed successfully!${NC}"