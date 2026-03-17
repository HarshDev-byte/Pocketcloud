# Folder Sync Protocol

Desktop clients (Mac, Windows, Linux) can keep a local folder perfectly in sync with a Pi folder — both directions. Like Dropbox's sync daemon but running on local WiFi.

## Overview

The Folder Sync Protocol uses delta sync with cursors (similar to Dropbox API) to efficiently synchronize files between desktop clients and PocketCloud server.

## Database Schema

### sync_clients
Tracks registered desktop sync clients.

```sql
CREATE TABLE sync_clients (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name  TEXT NOT NULL,
  device_os    TEXT NOT NULL,  -- 'macos'|'windows'|'linux'
  remote_folder_id TEXT REFERENCES folders(id),
  last_sync    INTEGER,
  sync_token   TEXT UNIQUE,    -- cursor for delta sync
  created_at   INTEGER NOT NULL
);
```

### sync_state
Tracks what files each client has synced.

```sql
CREATE TABLE sync_state (
  client_id    TEXT NOT NULL REFERENCES sync_clients(id) ON DELETE CASCADE,
  file_id      TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  local_path   TEXT NOT NULL,  -- relative path on client device
  local_hash   TEXT NOT NULL,  -- SHA-256 of client's copy
  synced_at    INTEGER NOT NULL,
  PRIMARY KEY (client_id, file_id)
);
```

### sync_events
Change log for delta sync.

```sql
CREATE TABLE sync_events (
  id           TEXT PRIMARY KEY,
  folder_id    TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,  -- 'created'|'modified'|'deleted'|'moved'
  file_id      TEXT REFERENCES files(id),
  old_path     TEXT,
  new_path     TEXT,
  created_at   INTEGER NOT NULL
);
```

## Client Flow

### 1. Register Client

```http
POST /api/sync/register
Authorization: Bearer <token>
Content-Type: application/json

{
  "deviceName": "MacBook Pro",
  "deviceOs": "macos",
  "remoteFolderId": "folder-uuid" // optional, null = root
}
```

Response:
```json
{
  "clientId": "client-uuid",
  "syncToken": "initial-token",
  "remoteFolderId": "folder-uuid"
}
```

### 2. Initial Sync

Get full folder snapshot:

```http
GET /api/sync/list?clientId=<client-uuid>
Authorization: Bearer <token>
```

Response:
```json
{
  "entries": [
    {
      "type": "file",
      "id": "file-uuid",
      "path": "Documents/report.pdf",
      "name": "report.pdf",
      "size": 1024000,
      "checksum": "sha256-hash",
      "modifiedAt": 1234567890,
      "downloadUrl": "/api/files/file-uuid/download",
      "isDeleted": false
    },
    {
      "type": "folder",
      "id": "folder-uuid",
      "path": "/Documents",
      "name": "Documents",
      "size": 0,
      "checksum": null,
      "modifiedAt": 1234567890,
      "downloadUrl": "",
      "isDeleted": false
    }
  ],
  "cursor": "base64-encoded-timestamp",
  "hasMore": false
}
```

Client downloads all files and creates local folder structure.

### 3. Ongoing Sync (Polling)

Poll for changes every 30 seconds:

```http
GET /api/sync/delta?clientId=<client-uuid>&cursor=<cursor>
Authorization: Bearer <token>
```

Response:
```json
{
  "changes": [
    {
      "type": "file",
      "id": "file-uuid",
      "path": "Documents/new-file.pdf",
      "name": "new-file.pdf",
      "size": 2048000,
      "checksum": "sha256-hash",
      "modifiedAt": 1234567900,
      "downloadUrl": "/api/files/file-uuid/download",
      "isDeleted": false
    },
    {
      "type": "file",
      "id": "deleted-file-uuid",
      "path": "Documents/old-file.pdf",
      "name": "",
      "size": 0,
      "checksum": null,
      "modifiedAt": 1234567910,
      "downloadUrl": "",
      "isDeleted": true
    }
  ],
  "cursor": "new-cursor",
  "hasMore": false
}
```

Client applies changes locally:
- `isDeleted: false` → Download file
- `isDeleted: true` → Delete local file

### 4. Report Local Changes

When client detects local changes:

```http
POST /api/sync/changes
Authorization: Bearer <token>
Content-Type: application/json

{
  "clientId": "client-uuid",
  "changes": [
    {
      "localPath": "Documents/new-local-file.pdf",
      "checksum": "sha256-hash",
      "modifiedAt": 1234567920,
      "type": "add"
    },
    {
      "localPath": "Documents/modified-file.pdf",
      "checksum": "new-sha256-hash",
      "modifiedAt": 1234567930,
      "type": "modify"
    },
    {
      "localPath": "Documents/deleted-file.pdf",
      "checksum": "",
      "modifiedAt": 1234567940,
      "type": "delete"
    }
  ]
}
```

Response:
```json
{
  "accepted": ["Documents/deleted-file.pdf"],
  "conflicts": [
    {
      "path": "Documents/modified-file.pdf",
      "serverVersion": { "id": "...", "checksum": "..." },
      "clientChecksum": "new-sha256-hash",
      "strategy": "keep_both"
    }
  ],
  "pendingUploads": [
    {
      "path": "Documents/new-local-file.pdf",
      "uploadId": "upload-session-uuid"
    }
  ]
}
```

Client then:
- Uploads files in `pendingUploads` using standard upload API
- Resolves conflicts using conflict resolution API

### 5. Conflict Resolution

```http
POST /api/sync/conflict/resolve
Authorization: Bearer <token>
Content-Type: application/json

{
  "clientId": "client-uuid",
  "path": "Documents/modified-file.pdf",
  "resolution": "keep_both"
}
```

Resolution options:
- `keep_server`: Client downloads server version (overwrites local)
- `keep_client`: Client uploads, overwrites server (creates version first)
- `keep_both`: Client uploads renamed version (e.g., "file (conflict 2024-03-17).pdf")

Response:
```json
{
  "action": "upload_as_new_file",
  "newPath": "Documents/modified-file (conflict 2024-03-17).pdf"
}
```

## WebSocket Events

Clients can listen for real-time sync notifications:

```javascript
ws.on('message', (data) => {
  const event = JSON.parse(data);
  
  if (event.type === 'sync:delta_ready') {
    // New changes available, call GET /api/sync/delta
    console.log('Delta ready for client:', event.clientId);
    console.log('Event count:', event.eventCount);
  }
});
```

## Sync Event Recording

The server automatically records sync events when files change:

- **Upload complete** → `created` event
- **File renamed** → `modified` event
- **File moved** → `deleted` (old folder) + `created` (new folder)
- **File deleted** → `deleted` event

Events are stored for 7 days and auto-cleaned by the cleanup job.

## API Endpoints

### POST /api/sync/register
Register a new sync client.

### GET /api/sync/list
Get full folder snapshot for initial sync.

### GET /api/sync/delta
Get changes since cursor (delta sync).

### POST /api/sync/changes
Report local changes from client.

### POST /api/sync/conflict/resolve
Resolve a sync conflict.

### GET /api/sync/clients
List all registered sync clients for current user.

### DELETE /api/sync/clients/:id
Unregister a sync client (does not delete files).

## Conflict Detection

Conflicts occur when:
1. Both client and server modified the same file since last sync
2. Client's local hash ≠ server's current hash
3. Server's current hash ≠ client's last synced hash

The server detects this by comparing:
- `sync_state.local_hash` (what client had last time)
- Current server file checksum
- Client's reported new checksum

## Performance

- Delta sync returns max 500 changes per request
- If `hasMore: true`, client should immediately fetch next batch
- Cursor is base64-encoded timestamp for efficient querying
- Sync events indexed by `(folder_id, created_at DESC)`
- Old events (>7 days) auto-cleaned to prevent unbounded growth

## Security

- All endpoints require authentication
- Clients can only sync folders they own
- File checksums verified on upload
- Conflict resolution creates versions before overwriting

## Example Client Implementation

```javascript
class SyncClient {
  constructor(apiUrl, token, localPath, remoteFolderId) {
    this.apiUrl = apiUrl;
    this.token = token;
    this.localPath = localPath;
    this.remoteFolderId = remoteFolderId;
    this.clientId = null;
    this.cursor = null;
  }

  async register() {
    const res = await fetch(`${this.apiUrl}/api/sync/register`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deviceName: os.hostname(),
        deviceOs: os.platform(),
        remoteFolderId: this.remoteFolderId
      })
    });
    
    const data = await res.json();
    this.clientId = data.clientId;
    this.cursor = data.syncToken;
  }

  async initialSync() {
    const res = await fetch(
      `${this.apiUrl}/api/sync/list?clientId=${this.clientId}`,
      {
        headers: { 'Authorization': `Bearer ${this.token}` }
      }
    );
    
    const data = await res.json();
    
    // Download all files
    for (const entry of data.entries) {
      if (entry.type === 'file' && !entry.isDeleted) {
        await this.downloadFile(entry);
      }
    }
    
    this.cursor = data.cursor;
  }

  async pollForChanges() {
    const res = await fetch(
      `${this.apiUrl}/api/sync/delta?clientId=${this.clientId}&cursor=${this.cursor}`,
      {
        headers: { 'Authorization': `Bearer ${this.token}` }
      }
    );
    
    const data = await res.json();
    
    // Apply changes
    for (const change of data.changes) {
      if (change.isDeleted) {
        await this.deleteLocalFile(change.path);
      } else {
        await this.downloadFile(change);
      }
    }
    
    this.cursor = data.cursor;
    
    // If more changes available, fetch immediately
    if (data.hasMore) {
      await this.pollForChanges();
    }
  }

  async reportLocalChanges(changes) {
    const res = await fetch(`${this.apiUrl}/api/sync/changes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientId: this.clientId,
        changes
      })
    });
    
    const data = await res.json();
    
    // Handle conflicts
    for (const conflict of data.conflicts) {
      await this.resolveConflict(conflict);
    }
    
    // Upload pending files
    for (const upload of data.pendingUploads) {
      await this.uploadFile(upload.path, upload.uploadId);
    }
  }

  startPolling() {
    setInterval(() => this.pollForChanges(), 30000); // Every 30 seconds
  }
}
```

## Acceptance Criteria

✅ Register client → GET /sync/list → full snapshot with all files  
✅ Upload file → GET /sync/delta → new file appears in changes  
✅ Delete file → GET /sync/delta → deleted entry appears  
✅ Move file → delta shows moved entry with old + new path  
✅ Rename file → delta shows modified entry  
✅ POST /sync/changes with new local file → pendingUploads returned  
✅ Conflict: both sides modified → conflict returned with both versions  
✅ Resolve conflict 'keep_both' → renamed copy created on server  
✅ Cursor advances correctly → same delta never returned twice  
✅ sync_events older than 7 days → auto-cleaned by job  
✅ 1000-file folder → full snapshot returns in < 500ms on Pi

## Migration

Migration file: `backend/src/db/migrations/018_sync.sql`

Run migrations:
```bash
npm run migrate
```

## Testing

```bash
# Start server
npm run dev

# Register client
curl -X POST http://localhost:3000/api/sync/register \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"deviceName":"Test Client","deviceOs":"macos"}'

# Get full snapshot
curl http://localhost:3000/api/sync/list?clientId=<client-id> \
  -H "Authorization: Bearer <token>"

# Get delta
curl "http://localhost:3000/api/sync/delta?clientId=<client-id>&cursor=<cursor>" \
  -H "Authorization: Bearer <token>"
```
