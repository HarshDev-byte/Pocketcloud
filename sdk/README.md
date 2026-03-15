# Pocket Cloud Drive SDK

Official JavaScript/TypeScript SDK for Pocket Cloud Drive. Works in Node.js, browsers, Electron apps, and Deno.

[![npm version](https://badge.fury.io/js/pocketcloud-sdk.svg)](https://www.npmjs.com/package/pocketcloud-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Quick Start

### Installation

```bash
npm install pocketcloud-sdk
```

### Basic Usage

```typescript
import { PocketCloudClient } from 'pocketcloud-sdk';

// Connect with API key (recommended)
const client = new PocketCloudClient({
  baseUrl: 'http://192.168.4.1:3000',
  apiKey: 'pcd_xxxxxxxxxxxx'
});

// Or with username/password
const client = new PocketCloudClient({
  baseUrl: 'http://pocketcloud.local:3000',
  username: 'alice',
  password: 'mypassword'
});

// Auto-discover Pi on local network
const client = await PocketCloudClient.discover();

// Upload a file
const file = await client.upload.file('./photo.jpg', {
  folderId: 'folder-abc',
  onProgress: ({ percent }) => console.log(`${percent}%`)
});

// Download a file
await client.files.download('file-id-123', {
  destination: './downloaded.pdf',
  onProgress: ({ percent, speed, eta }) => {
    console.log(`${percent}% @ ${speed/1024/1024:.1f} MB/s, ${eta}s remaining`);
  }
});

// Real-time events
const rt = client.realtime.connect();
rt.on('file:created', (event) => {
  console.log('New file:', event.data.file.name);
});
```

## 📚 Documentation

### Client Configuration

```typescript
const client = new PocketCloudClient({
  baseUrl: 'http://192.168.4.1:3000',  // Required
  apiKey: 'pcd_xxxxxxxxxxxx',          // API key (preferred)
  username: 'alice',                   // Or username/password
  password: 'mypassword',
  timeout: 30000,                      // Request timeout (default: 30s)
  retries: 3,                          // Retry attempts (default: 3)
  headers: {                           // Custom headers
    'X-Custom-Header': 'value'
  }
});
```

### Auto-Discovery

```typescript
// Discover any Pocket Cloud Drive on the network
const client = await PocketCloudClient.discover();

// Scan for all devices
const devices = await PocketCloudClient.scan();
console.log('Found devices:', devices);

// Test connection
const ping = await client.ping();
console.log(`Connected! Latency: ${ping.latency}ms`);
```

## 🗂️ File Operations

### Basic File Operations

```typescript
// Get file info
const file = await client.files.get('file-id-123');
console.log(file.name, file.size, file.mimeType);

// List files in folder
const files = await client.files.list({
  folderId: 'folder-abc',
  page: 1,
  limit: 50,
  sortBy: 'name',
  sortOrder: 'asc'
});

// Download file
const stream = await client.files.download('file-id-123');

// Download to file (Node.js)
await client.files.download('file-id-123', {
  destination: './downloaded-file.pdf',
  onProgress: ({ percent, speed, eta }) => {
    console.log(`${percent}% @ ${speed/1024/1024:.1f} MB/s, ${eta}s remaining`);
  }
});

// Get download URL (for video/audio players)
const url = client.files.getDownloadUrl('file-id-123');
videoElement.src = url;

// File operations
await client.files.rename('file-id-123', 'new-name.pdf');
await client.files.move('file-id-123', { folderId: 'folder-abc' });
await client.files.copy('file-id-123', { name: 'Copy of file.pdf' });
await client.files.delete('file-id-123');
await client.files.restore('file-id-123');
```

### File Versions

```typescript
// Get file versions
const versions = await client.files.getVersions('file-id-123');
console.log(`File has ${versions.length} versions`);

// Restore specific version
await client.files.restoreVersion('file-id-123', 2);
```

## 📁 Folder Operations

```typescript
// Create folder
const folder = await client.folders.create('My Documents', {
  parentId: 'parent-folder-id'
});

// Get folder contents
const contents = await client.folders.getContents('folder-id-123');
console.log(`${contents.files.length} files, ${contents.folders.length} folders`);

// Folder operations
await client.folders.rename('folder-id-123', 'New Name');
await client.folders.move('folder-id-123', { parentId: 'new-parent-id' });
await client.folders.delete('folder-id-123');

// Create nested folder path
const folder = await client.folders.createPath('/Documents/Projects/MyApp');

// Get folder tree
const tree = await client.folders.getTree();
```

## ⬆️ Upload Files

### Simple Upload (< 10MB)

```typescript
// Upload from file path (Node.js)
const file = await client.upload.file('./photo.jpg', {
  folderId: 'folder-abc',
  onProgress: ({ percent }) => console.log(`${percent}%`)
});

// Upload from browser File object
const file = await client.upload.fromFileObject(fileInput.files[0]);

// Upload from Buffer/ArrayBuffer
const buffer = fs.readFileSync('./file.pdf');
const file = await client.upload.file(buffer, {
  folderId: 'folder-abc'
});
```

### Chunked Upload (Large Files)

```typescript
// Start chunked upload with full control
const upload = await client.upload.start('./large-video.mp4', {
  folderId: 'folder-abc',
  chunkSize: 5 * 1024 * 1024,  // 5MB chunks
  concurrency: 3,               // 3 parallel uploads
  onProgress: ({ percent, speed, eta }) => {
    console.log(`${percent}% @ ${speed/1024/1024:.1f} MB/s, ${eta}s remaining`);
  },
  onChunkComplete: ({ index, total }) => {
    console.log(`Chunk ${index + 1}/${total} complete`);
  }
});

// Complete the upload
const file = await upload.complete();

// Or cancel if needed
upload.cancel();
```

### Directory Upload (Node.js)

```typescript
const results = await client.upload.directory('./photos/', {
  remotePath: '/Vacation 2024',
  recursive: true,
  filter: (filePath) => !filePath.includes('.DS_Store'),
  onDirectoryProgress: ({ current, total, fileName }) => {
    console.log(`Uploading ${fileName} (${current}/${total})`);
  },
  onProgress: ({ percent }) => {
    console.log(`File progress: ${percent}%`);
  }
});

console.log(`Uploaded ${results.files.length} files`);
if (results.errors.length > 0) {
  console.log('Errors:', results.errors);
}
```

## 🔍 Search

```typescript
// Basic search
const results = await client.search.query('vacation photos');
console.log(`Found ${results.total} results in ${results.took}ms`);

// Advanced search
const results = await client.search.query('document', {
  mimeType: 'application/pdf',
  folderId: 'folder-abc',
  limit: 20,
  includeContent: true
});

// Search by file type
const images = await client.search.byType('image/*');
const pdfs = await client.search.byType('application/pdf');

// Search in specific folder
const results = await client.search.inFolder('folder-id-123', 'report');

// Find duplicates
const duplicates = await client.search.duplicates();

// Find large files
const largeFiles = await client.search.largeFiles(100 * 1024 * 1024); // > 100MB

// Find old files
const oldFiles = await client.search.oldFiles(365); // Older than 1 year

// Get search suggestions
const suggestions = await client.search.suggest('vaca');
```

## 🔗 Sharing

```typescript
// Create public share
const share = await client.shares.create('file-id-123');
console.log('Share URL:', share.url);

// Password protected share with expiration
const share = await client.shares.create('file-id-123', {
  password: 'secret123',
  expiresIn: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxDownloads: 10
});

// Temporary share (1 hour, 1 download)
const share = await client.shares.createTemporary('file-id-123', {
  expiresInMinutes: 60,
  maxDownloads: 1
});

// Download from share (no auth required)
await client.shares.download('share-token-abc', {
  password: 'secret123',
  destination: './shared-file.pdf'
});

// Get share info (no auth required)
const info = await client.shares.getPublicInfo('share-token-abc');
console.log('File name:', info.fileName);

// Manage shares
const shares = await client.shares.list();
await client.shares.update('share-id-123', { maxDownloads: 20 });
await client.shares.delete('share-id-123');
```

## 🎥 Streaming

```typescript
// Get streaming URL
const streamUrl = client.stream.getUrl('video-file-id');
videoElement.src = streamUrl;

// HLS streaming for adaptive bitrate
const hlsUrl = client.stream.getHlsUrl('video-file-id');

// Use with hls.js
if (Hls.isSupported()) {
  const hls = new Hls();
  hls.loadSource(hlsUrl);
  hls.attachMedia(videoElement);
}

// Get stream info
const info = await client.stream.getInfo('video-file-id');
console.log('Available qualities:', info.qualities);
console.log('Duration:', info.duration, 'seconds');

// Get video poster/thumbnail
const posterUrl = client.stream.getPosterUrl('video-file-id', {
  time: 30, // 30 seconds into video
  width: 640,
  height: 360
});
videoElement.poster = posterUrl;

// Generate thumbnails
const thumbnails = await client.stream.generateThumbnails('video-file-id', {
  interval: 10, // every 10 seconds
  width: 160,
  height: 90
});

// Audio waveform for visualization
const waveform = await client.stream.getWaveform('audio-file-id');
// Use waveform.peaks to draw audio visualization
```

## ⚡ Real-time Events

```typescript
const rt = client.realtime.connect();

// File events
rt.on('file:created', (event) => {
  console.log('New file:', event.data.file.name);
});

rt.on('file:updated', (event) => {
  console.log('File updated:', event.data.file.name);
});

rt.on('file:deleted', (event) => {
  console.log('File deleted:', event.data.file.name);
});

// Upload events
rt.on('upload:progress', (event) => {
  console.log(`Upload ${event.data.uploadId}: ${event.data.percent}%`);
});

rt.on('upload:complete', (event) => {
  console.log('Upload complete:', event.data.filename);
});

// System events
rt.on('system:storage_warning', (event) => {
  console.log('Storage warning:', event.data.message);
});

// Connection events
rt.on('connect', () => console.log('Connected to Pi'));
rt.on('disconnect', () => console.log('Disconnected from Pi'));
rt.on('reconnect', () => console.log('Reconnected to Pi'));

// Watch specific folder
rt.watch('folder-id-abc', (event) => {
  console.log('Change in folder:', event.type, event.data);
});

// Disconnect when done
rt.disconnect();
```

## 🚨 Error Handling

```typescript
import { 
  PocketCloudError,
  NotFoundError,
  QuotaExceededError,
  RateLimitError,
  NetworkError,
  isQuotaExceededError
} from 'pocketcloud-sdk';

try {
  await client.files.get('bad-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('File not found');
  } else if (error instanceof QuotaExceededError) {
    console.log(`Quota exceeded: ${error.used}/${error.quota} bytes`);
  } else if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof NetworkError) {
    console.log('Network error:', error.message);
  } else if (error instanceof PocketCloudError) {
    console.log('API error:', error.code, error.message);
  } else {
    console.log('Unknown error:', error);
  }
}

// Type guards
if (isQuotaExceededError(error)) {
  console.log(`Used: ${error.used}, Quota: ${error.quota}`);
}
```

## 🌐 Environment Support

### Node.js

```typescript
import { PocketCloudClient } from 'pocketcloud-sdk';

const client = new PocketCloudClient({
  baseUrl: 'http://192.168.4.1:3000',
  apiKey: 'pcd_xxxxxxxxxxxx'
});

// Full feature support including:
// - File path uploads
// - Directory uploads
// - Download to file system
// - All streaming features
```

### Browser

```typescript
import { PocketCloudClient } from 'pocketcloud-sdk';

const client = new PocketCloudClient({
  baseUrl: 'http://192.168.4.1:3000',
  apiKey: 'pcd_xxxxxxxxxxxx'
});

// Browser-specific features:
// - File object uploads from <input type="file">
// - Streaming downloads
// - Real-time events via WebSocket
// - All API operations
```

### Electron

```typescript
// Main process
import { PocketCloudClient } from 'pocketcloud-sdk';

// Renderer process
import { PocketCloudClient } from 'pocketcloud-sdk';

// Full Node.js + Browser feature support
```

### Deno

```typescript
import { PocketCloudClient } from 'npm:pocketcloud-sdk';

const client = new PocketCloudClient({
  baseUrl: 'http://192.168.4.1:3000',
  apiKey: 'pcd_xxxxxxxxxxxx'
});

// Most features supported
// Note: Some Node.js specific features may require polyfills
```

## 📖 API Reference

### PocketCloudClient

- `constructor(config: PocketCloudConfig)`
- `static discover(options?): Promise<PocketCloudClient>`
- `static scan(timeout?): Promise<DiscoveredDevice[]>`
- `ping(): Promise<{ success: boolean; latency: number; version: string }>`
- `authenticate(): Promise<void>`
- `request<T>(method, path, data?, options?): Promise<T>`

### Services

- `client.files` - File operations
- `client.folders` - Folder operations  
- `client.upload` - File uploads
- `client.search` - Search functionality
- `client.shares` - File sharing
- `client.stream` - Media streaming
- `client.realtime` - Real-time events

## 🔧 Advanced Usage

### Custom Headers

```typescript
const client = new PocketCloudClient({
  baseUrl: 'http://192.168.4.1:3000',
  apiKey: 'pcd_xxxxxxxxxxxx',
  headers: {
    'X-Custom-Header': 'value',
    'X-Client-Version': '1.0.0'
  }
});
```

### Request Timeouts and Retries

```typescript
const client = new PocketCloudClient({
  baseUrl: 'http://192.168.4.1:3000',
  apiKey: 'pcd_xxxxxxxxxxxx',
  timeout: 60000,  // 60 second timeout
  retries: 5       // 5 retry attempts
});

// Per-request overrides
await client.request('GET', '/api/v1/files', null, {
  timeout: 10000,  // 10 second timeout for this request
  retries: 1       // Only 1 retry
});
```

### Upload Progress Tracking

```typescript
let totalBytes = 0;
let uploadedBytes = 0;

const upload = await client.upload.start('./large-file.zip', {
  onProgress: ({ transferred, total, percent, speed, eta }) => {
    totalBytes = total;
    uploadedBytes = transferred;
    
    console.log(`Progress: ${percent}%`);
    console.log(`Speed: ${(speed / 1024 / 1024).toFixed(1)} MB/s`);
    console.log(`ETA: ${eta} seconds`);
    console.log(`Transferred: ${transferred}/${total} bytes`);
  },
  onChunkComplete: ({ index, total, size }) => {
    console.log(`Chunk ${index + 1}/${total} complete (${size} bytes)`);
  }
});

const file = await upload.complete();
```

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

- 📚 [Documentation](https://docs.pocketcloud.dev)
- 🐛 [Issue Tracker](https://github.com/pocketcloud/sdk/issues)
- 💬 [Discord Community](https://discord.gg/pocketcloud)
- 📧 [Email Support](mailto:support@pocketcloud.dev)

## 🎯 Roadmap

- [ ] React hooks package (`@pocketcloud/react`)
- [ ] Vue composables package (`@pocketcloud/vue`)
- [ ] CLI tool (`@pocketcloud/cli`)
- [ ] Offline sync capabilities
- [ ] End-to-end encryption helpers
- [ ] Advanced caching strategies