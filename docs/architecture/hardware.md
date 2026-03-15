# Hardware Optimization Guide

Complete guide for optimizing Raspberry Pi 4B hardware for PocketCloud Drive performance.

## Quick Start

```bash
# 1. Run optimization script (one-time setup)
sudo ./scripts/optimize-pi.sh

# 2. Test stability
sudo ./scripts/benchmark.sh

# 3. Monitor performance
./scripts/boot-report.sh
```

## Performance Targets

- **Boot Time**: <30 seconds to fully running system
- **CPU**: Stable 1900MHz under load
- **GPU**: 600MHz for hardware acceleration  
- **Temperature**: Never exceed 80°C during normal use
- **USB 3.0**: >80 MB/s sustained write speed
- **WiFi**: >40 Mbps throughput

## Optimization Components

### 1. CPU/GPU Overclocking

**Safe Settings** (tested stable):
```
over_voltage=4
arm_freq=1900
gpu_freq=600
```

**Aggressive Settings** (requires excellent cooling):
```
over_voltage=6
arm_freq=2000
gpu_freq=700
```

### 2. Memory Optimization

- **Swap**: Completely disabled (extends SD card life)
- **Huge Pages**: 64 pages (128MB) for SQLite performance
- **Dirty Pages**: Optimized for USB drive writes
- **Network Buffers**: Increased for high throughput

### 3. Storage Performance

- **microSD**: Overclocked to 100MHz
- **USB 3.0**: PCIe Gen 2, host mode optimization
- **File System**: ext4 with optimized mount options

### 4. Thermal Management

Four-zone thermal protection system:

| Zone | Temperature | Actions |
|------|-------------|---------|
| 1 | <60°C | Normal operation |
| 2 | 60-70°C | Log warnings every 5 minutes |
| 3 | 70-80°C | Pause transcoding, limit uploads to 2 |
| 4 | >80°C | Pause all background processing, alert admin |

## Installation Steps

### 1. Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd pocket-cloud

# Run optimization (requires reboot)
sudo ./scripts/optimize-pi.sh
sudo reboot

# After reboot, test stability
sudo ./scripts/benchmark.sh
```

### 2. Verify Overclocking

```bash
# Check CPU frequency
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq

# Check GPU frequency  
vcgencmd measure_clock core

# Monitor temperature
watch -n 1 vcgencmd measure_temp

# Check for throttling
vcgencmd get_throttled
```

### 3. Performance Testing

The benchmark script tests:
- CPU performance (>2000 events/sec)
- USB 3.0 write speed (>80 MB/s)
- microSD write speed (>40 MB/s)  
- WiFi throughput (>40 Mbps)
- Thermal stability under load

## Cooling Requirements

### Minimum (Required)
- **Heatsink**: Aluminum with thermal pad
- **Case**: Ventilated case with airflow

### Recommended  
- **Active Cooling**: 5V fan (GPIO controlled)
- **Heatsink**: Copper or aluminum with thermal compound
- **Case**: Open-air or fan-assisted case

### Extreme Performance
- **Liquid Cooling**: Custom loop or AIO
- **Thermal Compound**: High-quality paste (replace yearly)
- **Case**: Custom with multiple fans
## Stability Verification

### Signs of Stable Overclocking
- ✅ System boots consistently
- ✅ No random reboots or freezes
- ✅ Temperature stays <80°C under load
- ✅ No filesystem corruption
- ✅ Benchmark tests pass consistently

### Signs of Instability
- ❌ Random reboots or system freezes
- ❌ Filesystem errors or corruption
- ❌ Temperature >85°C sustained
- ❌ Benchmark failures
- ❌ Network disconnections
- ❌ USB device disconnections

### Troubleshooting Instability

**If system becomes unstable:**

1. **Reduce Overclocking**:
   ```bash
   # Edit /boot/config.txt
   sudo nano /boot/config.txt
   
   # Reduce settings:
   over_voltage=2
   arm_freq=1800
   gpu_freq=550
   ```

2. **Check Power Supply**:
   - Use official Pi 4 power supply (5V 3A)
   - Check for voltage warnings: `vcgencmd get_throttled`
   - Ensure USB devices don't exceed power budget

3. **Improve Cooling**:
   - Add heatsink if missing
   - Install case fan
   - Ensure proper airflow
   - Replace thermal compound

4. **Test Hardware**:
   ```bash
   # Memory test
   sudo apt install memtester
   sudo memtester 1000M 1
   
   # Storage test
   sudo badblocks -v /dev/mmcblk0
   ```

## Hardware Monitoring

### Real-time Monitoring

```bash
# Temperature monitoring
watch -n 1 'vcgencmd measure_temp && vcgencmd get_throttled'

# CPU frequency monitoring  
watch -n 1 'cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq'

# Memory usage
watch -n 1 'free -h && cat /proc/meminfo | grep -E "Dirty|Writeback"'

# USB performance
sudo iotop -a
```

### Automated Monitoring

The thermal service provides automatic monitoring:

```bash
# Check thermal status via API
curl http://localhost:3000/api/system/thermal

# WebSocket events
# THERMAL_STATUS events broadcast temperature changes
```

### Log Analysis

```bash
# Check for thermal throttling
journalctl -u pocketcloud-backend | grep -i thermal

# Check for hardware errors
dmesg | grep -E "(error|fail|warn)"

# Check filesystem health
sudo fsck -n /dev/sda1  # USB drive
sudo fsck -n /dev/mmcblk0p2  # SD card root
```

## Performance Tuning

### Network Optimization

```bash
# WiFi power management (already in optimize-pi.sh)
sudo iwconfig wlan0 power off

# Network buffer tuning (in optimize-ram.sh)
echo 'net.core.rmem_max=134217728' >> /etc/sysctl.conf
```

### Storage Optimization

```bash
# USB drive mount options
/dev/sda1 /mnt/pocketcloud ext4 defaults,noatime,commit=60 0 2

# SD card optimization
/dev/mmcblk0p2 / ext4 defaults,noatime 0 1
```

### Process Priorities

```bash
# High priority for PocketCloud backend
sudo systemctl edit pocketcloud-backend
# Add:
# [Service]
# Nice=-10
# IOSchedulingClass=1
# IOSchedulingPriority=4
```

## Hardware Upgrades

### Storage Upgrades
- **USB 3.0 SSD**: Samsung T7, SanDisk Extreme Pro
- **High-Speed SD**: SanDisk Extreme Pro A2 V30
- **USB 3.0 Hub**: Powered hub for multiple drives

### Cooling Upgrades
- **Argon ONE M.2**: Case with SSD slot and fan
- **ICE Tower**: Large tower cooler
- **Pimoroni Fan SHIM**: Compact fan solution

### Power Upgrades
- **Official Pi 4 PSU**: 5V 3A USB-C
- **PoE+ HAT**: Power over Ethernet (requires PoE+ switch)
- **UPS HAT**: Battery backup for power outages

## Maintenance Schedule

### Weekly
- Check temperature logs
- Monitor disk usage
- Review system logs for errors

### Monthly  
- Run benchmark tests
- Check for firmware updates
- Clean dust from heatsink/fan

### Yearly
- Replace thermal compound
- Check SD card health
- Update system packages

## Emergency Recovery

### Safe Mode Boot
If system won't boot after overclocking:

1. **Remove SD card**
2. **Edit config.txt on another computer**
3. **Comment out overclock settings**:
   ```
   #over_voltage=4
   #arm_freq=1900
   #gpu_freq=600
   ```
4. **Reinsert SD card and boot**

### Factory Reset
```bash
# Reset to default config
sudo cp /boot/config.txt.backup /boot/config.txt
sudo reboot

# Or use recovery partition (if available)
sudo raspi-config --expand-rootfs
```

## Support and Resources

### Official Documentation
- [Raspberry Pi Configuration](https://www.raspberrypi.org/documentation/configuration/)
- [Overclocking Guide](https://www.raspberrypi.org/documentation/configuration/config-txt/overclocking.md)

### Community Resources
- [Pi Forums](https://www.raspberrypi.org/forums/)
- [Reddit r/raspberry_pi](https://reddit.com/r/raspberry_pi)

### Monitoring Tools
- `vcgencmd` - GPU/CPU monitoring
- `htop` - Process monitoring  
- `iotop` - I/O monitoring
- `nethogs` - Network monitoring

---

**⚠️ Important**: Always test thoroughly after making changes. Start with conservative settings and gradually increase performance while monitoring stability.

## GPIO Hardware Interface

### Wiring Diagram

```
Raspberry Pi 4B GPIO Header (40-pin)
┌─────────────────────────────────────┐
│  1  3.3V ●────────────────● VCC     │ OLED Display
│  2  5V   ●                          │ (SSD1306 128x64)
│  3  SDA  ●────────────────● SDA     │ I2C Address: 0x3C
│  4  5V   ●                          │
│  5  SCL  ●────────────────● SCL     │
│  6  GND  ●                          │
│  7       ●                          │
│  8       ●                          │
│  9  GND  ●────────────────● GND     │
│ 10       ●                          │
│ 11 GPIO17●──[330Ω]───────● Red LED  │ RGB Status LED
│ 12       ●                          │ (Common Cathode)
│ 13 GPIO27●──[330Ω]───────● Green    │
│ 14 GND   ●────────────────● Cathode │
│ 15 GPIO22●──[330Ω]───────● Blue     │
│ 16       ●                          │
│ 17 3.3V  ●                          │
│ 18       ●                          │
│ 19       ●                          │
│ 20 GND   ●                          │
│ 21       ●                          │
│ 22       ●                          │
│ 23       ●                          │
│ 24       ●                          │
│ 25 GND   ●                          │
│ 26       ●                          │
│ 27       ●                          │
│ 28       ●                          │
│ 29       ●                          │
│ 30 GND   ●                          │
│ 31       ●                          │
│ 32       ●                          │
│ 33       ●                          │
│ 34 GND   ●                          │
│ 35       ●                          │
│ 36       ●                          │
│ 37 GPIO26●──────────────[Button]────● GND  WiFi Button
│ 38       ●                          │     (Optional)
│ 39 GND   ●                          │
│ 40       ●                          │
└─────────────────────────────────────┘

Power Button: GPIO 3 (Pin 5) - Built into Pi 4B
Pull-up resistors: Internal (enabled in software)
```

### Component Specifications

**RGB LED (Common Cathode)**
- Forward voltage: 2.0V (Red), 3.2V (Green/Blue)
- Forward current: 20mA maximum
- Resistor values: 330Ω for all colors
- Viewing angle: 120° typical

**OLED Display (SSD1306)**
- Resolution: 128×64 pixels
- Interface: I2C (400kHz max)
- Supply voltage: 3.3V
- Current consumption: 20mA typical

**Tactile Buttons**
- Actuation force: 160gf ± 50gf
- Travel distance: 0.25mm
- Contact resistance: <100mΩ
- Bounce time: <5ms

### Alternative: NeoPixel LED

For single-wire addressable LED (WS2812B):

```
Pi GPIO 18 ●──────────────● Data In   │ NeoPixel LED
Pi 5V      ●──────────────● VCC       │ (WS2812B)
Pi GND     ●──────────────● GND       │
```

**NeoPixel Advantages:**
- Single GPIO pin control
- Brighter colors and effects
- Chainable for multiple LEDs
- Built-in PWM control

**NeoPixel Considerations:**
- Requires 5V power supply
- More complex software control
- Higher power consumption
- Sensitive to voltage drops

### Hardware Setup Commands

```bash
# Enable I2C and GPIO interfaces
sudo raspi-config nonint do_i2c 0
sudo raspi-config nonint do_spi 0

# Install GPIO libraries
sudo apt install -y pigpio python3-pigpio i2c-tools

# Start pigpio daemon
sudo systemctl enable pigpiod
sudo systemctl start pigpiod

# Test I2C bus (should show 0x3C for OLED)
sudo i2cdetect -y 1

# Test GPIO access
pigs modes 17 1  # Set GPIO 17 as output
pigs pwm 17 128  # Set 50% brightness
pigs modes 17 0  # Reset to input
```

### Software Integration

The hardware interface is managed by three services:

1. **LED Service** (`led.service.ts`)
   - RGB color control and animations
   - Status indication based on system state
   - Pulse, blink, and rainbow effects

2. **OLED Service** (`oled.service.ts`)
   - System information display
   - Multiple screen layouts
   - Button-controlled screen cycling

3. **Button Service** (`button.service.ts`)
   - Power and WiFi button handling
   - Short/long/very-long press detection
   - Graceful shutdown and WiFi management

4. **GPIO Daemon** (`gpio-daemon.ts`)
   - Standalone hardware interface process
   - Runs independently of main backend
   - Ensures hardware feedback during crashes

### Status LED Language

Users learn these patterns for at-a-glance system status:

| Pattern | Color | Meaning |
|---------|-------|---------|
| Solid | Green | All good, Pi running normally |
| Slow pulse | Green | No clients connected (standby) |
| Solid | Blue | File transfer in progress |
| Fast pulse | Blue | Upload/download active (>1 MB/s) |
| Solid | Amber | System warning (high temp, low storage) |
| Fast pulse | Amber | Update available or backup needed |
| Solid | Red | Error state, service crashed |
| Pulse | Red + Blue | Shutting down (1 second before power off) |
| Rainbow cycle | Multi | First boot / setup mode |
| Fast pulse | White | New user just connected |

### Button Functions

**Power Button (GPIO 3)**
- Short press (<2s): Toggle display on/off (prevent OLED burn-in)
- Long press (2-5s): Graceful shutdown with 3-second countdown
- Very long press (>10s): Emergency shutdown (immediate)

**WiFi Button (GPIO 26) - Optional**
- Short press: Show WiFi password on OLED for 30 seconds
- Long press: Reset WiFi password to random + restart hostapd
- Very long press: Cycle through OLED screens

### Troubleshooting Hardware

**LED Issues:**
```bash
# Test LED manually
pigs modes 17 1; pigs pwm 17 255  # Red full brightness
pigs modes 27 1; pigs pwm 27 255  # Green full brightness  
pigs modes 22 1; pigs pwm 22 255  # Blue full brightness
pigs modes 17 0; pigs modes 27 0; pigs modes 22 0  # Reset
```

**OLED Issues:**
```bash
# Check I2C connection
sudo i2cdetect -y 1

# Test with Python
python3 -c "
import smbus
bus = smbus.SMBus(1)
try:
    bus.read_byte(0x3C)
    print('OLED detected')
except:
    print('OLED not found')
"
```

**Button Issues:**
```bash
# Test button state
pigs modes 3 0; pigs pud 3 2   # Set input with pull-up
pigs read 3                    # Should return 1 (not pressed)

# Monitor button presses
pigs modes 26 0; pigs pud 26 2
watch -n 0.1 'pigs read 26'
```

### Performance Considerations

- **I2C Speed**: Default 100kHz, can increase to 400kHz for faster OLED updates
- **PWM Frequency**: 1kHz default for LED control (flicker-free)
- **Update Rate**: 5-second intervals for system status, 10-second for temperature
- **Power Consumption**: ~50mA total for all hardware interfaces

### Safety Features

- **Thermal Protection**: LED indicates overheating, buttons can trigger shutdown
- **Graceful Shutdown**: 3-second countdown prevents accidental power-off
- **Display Protection**: Auto-off prevents OLED burn-in
- **Error Indication**: Red LED shows system errors even if backend crashes
- **Independent Operation**: GPIO daemon works without main application