# Pocket Cloud Drive Performance Guide

This document outlines the performance optimizations implemented for Raspberry Pi 4B and provides benchmarking instructions.

## Performance Targets

- **File upload to USB**: > 50 MB/s
- **Folder listing (100 files)**: < 50ms
- **Thumbnail generation (5MP JPEG)**: < 500ms
- **App initial load (cold)**: < 3s on WiFi
- **React bundle size**: < 400KB gzipped
- **API response times**: < 200ms
- **Boot time**: < 45 seconds

## Implemented Optimizations

### Backend Optimizations

#### 1. Caching Layer (`backend/src/middleware/cache.middleware.ts`)
- **LRU Cache**: In-memory caching for frequently accessed data
- **Folder listings**: 10s TTL, max 100 entries
- **File metadata**: 30s TTL, max 500 entries  
- **Storage stats**: 60s TTL, 1 entry
- **Smart invalidation**: Clears affected caches on write operations

#### 2. Compression (`backend/src/middleware/compression.ts`)
- **Gzip compression**: API JSON responses only
- **Threshold**: 1KB minimum size
- **Level 6**: Optimal for ARM CPU performance
- **Smart filtering**: Skips already compressed content

#### 3. Thumbnail Service (`backend/src/services/thumbnail.service.ts`)
- **Sharp optimization**: Pi 4B specific settings
- **WebP format**: Better compression than JPEG
- **Lazy generation**: Creates thumbnails on first request
- **Two sizes**: 150x150 (grid) and 800px wide (preview)
- **Quality 80, Effort 4**: Speed optimized for Pi

#### 4. Stream Utilities (`backend/src/utils/stream.utils.ts`)
- **Backpressure handling**: Prevents memory overflow
- **Range requests**: Efficient video streaming
- **64KB chunks**: Optimal for Pi 4B memory
- **Error recovery**: Graceful stream failure handling

#### 5. Database Optimizations (`backend/src/utils/db.utils.ts`)
- **Prepared statements**: Cached for frequent queries
- **Batch operations**: Reduces transaction overhead
- **Query optimization**: EXPLAIN QUERY PLAN helpers
- **Connection pooling**: Better-sqlite3 optimizations

### Frontend Optimizations

#### 1. Component Optimization
- **React.memo**: FileCard and FileRow components
- **useMemo**: Sorted/filtered file lists
- **useCallback**: All event handlers
- **Virtual scrolling**: Lists > 50 items

#### 2. Code Splitting
- **Lazy loading**: Each page loaded on demand
- **Manual chunks**: vendor, ui, utils separation
- **Asset optimization**: 4KB inline threshold

#### 3. Prefetching
- **Folder prefetch**: On hover for navigation
- **Query caching**: 30s stale time
- **Background updates**: Seamless data refresh

## Benchmarking Instructions

### 1. File Upload Speed Test

```bash
# Create test files
dd if=/dev/zero of=test_50mb.bin bs=1M count=50
dd if=/dev/zero of=test_100mb.bin bs=1M count=100

# Upload via curl and measure speed
time curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test_50mb.bin" \
  http://192.168.4.1:3000/api/upload/chunk

# Expected: > 50 MB/s to USB storage
```

### 2. Folder Listing Performance

```bash
# Create test folder with 100 files
mkdir test_folder
cd test_folder
for i in {1..100}; do
  echo "test content $i" > "file_$i.txt"
done

# Measure API response time
time curl -w "@curl-format.txt" \
  http://192.168.4.1:3000/api/folders/test-folder-id

# curl-format.txt content:
#     time_namelookup:  %{time_namelookup}\n
#        time_connect:  %{time_connect}\n
#     time_appconnect:  %{time_appconnect}\n
#    time_pretransfer:  %{time_pretransfer}\n
#       time_redirect:  %{time_redirect}\n
#  time_starttransfer:  %{time_starttransfer}\n
#                     ----------\n
#          time_total:  %{time_total}\n

# Expected: < 50ms total time
```

### 3. Thumbnail Generation Test

```bash
# Create 5MP test image
convert -size 2592x1944 xc:white test_5mp.jpg

# Upload and measure thumbnail generation
time curl -X POST \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test_5mp.jpg" \
  http://192.168.4.1:3000/api/upload/chunk

# Then request thumbnail
time curl http://192.168.4.1:3000/api/files/{file-id}/thumbnail/small

# Expected: < 500ms for generation
```

### 4. Frontend Bundle Size Check

```bash
cd frontend
npm run build

# Check gzipped sizes
find dist -name "*.js" -exec gzip -c {} \; | wc -c
find dist -name "*.css" -exec gzip -c {} \; | wc -c

# Expected: Total JS + CSS < 400KB gzipped
```

### 5. App Load Time Test

```bash
# Use lighthouse or browser dev tools
# Or automated with puppeteer:

node -e "
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  const start = Date.now();
  await page.goto('http://192.168.4.1:5173');
  await page.waitForSelector('[data-testid=\"file-browser\"]');
  const loadTime = Date.now() - start;
  
  console.log(\`Load time: \${loadTime}ms\`);
  await browser.close();
})();
"

# Expected: < 3000ms on WiFi
```

### 6. API Response Time Monitoring

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test concurrent requests
ab -n 100 -c 10 http://192.168.4.1:3000/api/folders

# Expected: Mean response time < 200ms
```

### 7. Boot Time Measurement

```bash
# Measure systemd boot time
systemd-analyze

# Measure service startup
systemd-analyze blame | grep pocketcloud

# Expected: Total boot < 45s, services < 10s
```

## Performance Monitoring

### 1. Backend Metrics

```bash
# Cache hit rates
curl http://192.168.4.1:3000/api/admin/cache-stats

# Database performance
curl http://192.168.4.1:3000/api/admin/db-stats

# Memory usage
free -h
```

### 2. Frontend Metrics

```javascript
// Add to app for monitoring
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log(`${entry.name}: ${entry.duration}ms`);
  }
});
observer.observe({ entryTypes: ['navigation', 'resource'] });
```

### 3. System Monitoring

```bash
# CPU and memory usage
htop

# Disk I/O
iotop

# Network usage
iftop

# Temperature monitoring
vcgencmd measure_temp
```

## Optimization Tips

### 1. Pi 4B Specific
- **USB 3.0**: Use USB 3.0 storage for best performance
- **Cooling**: Ensure adequate cooling to prevent throttling
- **Power supply**: Use official 3A power supply
- **SD card**: Use high-quality Class 10 SD card for OS

### 2. Network Optimization
- **WiFi channel**: Use less congested 5GHz channels
- **Bandwidth**: Limit concurrent connections if needed
- **Compression**: Enable for all text-based responses

### 3. Storage Optimization
- **File system**: Use ext4 with noatime for USB storage
- **Defragmentation**: Regular maintenance for large files
- **Cleanup**: Automated cleanup of temporary files

## Troubleshooting Performance Issues

### 1. Slow File Uploads
- Check USB storage speed: `hdparm -t /dev/sda1`
- Monitor CPU usage during upload
- Verify network bandwidth
- Check for thermal throttling

### 2. Slow API Responses
- Check database query performance
- Monitor cache hit rates
- Verify memory usage
- Check for blocking operations

### 3. High Memory Usage
- Monitor cache sizes
- Check for memory leaks in Node.js
- Verify virtual memory settings
- Monitor swap usage

### 4. Frontend Performance
- Check bundle sizes after updates
- Monitor React DevTools profiler
- Verify virtual scrolling is working
- Check for unnecessary re-renders

## Performance Regression Testing

Create automated tests to catch performance regressions:

```bash
#!/bin/bash
# performance-test.sh

echo "Running performance regression tests..."

# Test 1: API response times
echo "Testing API response times..."
RESPONSE_TIME=$(curl -w "%{time_total}" -s -o /dev/null http://192.168.4.1:3000/api/folders)
if (( $(echo "$RESPONSE_TIME > 0.2" | bc -l) )); then
  echo "FAIL: API response time ${RESPONSE_TIME}s > 200ms"
  exit 1
fi

# Test 2: Bundle size
echo "Testing bundle size..."
cd frontend && npm run build
BUNDLE_SIZE=$(find dist -name "*.js" -exec gzip -c {} \; | wc -c)
if [ $BUNDLE_SIZE -gt 409600 ]; then  # 400KB
  echo "FAIL: Bundle size ${BUNDLE_SIZE} bytes > 400KB"
  exit 1
fi

echo "All performance tests passed!"
```

Run this script after each deployment to ensure performance targets are maintained.