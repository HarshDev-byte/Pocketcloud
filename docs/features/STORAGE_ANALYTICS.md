# Storage Analytics

Show users and admins exactly how storage is being used, how it grows over time, what's taking up space, and smart recommendations to free space. No competitor offers this on a self-hosted device.

## Overview

Storage Analytics provides intelligent insights into storage usage patterns, growth trends, and actionable recommendations to optimize space. The system automatically tracks daily snapshots, upload patterns, and generates smart suggestions based on actual usage.

## Features

### 1. Storage Growth Tracking
- Daily snapshots of storage usage
- 30-day growth charts
- Growth rate calculation
- Projection of days until disk full
- Breakdown by file type (images, videos, audio, documents, other)

### 2. Storage Breakdown
- Real-time storage analysis by category
- Trash size tracking
- Version history size tracking
- Percentage distribution visualization

### 3. Largest Files Analysis
- Top 20 largest files
- Percentage of total storage per file
- Quick identification of space hogs

### 4. Duplicate Detection
- Finds files with identical checksums
- Calculates wasted space from duplicates
- Groups duplicates for easy review
- Note: Files are already deduplicated on disk, but this shows logical duplicates

### 5. Smart Recommendations
Priority-based suggestions to free up space:

- **Critical**: Quota warnings (>80% used)
- **High**: Large trash (>1GB)
- **Medium**: Old versions (>500MB), Duplicates (>100MB)
- **Low**: Large videos that could be compressed

Each recommendation includes:
- Type and priority
- Clear title and description
- Action to take
- Estimated savings in bytes

### 6. Upload Activity Heatmap
- Hourly upload tracking
- 30-day activity visualization
- Peak hour and peak day identification
- Total uploads and bytes statistics

## Database Schema

### storage_snapshots
Daily storage state for growth tracking.

```sql
CREATE TABLE storage_snapshots (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,         -- 'YYYY-MM-DD'
  file_count   INTEGER NOT NULL,
  total_bytes  INTEGER NOT NULL,
  image_bytes  INTEGER NOT NULL DEFAULT 0,
  video_bytes  INTEGER NOT NULL DEFAULT 0,
  audio_bytes  INTEGER NOT NULL DEFAULT 0,
  doc_bytes    INTEGER NOT NULL DEFAULT 0,
  other_bytes  INTEGER NOT NULL DEFAULT 0,
  trash_bytes  INTEGER NOT NULL DEFAULT 0,
  version_bytes INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);
```

- `user_id = NULL` for global (admin) snapshots
- Indexed by `(user_id, date DESC)` for fast queries

### upload_stats
Hourly upload activity for heatmap visualization.

```sql
CREATE TABLE upload_stats (
  date         TEXT NOT NULL,
  hour         INTEGER NOT NULL,      -- 0-23
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  file_count   INTEGER NOT NULL DEFAULT 0,
  total_bytes  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, hour, user_id)
);
```

## API Endpoints

### User Endpoints

#### GET /api/analytics/storage
Get storage growth over time.

Query Parameters:
- `days` (optional): Number of days to include (default: 30)

Response:
```json
{
  "snapshots": [
    {
      "date": "2024-03-01",
      "fileCount": 150,
      "totalBytes": 5368709120,
      "imageBytes": 2147483648,
      "videoBytes": 2147483648,
      "audioBytes": 536870912,
      "docBytes": 268435456,
      "otherBytes": 268435456,
      "trashBytes": 104857600,
      "versionBytes": 52428800
    }
  ],
  "growthPercent": 15.5,
  "daysUntilFull": 180,
  "totalGrowthBytes": 838860800,
  "averageDailyGrowthBytes": 27962026
}
```

#### GET /api/analytics/breakdown
Get current storage breakdown by type.

Response:
```json
{
  "fileCount": 150,
  "totalBytes": 5368709120,
  "imageBytes": 2147483648,
  "videoBytes": 2147483648,
  "audioBytes": 536870912,
  "docBytes": 268435456,
  "otherBytes": 268435456,
  "trashBytes": 104857600,
  "versionBytes": 52428800
}
```

#### GET /api/analytics/largest
Get largest files.

Query Parameters:
- `limit` (optional): Number of files to return (default: 20)

Response:
```json
{
  "files": [
    {
      "id": "file-uuid",
      "name": "large-video.mp4",
      "size": 2147483648,
      "mimeType": "video/mp4",
      "createdAt": 1234567890,
      "percentOfTotal": 40.0
    }
  ]
}
```

#### GET /api/analytics/duplicates
Get duplicate file groups.

Response:
```json
{
  "duplicates": [
    {
      "checksum": "sha256-hash",
      "count": 3,
      "wastedBytes": 2147483648,
      "fileIds": ["id1", "id2", "id3"],
      "fileNames": ["file1.jpg", "file2.jpg", "file3.jpg"]
    }
  ]
}
```

#### GET /api/analytics/recommendations
Get smart recommendations to free space.

Response:
```json
{
  "recommendations": [
    {
      "type": "empty_trash",
      "priority": "high",
      "title": "Empty your trash",
      "description": "1.5 GB waiting in trash",
      "action": "DELETE /api/trash/empty",
      "savingsBytes": 1610612736
    },
    {
      "type": "trim_versions",
      "priority": "medium",
      "title": "Old file versions using space",
      "description": "750 MB in version history",
      "action": "Review old versions in settings",
      "savingsBytes": 525336576
    }
  ]
}
```

#### GET /api/analytics/activity
Get upload activity heatmap.

Query Parameters:
- `days` (optional): Number of days to include (default: 30)

Response:
```json
{
  "heatmap": {
    "2024-03-01": {
      "9": { "files": 5, "bytes": 52428800 },
      "14": { "files": 3, "bytes": 31457280 }
    }
  },
  "peakHour": 14,
  "peakDay": "Monday",
  "totalUploads": 150,
  "totalBytes": 5368709120
}
```

### Admin Endpoints

#### GET /api/admin/analytics
Get comprehensive analytics for all users (admin only).

Response:
```json
{
  "global": {
    "breakdown": {
      "fileCount": 500,
      "totalBytes": 21474836480,
      "imageBytes": 8589934592,
      "videoBytes": 8589934592,
      "audioBytes": 2147483648,
      "docBytes": 1073741824,
      "otherBytes": 1073741824,
      "trashBytes": 419430400,
      "versionBytes": 209715200
    },
    "growth": {
      "snapshots": [...],
      "growthPercent": 12.3,
      "daysUntilFull": 200,
      "totalGrowthBytes": 2684354560,
      "averageDailyGrowthBytes": 89478485
    },
    "disk": {
      "totalBytes": 128849018880,
      "usedBytes": 64424509440,
      "freeBytes": 64424509440,
      "percentUsed": 0.5
    }
  },
  "perUser": [
    {
      "userId": "user-uuid",
      "username": "john",
      "fileCount": 200,
      "totalBytes": 10737418240,
      "imageBytes": 4294967296,
      "videoBytes": 4294967296,
      "audioBytes": 1073741824,
      "docBytes": 536870912,
      "otherBytes": 536870912,
      "trashBytes": 209715200,
      "versionBytes": 104857600
    }
  ]
}
```

## Automated Jobs

### Daily Snapshot Job (1 AM)
Automatically takes storage snapshots for:
- Each active user
- Global system-wide snapshot

```javascript
cron.schedule('0 1 * * *', async () => {
  const users = db.prepare('SELECT id FROM users WHERE is_active = 1').all();
  for (const user of users) {
    AnalyticsService.takeSnapshot(user.id);
  }
  AnalyticsService.takeSnapshot(); // Global snapshot
});
```

### Upload Statistics Recording
Automatically records upload statistics after each file upload:

```javascript
AnalyticsService.recordUploadStat(userId, fileSize);
```

## Smart Recommendations Logic

### 1. Empty Trash (High Priority)
Triggers when trash contains > 1GB

```javascript
if (trashSize > 1073741824) {
  recommendations.push({
    type: 'empty_trash',
    priority: 'high',
    title: 'Empty your trash',
    description: `${formatBytes(trashSize)} waiting in trash`,
    action: 'DELETE /api/trash/empty',
    savingsBytes: trashSize
  });
}
```

### 2. Trim Versions (Medium Priority)
Triggers when version history > 500MB

Estimates 70% of version storage can be recovered by trimming old versions.

### 3. Remove Duplicates (Medium Priority)
Triggers when duplicate files waste > 100MB

Calculates wasted space as: `total_size - (total_size / count)`

### 4. Compress Videos (Low Priority)
Triggers when large videos (>1GB each) exist

Estimates 50% size reduction through re-encoding.

### 5. Quota Warning (Critical Priority)
Triggers when user has used > 80% of quota

Prompts user to contact admin for quota increase.

## Performance Optimizations

### Indexed Queries
- `idx_snapshots_user_date`: Fast snapshot retrieval
- `idx_upload_stats_user_date`: Fast activity queries

### Efficient Aggregations
- Uses SQLite aggregate functions (SUM, COUNT, COALESCE)
- Single-pass calculations for breakdowns
- Indexed date range queries

### Non-Blocking Operations
- Snapshot taking runs in background (cron job)
- Upload stat recording uses `setImmediate()` to avoid blocking uploads
- All analytics queries optimized for <200ms on 10,000 files

### Gap Filling Algorithm
Missing days in snapshots are filled with previous day's values to ensure smooth charts without gaps.

```javascript
private static fillMissingDays(snapshots: DailySnapshot[], days: number): DailySnapshot[] {
  // Creates continuous daily data by filling gaps with last known values
}
```

## Usage Examples

### Frontend Chart Integration

```javascript
// Fetch storage growth data
const response = await fetch('/api/analytics/storage?days=30', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();

// Render line chart
const chartData = data.snapshots.map(s => ({
  date: s.date,
  total: s.totalBytes / (1024 * 1024 * 1024), // Convert to GB
  images: s.imageBytes / (1024 * 1024 * 1024),
  videos: s.videoBytes / (1024 * 1024 * 1024)
}));

// Show projection
if (data.daysUntilFull) {
  console.log(`Storage will be full in approximately ${data.daysUntilFull} days`);
}
```

### Display Recommendations

```javascript
const response = await fetch('/api/analytics/recommendations', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { recommendations } = await response.json();

// Sort by priority and display
recommendations.forEach(rec => {
  console.log(`[${rec.priority.toUpperCase()}] ${rec.title}`);
  console.log(`  ${rec.description}`);
  console.log(`  Potential savings: ${formatBytes(rec.savingsBytes)}`);
  console.log(`  Action: ${rec.action}`);
});
```

### Upload Activity Heatmap

```javascript
const response = await fetch('/api/analytics/activity?days=30', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const activity = await response.json();

// Render heatmap (like GitHub contributions)
Object.entries(activity.heatmap).forEach(([date, hours]) => {
  Object.entries(hours).forEach(([hour, stats]) => {
    // Render cell with intensity based on stats.files or stats.bytes
  });
});

console.log(`Peak upload time: ${activity.peakHour}:00 on ${activity.peakDay}s`);
```

## Migration

Migration file: `backend/src/db/migrations/019_analytics.sql`

Run migrations:
```bash
npm run migrate
```

## Testing

```bash
# Start server
npm run dev

# Get storage growth
curl http://localhost:3000/api/analytics/storage?days=30 \
  -H "Authorization: Bearer <token>"

# Get recommendations
curl http://localhost:3000/api/analytics/recommendations \
  -H "Authorization: Bearer <token>"

# Get largest files
curl http://localhost:3000/api/analytics/largest?limit=10 \
  -H "Authorization: Bearer <token>"

# Admin analytics
curl http://localhost:3000/api/admin/analytics \
  -H "Authorization: Bearer <admin-token>"
```

## Acceptance Criteria

✅ Daily snapshots taken at 1 AM → 30-day history available after 30 days  
✅ GET /analytics/storage → returns daily data points for chart  
✅ daysUntilFull calculation → realistic projection based on growth rate  
✅ GET /analytics/largest → top 20 files with correct percentages  
✅ GET /analytics/duplicates → finds files with same checksum  
✅ GET /analytics/recommendations → trash > 1GB generates high priority rec  
✅ GET /analytics/activity → hourly heatmap data for last 30 days  
✅ Admin analytics → shows per-user breakdown correctly  
✅ All queries < 200ms on 10,000 file database  
✅ Missing days filled correctly (no gaps in chart data)

## Benefits

### For Users
- **Visibility**: See exactly where storage is going
- **Proactive**: Get warnings before running out of space
- **Actionable**: Clear recommendations with estimated savings
- **Trends**: Understand usage patterns over time

### For Admins
- **Monitoring**: Track system-wide storage trends
- **Planning**: Project when additional storage will be needed
- **User Management**: Identify heavy users
- **Optimization**: System-wide duplicate and waste detection

### Competitive Advantage
No other self-hosted cloud solution offers this level of storage intelligence. This makes PocketCloud feel smart and proactive, not just reactive.
