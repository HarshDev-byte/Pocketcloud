#!/bin/bash

# Raspberry Pi 4B Performance Benchmark Script
# Tests system stability after overclocking
# Run after optimize-pi.sh to verify stable operation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
RESULTS_FILE="/tmp/benchmark-results.txt"
TEMP_LOG="/tmp/temp-log.txt"
FAILED_TESTS=0

echo -e "${BLUE}=== Raspberry Pi 4B Performance Benchmark ===${NC}"
echo "Testing system stability after overclocking..."
echo "Results will be saved to: $RESULTS_FILE"
echo ""

# Initialize results file
cat > "$RESULTS_FILE" << EOF
Raspberry Pi 4B Benchmark Results
Generated: $(date)
Hostname: $(hostname)
Kernel: $(uname -r)
CPU: $(cat /proc/cpuinfo | grep "Model" | head -1 | cut -d: -f2 | xargs)

EOF

# Function to log temperature
log_temp() {
    local temp=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo "45000")
    local temp_c=$((temp / 1000))
    echo "$(date '+%H:%M:%S') ${temp_c}°C" >> "$TEMP_LOG"
    echo "$temp_c"
}

# Function to check if test passed
check_result() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"
    local unit="$4"
    
    if (( $(echo "$actual >= $expected" | bc -l) )); then
        echo -e "${GREEN}✓ PASS${NC} - $test_name: $actual $unit (expected: ≥$expected $unit)"
        echo "PASS - $test_name: $actual $unit" >> "$RESULTS_FILE"
    else
        echo -e "${RED}✗ FAIL${NC} - $test_name: $actual $unit (expected: ≥$expected $unit)"
        echo "FAIL - $test_name: $actual $unit" >> "$RESULTS_FILE"
        ((FAILED_TESTS++))
    fi
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"
if ! command -v sysbench &> /dev/null; then
    echo "Installing sysbench..."
    sudo apt-get update -qq
    sudo apt-get install -y sysbench bc
fi

if ! command -v iperf3 &> /dev/null; then
    echo "Installing iperf3..."
    sudo apt-get install -y iperf3
fi

# Check current CPU frequency
echo -e "${YELLOW}Current system status:${NC}"
cpu_freq=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null || echo "1500000")
cpu_freq_mhz=$((cpu_freq / 1000))
echo "CPU Frequency: ${cpu_freq_mhz} MHz"

gpu_freq=$(vcgencmd measure_clock core 2>/dev/null | cut -d= -f2 || echo "500000000")
gpu_freq_mhz=$((gpu_freq / 1000000))
echo "GPU Frequency: ${gpu_freq_mhz} MHz"

initial_temp=$(log_temp)
echo "Initial Temperature: ${initial_temp}°C"
echo ""

# Clear temp log
> "$TEMP_LOG"
# Test 1: CPU Performance
echo -e "${YELLOW}Test 1: CPU Performance${NC}"
echo "Running CPU benchmark (prime number calculation)..."
echo "Test 1: CPU Performance" >> "$RESULTS_FILE"

cpu_start_temp=$(log_temp)
cpu_result=$(sysbench cpu --cpu-max-prime=20000 --time=30 run 2>/dev/null | grep "events per second" | awk '{print $4}')
cpu_end_temp=$(log_temp)

if [ -z "$cpu_result" ]; then
    cpu_result="0"
fi

check_result "CPU Performance" "2000" "$cpu_result" "events/sec"
echo "Temperature: ${cpu_start_temp}°C → ${cpu_end_temp}°C"
echo ""

# Test 2: USB 3.0 Write Speed
echo -e "${YELLOW}Test 2: USB 3.0 Write Speed${NC}"
echo "Testing write speed to /mnt/pocketcloud..."
echo "Test 2: USB 3.0 Write Speed" >> "$RESULTS_FILE"

if [ -d "/mnt/pocketcloud" ]; then
    usb_start_temp=$(log_temp)
    
    # Test write speed (1GB file)
    usb_write_result=$(dd if=/dev/zero of=/mnt/pocketcloud/benchmark_test bs=1M count=1000 conv=fdatasync 2>&1 | grep "MB/s" | tail -1 | awk '{print $(NF-1)}' || echo "0")
    
    # Clean up test file
    rm -f /mnt/pocketcloud/benchmark_test
    
    usb_end_temp=$(log_temp)
    
    check_result "USB 3.0 Write" "80" "$usb_write_result" "MB/s"
    echo "Temperature: ${usb_start_temp}°C → ${usb_end_temp}°C"
else
    echo -e "${YELLOW}⚠ SKIP${NC} - /mnt/pocketcloud not mounted"
    echo "SKIP - USB drive not mounted" >> "$RESULTS_FILE"
fi
echo ""

# Test 3: microSD Write Speed
echo -e "${YELLOW}Test 3: microSD Write Speed${NC}"
echo "Testing write speed to microSD card..."
echo "Test 3: microSD Write Speed" >> "$RESULTS_FILE"

sd_start_temp=$(log_temp)
sd_write_result=$(dd if=/dev/zero of=/tmp/benchmark_test bs=1M count=100 conv=fdatasync 2>&1 | grep "MB/s" | tail -1 | awk '{print $(NF-1)}' || echo "0")
rm -f /tmp/benchmark_test
sd_end_temp=$(log_temp)

check_result "microSD Write" "40" "$sd_write_result" "MB/s"
echo "Temperature: ${sd_start_temp}°C → ${sd_end_temp}°C"
echo ""

# Test 4: WiFi Throughput (if available)
echo -e "${YELLOW}Test 4: WiFi Throughput${NC}"
echo "Testing WiFi performance..."
echo "Test 4: WiFi Throughput" >> "$RESULTS_FILE"

# Check if WiFi is connected
if iwconfig 2>/dev/null | grep -q "ESSID"; then
    echo "WiFi detected. Starting iperf3 server for 30 seconds..."
    echo "Run this on a client machine: iperf3 -c $(hostname -I | awk '{print $1}') -t 20"
    echo "Press Ctrl+C to skip this test if no client is available"
    
    wifi_start_temp=$(log_temp)
    
    # Start iperf3 server with timeout
    timeout 35s iperf3 -s > /tmp/iperf3_result.txt 2>&1 &
    iperf_pid=$!
    
    # Wait for test to complete or timeout
    wait $iperf_pid 2>/dev/null || true
    
    wifi_end_temp=$(log_temp)
    
    # Parse results
    if [ -f "/tmp/iperf3_result.txt" ]; then
        wifi_result=$(grep "receiver" /tmp/iperf3_result.txt | tail -1 | awk '{print $7}' || echo "0")
        if [ "$wifi_result" != "0" ] && [ -n "$wifi_result" ]; then
            check_result "WiFi Throughput" "40" "$wifi_result" "Mbits/sec"
            echo "Temperature: ${wifi_start_temp}°C → ${wifi_end_temp}°C"
        else
            echo -e "${YELLOW}⚠ SKIP${NC} - No client connected for WiFi test"
            echo "SKIP - No client connected" >> "$RESULTS_FILE"
        fi
        rm -f /tmp/iperf3_result.txt
    else
        echo -e "${YELLOW}⚠ SKIP${NC} - WiFi test failed to start"
        echo "SKIP - Test failed to start" >> "$RESULTS_FILE"
    fi
else
    echo -e "${YELLOW}⚠ SKIP${NC} - WiFi not connected"
    echo "SKIP - WiFi not connected" >> "$RESULTS_FILE"
fi
echo ""
# Test 5: Thermal Load Test
echo -e "${YELLOW}Test 5: Thermal Load Test${NC}"
echo "Running combined load test for 5 minutes..."
echo "Test 5: Thermal Load Test" >> "$RESULTS_FILE"

thermal_start_temp=$(log_temp)
echo "Starting thermal load test at ${thermal_start_temp}°C"

# Start background CPU load
sysbench cpu --cpu-max-prime=50000 --time=300 run > /dev/null 2>&1 &
cpu_load_pid=$!

# Start background I/O load (if USB drive available)
if [ -d "/mnt/pocketcloud" ]; then
    (
        for i in {1..10}; do
            dd if=/dev/zero of=/mnt/pocketcloud/load_test_$i bs=1M count=100 conv=fdatasync > /dev/null 2>&1
            rm -f /mnt/pocketcloud/load_test_$i
            sleep 5
        done
    ) &
    io_load_pid=$!
fi

# Monitor temperature for 5 minutes
echo "Monitoring temperature for 5 minutes..."
max_temp=0
temp_readings=0
temp_sum=0

for i in {1..30}; do  # 30 readings over 5 minutes (10 second intervals)
    sleep 10
    current_temp=$(log_temp)
    temp_sum=$((temp_sum + current_temp))
    temp_readings=$((temp_readings + 1))
    
    if [ "$current_temp" -gt "$max_temp" ]; then
        max_temp=$current_temp
    fi
    
    echo -n "."
    
    # Check for thermal throttling
    if [ "$current_temp" -gt 80 ]; then
        echo -e "\n${RED}⚠ WARNING: Temperature exceeded 80°C (${current_temp}°C)${NC}"
    fi
done

echo ""

# Stop background processes
kill $cpu_load_pid 2>/dev/null || true
if [ -n "$io_load_pid" ]; then
    kill $io_load_pid 2>/dev/null || true
fi

# Wait for processes to clean up
sleep 5

thermal_end_temp=$(log_temp)
avg_temp=$((temp_sum / temp_readings))

echo "Thermal test results:"
echo "  Start: ${thermal_start_temp}°C"
echo "  End: ${thermal_end_temp}°C"
echo "  Max: ${max_temp}°C"
echo "  Average: ${avg_temp}°C"

# Check thermal performance
if [ "$max_temp" -le 80 ]; then
    echo -e "${GREEN}✓ PASS${NC} - Maximum temperature: ${max_temp}°C (≤80°C)"
    echo "PASS - Thermal test: max ${max_temp}°C" >> "$RESULTS_FILE"
else
    echo -e "${RED}✗ FAIL${NC} - Maximum temperature: ${max_temp}°C (>80°C)"
    echo "FAIL - Thermal test: max ${max_temp}°C" >> "$RESULTS_FILE"
    ((FAILED_TESTS++))
fi

echo ""

# Final Results
echo -e "${BLUE}=== Benchmark Summary ===${NC}"
echo ""

if [ "$FAILED_TESTS" -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED${NC}"
    echo "Your Raspberry Pi 4B is running stable with the current overclock settings."
    echo "OVERALL: PASS - All tests passed" >> "$RESULTS_FILE"
else
    echo -e "${RED}❌ $FAILED_TESTS TEST(S) FAILED${NC}"
    echo "Consider reducing overclock settings or improving cooling."
    echo "OVERALL: FAIL - $FAILED_TESTS tests failed" >> "$RESULTS_FILE"
fi

echo ""
echo "Detailed results saved to: $RESULTS_FILE"
echo "Temperature log saved to: $TEMP_LOG"

# Show temperature graph if gnuplot is available
if command -v gnuplot &> /dev/null && [ -s "$TEMP_LOG" ]; then
    echo ""
    echo "Temperature graph (last 50 readings):"
    tail -50 "$TEMP_LOG" | awk '{print NR, $2}' | gnuplot -e "
        set terminal dumb 80 20;
        set title 'Temperature During Benchmark';
        set xlabel 'Time';
        set ylabel 'Temperature (°C)';
        plot '-' with lines title 'CPU Temp'
    " 2>/dev/null || echo "Could not generate temperature graph"
fi

echo ""
echo "Benchmark complete!"

exit $FAILED_TESTS