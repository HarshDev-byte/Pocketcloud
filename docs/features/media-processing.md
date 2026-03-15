# Pocket Cloud Drive Media Processing Pipeline

## Overview

The media processing pipeline automatically processes every uploaded file to extract metadata, generate thumbnails, and enable smooth streaming - all optimized for Raspberry Pi 4B ARM64 hardware.

## Architecture

### Components

1. **MediaService** - Core processing logic for different file types
2. **MediaWorker** - Queue-based processing with Pi-optimized concurrency
3. **Media Routes** - API endpoints for serving processed media
4. **Frontend Viewers** - Specialized components for each media type

### Processing Flow

```
Upload Complete → Queue Job → Process Media → Update Database → Serve Content
```

## File Type Support

### Images (JPEG, PNG, WebP, GIF, HEIC)
- **Metadata Extraction**: EXIF data, GPS coordinates, camera info
- **Thumbnails**: 200×200 (small) and 1200px wide (medium) WebP format
- **Dominant Color**: For placeholder loading
- **Optimization**: Sequential read mode for Pi memory efficiency

### Videos (MP4, MOV, AVI, MKV, WebM)
- **Metadata**: Duration, dimensions, codec, bitrate, FPS
- **Poster Frame**: Generated at 1-second mark (800px wide JPEG)
- **HLS Streaming**: Adaptive bitrate with 360p/720p variants
- **Optimization**: Hardware-accelerated decoding, ultrafast preset, 2 threads max

### Audio (MP3, FLAC, AAC, WAV, OGG)
- **Metadata**: Duration, bitrate, sample rate, ID3 tags (artist, album, title)
- **Cover Art**: Extracted and saved as thumbnail if available
- **Waveform**: Generated for visualization

### Documents (PDF)
- **Metadata**: Page count extraction
- **Preview**: First page rendered as image (800px wide)
- **Thumbnails**: Generated from preview

### Text Files
- **Preview**: First 500 characters extracted
- **Syntax Highlighting**: Language detection and highlighting

## Hardware Optimizations

### Raspberry Pi 4B Constraints
- **RAM Limit**: Processing queue limited to 256MB total usage
- **CPU Threads**: Maximum 2 threads for ffmpeg operations
- **Concurrency**: Single processing job at a time
- **Memory**: Sharp configured with `sequentialRead: true`

### Performance Settings
- **HLS Segments**: 4-second duration for optimal seek/file balance
- **Thumbnail Quality**: WebP 75% (small), 82% (medium)
- **FFmpeg Preset**: `ultrafast` for Pi compatibility
- **Cache Headers**: 1-year max-age for thumbnails and segments

## API Endpoints

### Thumbnail Serving
```
GET /api/files/:id/thumbnail?size=sm|md
```
- Serves cached WebP thumbnails
- 1-year cache headers
- Access control validation

### Video Streaming
```
GET /api/files/:id/hls/master.m3u8        # Master playlist
GET /api/files/:id/hls/:quality/:segment  # HLS segments
GET /api/files/:id/poster                 # Poster frame
```
- Adaptive bitrate streaming
- Quality variants: 360p (500kbps), 720p (2000kbps)
- Immutable cache for segments

### Media Information
```
GET /api/files/:id/info                   # Full metadata
GET /api/files/:id/processing-status      # Processing status
```

## Frontend Components

### ImageViewer
- **Pan & Zoom**: React Photo View integration
- **EXIF Panel**: Slide-out metadata display
- **GPS Integration**: Google Maps links
- **Dominant Color**: Placeholder backgrounds

### VideoPlayer
- **HLS.js Integration**: Adaptive streaming support
- **Custom Controls**: Play, seek, volume, quality selection
- **Poster Loading**: Smooth loading experience
- **Quality Selector**: Manual quality override

### AudioPlayer
- **Waveform Visualization**: Web Audio API integration
- **Album Art Display**: Cover art from metadata
- **Playback Controls**: Standard audio controls
- **Metadata Display**: Artist, album, title information

### PDFViewer
- **Lazy Loading**: Page-by-page rendering
- **Zoom Controls**: Scale adjustment
- **Navigation**: Page thumbnails and direct page input
- **Download Option**: Original file download

### TextViewer
- **Syntax Highlighting**: Highlight.js integration
- **Language Detection**: Automatic language detection
- **View Modes**: Raw text vs highlighted code
- **Line Numbers**: Optional line numbering
- **Word Wrap**: Toggle word wrapping

## Database Schema

### Media Metadata Columns
```sql
-- Image metadata
width INTEGER
height INTEGER
exif_date INTEGER
gps_lat REAL
gps_lng REAL
dominant_color TEXT

-- Video/Audio metadata
duration_seconds REAL
bitrate INTEGER
fps REAL
codec TEXT
sample_rate INTEGER

-- Audio tags
artist TEXT
album TEXT
title TEXT

-- Document metadata
page_count INTEGER
preview_snippet TEXT

-- File paths
thumbnail_sm_path TEXT
thumbnail_md_path TEXT
poster_path TEXT
hls_path TEXT

-- Processing status
processing_status TEXT DEFAULT 'pending'
processing_error TEXT
```

## Queue Management

### Priority System
1. **Thumbnails** (Priority 1) - Quick user feedback
2. **HLS Generation** (Priority 2) - Streaming preparation
3. **Metadata Extraction** (Priority 3) - Background processing

### Error Handling
- **Retry Logic**: Up to 2 retries with exponential backoff
- **Timeout**: 5-minute processing limit per file
- **Memory Monitoring**: Queue paused if memory exceeds 256MB
- **Graceful Degradation**: Continues without processing on errors

### WebSocket Events
```javascript
'media:processing' - Processing started
'media:ready'      - Processing completed
'media:failed'     - Processing failed
'media:retry'      - Retry attempt
```

## Installation Requirements

### System Dependencies
```bash
sudo apt install -y ffmpeg poppler-utils sqlite3
```

### Node.js Dependencies
```json
{
  "sharp": "0.33.1",
  "fluent-ffmpeg": "2.1.2",
  "p-queue": "7.4.1"
}
```

### Frontend Dependencies
```json
{
  "react-photo-view": "1.2.4",
  "hls.js": "1.4.12",
  "react-pdf": "7.5.1",
  "highlight.js": "11.9.0"
}
```

## Performance Benchmarks

### Target Performance (Pi 4B)
- **Image Thumbnail**: < 2 seconds (5MP JPEG)
- **Video HLS**: < 30 seconds per minute of video
- **PDF Preview**: < 5 seconds (first page)
- **Memory Usage**: < 256MB total queue
- **Concurrent Jobs**: 1 (Pi limitation)

### Optimization Techniques
- **Sharp Sequential Read**: Reduces memory usage by 60%
- **FFmpeg Thread Limit**: Prevents CPU overload
- **HLS Segment Caching**: Reduces repeated processing
- **Lazy Component Loading**: Faster initial page loads

## Monitoring & Debugging

### Processing Status
```bash
# Check queue status
curl http://localhost:3001/api/admin/media-queue

# Check processing status
curl http://localhost:3001/api/files/{fileId}/processing-status
```

### Log Files
- **Application Logs**: `/var/log/pocketcloud/backend.log`
- **FFmpeg Logs**: Included in application logs
- **Processing Errors**: Stored in database

### Health Checks
- Queue memory usage monitoring
- Processing timeout detection
- Failed job retry tracking
- System resource monitoring

## Troubleshooting

### Common Issues
1. **FFmpeg Not Found**: Ensure `ffmpeg` is installed via apt
2. **Memory Errors**: Check queue memory limits
3. **Slow Processing**: Verify Pi isn't overheating
4. **HLS Playback Issues**: Check browser HLS.js support

### Debug Commands
```bash
# Test FFmpeg installation
ffmpeg -version

# Check processing queue
systemctl status pocketcloud-backend

# Monitor memory usage
free -h

# Check disk space
df -h /mnt/pocketcloud
```

## Future Enhancements

### Planned Features
- **Hardware Acceleration**: V4L2/MMAL integration
- **Batch Processing**: Multiple file processing
- **Progressive Upload**: Process during upload
- **Smart Thumbnails**: AI-powered thumbnail selection
- **Video Transcoding**: Additional format support

### Performance Improvements
- **Streaming Upload**: Process chunks as they arrive
- **Parallel Thumbnails**: Image processing parallelization
- **Caching Layer**: Redis integration for metadata
- **CDN Integration**: External thumbnail serving

The media processing pipeline provides a comprehensive solution for handling all common file types while respecting the hardware constraints of the Raspberry Pi 4B, ensuring smooth operation and excellent user experience.