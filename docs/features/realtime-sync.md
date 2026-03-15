# Real-time Synchronization System

Pocket Cloud Drive includes a WebSocket-based real-time synchronization system that provides instant updates across all connected devices when files are uploaded, deleted, renamed, or moved.

## Architecture

### Backend Components

1. **RealtimeService** (`backend/src/services/realtime.service.ts`)
   - Manages WebSocket connections and user sessions
   - Handles event broadcasting with Pi-optimized constraints
   - Supports up to 20 concurrent connections
   - Implements heartbeat system (30s ping, 10s timeout)
   - Message size limit: 4KB per message

2. **WebSocket Middleware** (`backend/src/middleware/websocket.middleware.ts`)
   - Integrates WebSocket server with Express HTTP server
   - Handles authentication via JWT cookies
   - Manages connection upgrades at `/ws` endpoint

3. **Event Broadcasting Integration**
   - Upload Service: Broadcasts upload progress and file creation
   - Trash Service: Broadcasts file deletion and restoration
   - Media Service: Broadcasts when media processing completes

### Frontend Components

1. **useRealtimeSync Hook** (`frontend/src/hooks/useRealtimeSync.ts`)
   - Manages WebSocket connection lifecycle
   - Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
   - Integrates with React Query cache for zero extra API calls
   - Handles page visibility changes for reconnection

2. **RealtimeIndicator Component** (`frontend/src/components/RealtimeIndicator.tsx`)
   - Shows connection status (green=connected, amber=reconnecting, red=disconnected)
   - Displays offline banner when disconnected
   - Shows "Back online" toast when reconnected

3. **useUploadProgress Hook** (`frontend/src/hooks/useUploadProgress.ts`)
   - Listens for real-time upload progress events
   - Formats speed and ETA display
   - Integrates with UploadManager component

## Event Types

### File Events
- `FILE_CREATED`: New file uploaded
- `FILE_UPDATED`: File metadata changed
- `FILE_DELETED`: File moved to trash
- `FILE_RESTORED`: File restored from trash

### Folder Events
- `FOLDER_CREATED`: New folder created
- `FOLDER_UPDATED`: Folder renamed or moved
- `FOLDER_DELETED`: Folder moved to trash

### Upload Events
- `UPLOAD_PROGRESS`: Real-time upload progress with speed and ETA

### Media Events
- `MEDIA_READY`: Thumbnails/previews generated for uploaded media

### System Events
- `STORAGE_UPDATED`: Storage usage statistics (debounced to 5s max)
- `USER_CONNECTED`: Admin-only event for connection monitoring

## Performance Optimizations

### Pi Hardware Constraints
- Maximum 20 concurrent WebSocket connections
- 4KB message size limit (no file data in WebSocket messages)
- Heartbeat every 30 seconds to detect dead connections
- JSON serialization reused across multiple recipients

### Frontend Optimizations
- Auto-reconnect with exponential backoff
- React Query cache integration prevents duplicate API calls
- Debounced storage updates (max once per 5 seconds)
- Support for multiple browser tabs on same device

### Network Resilience
- Automatic reconnection on network changes
- Page visibility API integration for tab switching
- Graceful degradation when WebSocket unavailable

## Usage Examples

### Backend Event Broadcasting

```typescript
// In upload service after file creation
realtimeService.broadcastFileCreated(fileId, folderId, fileMetadata);

// In trash service after deletion
realtimeService.broadcastFileDeleted(fileId, folderId, ownerId);

// Upload progress during chunked upload
realtimeService.broadcastUploadProgress(userId, uploadId, fileId, percent, speed, eta);
```

### Frontend Event Handling

```typescript
// The useRealtimeSync hook automatically handles events:
const { connectionStatus } = useRealtimeSync();

// Events are automatically applied to React Query cache:
// - FILE_CREATED → adds file to folder cache
// - FILE_DELETED → removes file from folder cache
// - UPLOAD_PROGRESS → triggers custom event for UploadManager
```

## Connection Management

### Authentication
- WebSocket connections authenticate using HTTP-only JWT cookies
- Same authentication as REST API endpoints
- Connections rejected with 4001 if unauthenticated

### Connection Limits
- Maximum 20 concurrent connections (Pi hardware limit)
- New connections rejected with 4013 if limit exceeded
- Connections automatically cleaned up on disconnect

### Health Monitoring
- Heartbeat ping every 30 seconds
- Connection terminated if no pong response within 10 seconds
- Connection statistics available via `/api/health` endpoint

## Testing

The real-time system can be tested by:

1. Opening multiple browser tabs/windows
2. Uploading files in one tab
3. Observing instant updates in other tabs
4. Checking connection status indicator
5. Testing reconnection by temporarily disabling network

## Configuration

### Environment Variables
- `JWT_SECRET`: Required for WebSocket authentication
- `FRONTEND_URL`: CORS configuration for WebSocket connections

### WebSocket Endpoint
- Production: `wss://your-domain/ws`
- Development: `ws://192.168.4.1:3000/ws`

The system is designed to work seamlessly with the existing Pocket Cloud Drive architecture while providing the responsive, real-time experience users expect from modern cloud storage applications.