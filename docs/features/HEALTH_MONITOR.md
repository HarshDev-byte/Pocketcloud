# Health Monitor

The Pi monitors itself and fixes common problems automatically. Users never see crashes — the system heals before anyone notices. Admins get proactive alerts.

This is what enterprise NAS systems cost thousands to have.

## Overview

The Health Monitor continuously checks system health metrics and automatically attempts to fix problems before they impact users. It tracks incidents, provides historical data, and sends real-time alerts to administrators.

## Health Checks

### 1. CPU Temperature
Monitors Raspberry Pi CPU temperature.

- **Warn**: 70°C
- **Critical**: 80°C
- **Auto-heal**: Pause media processing queue at critical level
- **Unit**: °C

### 2. Disk Usage
Monitors storage disk usage percentage.

- **Warn**: 85%
- **Critical**: 95%
- **Auto-heal**: None (requires manual intervention)
- **Unit**: %

### 3. Memory Usage
Monitors RAM usage percentage.

- **Warn**: 80%
- **Critical**: 90%
- **Auto-heal**: None (system will handle via swap)
- **Unit**: %

### 4. Database Size
Monitors SQLite database file size.

- **Warn**: 512MB
- **Critical**: 1GB
- **Auto-heal**: Run VACUUM to compact database at warn level
- **Unit**: bytes

### 5. Upload Temp Size
Monitors temporary upload directory size.

- **Warn**: 5GB
- **Critical**: 10GB
- **Auto-heal**: Clean stalled upload sessions at critical level
- **Unit**: bytes

### 6. Stalled Uploads
Counts expired upload sessions.

- **Warn**: 5 sessions
- **Critical**: 20 sessions
- **Auto-heal**: Clean stalled upload sessions
- **Unit**: count

### 7. Failed Media Jobs
Counts failed media processing jobs.

- **Warn**: 10 jobs
- **Critical**: 50 jobs
- **Auto-heal**: Re-queue recent failed jobs (< 24 hours old, max 10)
- **Unit**: count

### 8. Orphaned Files
Counts content_store entries with ref_count = 0.

- **Warn**: 100 files
- **Critical**: 500 files
- **Auto-heal**: Delete orphaned files and remove from content_store
- **Unit**: count

## Auto-Healing Actions

### Stalled Uploads
**Trigger**: Warn or Critical  
**Action**: Clean expired upload sessions and remove temp files  
**Result**: Frees disk space, cleans database

### Failed Media Jobs
**Trigger**: Warn or Critical  
**Action**: Re-queue up to 10 recent failed jobs (< 24 hours)  
**Result**: Retry processing that may have failed due to temporary issues

### Upload Temp Size
**Trigger**: Critical only  
**Action**: Clean stalled upload sessions  
**Result**: Frees disk space in temp directory

### Orphaned Files
**Trigger**: Warn or Critical  
**Action**: Delete files with ref_count = 0 (up to 100 at a time)  
**Result**: Frees disk space, cleans content_store table

### CPU Temperature
**Trigger**: Critical only  
**Action**: Pause media processing queue  
**Result**: Reduces CPU load, allows temperature to drop

### Database Size
**Trigger**: Warn only  
**Action**: Run VACUUM to compact database  
**Result**: Reduces database file size

## Database Schema

### health_checks
Stores individual health check results.

```sql
CREATE TABLE health_checks (
  id           TEXT PRIMARY KEY,
  check_type   TEXT NOT NULL,
  status       TEXT NOT NULL,    -- 'ok'|'warn'|'critical'|'error'
  value        TEXT,             -- current measured value
  threshold    TEXT,             -- threshold that was breached
  message      TEXT,
  auto_healed  INTEGER DEFAULT 0,
  heal_action  TEXT,
  checked_at   INTEGER NOT NULL
);
```

### health_incidents
Tracks ongoing and resolved incidents.

```sql
CREATE TABLE health_incidents (
  id           TEXT PRIMARY KEY,
  check_type   TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  resolved_at  INTEGER,
  status       TEXT NOT NULL,    -- 'active'|'resolved'|'acknowledged'
  severity     TEXT NOT NULL,    -- 'warn'|'critical'
  description  TEXT NOT NULL,
  auto_resolved INTEGER DEFAULT 0,
  resolution   TEXT
);
```

## API Endpoints

### GET /api/health
Public endpoint (no authentication required).

Returns basic system status for monitoring tools, captive portal, and clients.

Response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600,
  "storage": {
    "freeBytes": 64424509440,
    "percentUsed": 50
  }
}
```

### GET /api/health/admin
Admin only. Returns full health report.

Response:
```json
{
  "overall": "warn",
  "checks": [
    {
      "type": "cpu_temp",
      "status": "ok",
      "value": 65,
      "threshold": 70,
      "unit": "°C"
    },
    {
      "type": "disk_usage",
      "status": "warn",
      "value": 87,
      "threshold": 85,
      "unit": "%"
    },
    {
      "type": "stalled_uploads",
      "status": "warn",
      "value": 8,
      "threshold": 5,
      "unit": "count",
      "autoHealed": true,
      "healAction": "Cleaned 8 stalled upload sessions"
    }
  ],
  "checkedAt": 1234567890
}
```

### GET /api/health/admin/history/:type
Admin only. Get historical data for a specific check type.

Query Parameters:
- `hours` (optional): Number of hours of history (default: 24)

Response:
```json
{
  "history": [
    {
      "check_type": "cpu_temp",
      "status": "ok",
      "value": "65",
      "threshold": null,
      "checked_at": 1234567890
    },
    {
      "check_type": "cpu_temp",
      "status": "warn",
      "value": "72",
      "threshold": "70",
      "checked_at": 1234568190
    }
  ]
}
```

Use this data to render sparkline charts showing trends over time.

### GET /api/health/admin/incidents
Admin only. Get incidents.

Query Parameters:
- `active` (optional): If "true", returns only active incidents

Response:
```json
{
  "incidents": [
    {
      "id": "incident-uuid",
      "check_type": "disk_usage",
      "started_at": 1234567890,
      "resolved_at": null,
      "status": "active",
      "severity": "warn",
      "description": "disk_usage at 87% (threshold: 85)",
      "auto_resolved": 0,
      "resolution": null
    }
  ]
}
```

### POST /api/health/admin/run
Admin only. Trigger immediate health check.

Response:
```json
{
  "overall": "ok",
  "checks": [ /* ... */ ],
  "checkedAt": 1234567890
}
```

### POST /api/health/admin/heal/:checkType
Admin only. Manually trigger auto-heal for a specific check.

Response:
```json
{
  "healed": true,
  "action": "Cleaned 8 stalled upload sessions",
  "freed": 524288000
}
```

### POST /api/health/admin/incidents/:id/acknowledge
Admin only. Mark incident as acknowledged.

Response:
```json
{
  "success": true
}
```

## Monitoring Schedule

### Automatic Checks
Health checks run automatically every 5 minutes.

### Initial Check
First health check runs 30 seconds after server startup.

### Check Sequence
1. Run all health checks
2. Store results in database
3. Attempt auto-heal for any issues
4. Update incidents (create/resolve)
5. Send WebSocket alerts to admins if issues found

## Incident Management

### Incident Lifecycle

1. **Created**: When a check first fails (warn or critical)
2. **Active**: Incident is ongoing
3. **Acknowledged**: Admin has seen the incident
4. **Resolved**: Check returned to normal or manually resolved

### Auto-Resolution
Incidents are automatically resolved when:
- The check returns to "ok" status
- Auto-heal successfully fixes the problem

### Manual Resolution
Admins can:
- Acknowledge incidents (mark as seen)
- Manually trigger healing actions
- View incident history

## WebSocket Alerts

When health checks detect issues, admins receive real-time alerts via WebSocket:

```javascript
{
  "type": "system:health",
  "data": {
    "type": "health_check",
    "overall": "warn",
    "checks": [
      {
        "type": "disk_usage",
        "status": "warn",
        "value": 87,
        "threshold": 85,
        "unit": "%"
      }
    ],
    "timestamp": 1234567890
  }
}
```

## Error Handling

All health checks are wrapped in try-catch blocks to ensure:
- A failing check doesn't crash the server
- Errors are logged but don't stop other checks
- Check status is set to "error" if exception occurs

## Performance Impact

- **CPU**: Minimal (<1% average)
- **Memory**: ~10MB for check execution
- **Disk I/O**: Minimal (mostly reads)
- **Network**: None (except WebSocket alerts)

Checks are designed to be lightweight and non-blocking.

## Example Scenarios

### Scenario 1: High CPU Temperature

1. Check detects CPU temp at 82°C (critical)
2. Auto-heal pauses media processing queue
3. Incident created with severity "critical"
4. Admin receives WebSocket alert
5. Next check: temp drops to 68°C
6. Incident auto-resolved
7. Media queue can be manually resumed

### Scenario 2: Stalled Uploads

1. Check detects 12 stalled upload sessions (critical)
2. Auto-heal cleans stalled sessions
3. Temp files deleted, database cleaned
4. Check result shows "autoHealed: true"
5. Next check: 0 stalled sessions
6. Incident auto-resolved

### Scenario 3: Database Growing

1. Check detects DB size at 550MB (warn)
2. Auto-heal runs VACUUM
3. DB compacted to 480MB
4. Check result shows freed space
5. Incident resolved
6. Admin notified of successful healing

### Scenario 4: Disk Space Critical

1. Check detects disk at 96% (critical)
2. No auto-heal available (requires manual intervention)
3. Incident created with severity "critical"
4. Admin receives urgent WebSocket alert
5. Admin manually frees space or adds storage
6. Next check: disk at 82%
7. Incident auto-resolved

## Migration

Migration file: `backend/src/db/migrations/021_health.sql`

Run migrations:
```bash
npm run migrate
```

## Testing

```bash
# Start server
npm run dev

# Check public health
curl http://localhost:3000/api/health

# Check admin health (requires admin token)
curl http://localhost:3000/api/health/admin \
  -H "Authorization: Bearer <admin-token>"

# Get history for CPU temp
curl "http://localhost:3000/api/health/admin/history/cpu_temp?hours=24" \
  -H "Authorization: Bearer <admin-token>"

# Trigger immediate check
curl -X POST http://localhost:3000/api/health/admin/run \
  -H "Authorization: Bearer <admin-token>"

# Manually trigger heal
curl -X POST http://localhost:3000/api/health/admin/heal/stalled_uploads \
  -H "Authorization: Bearer <admin-token>"
```

## Acceptance Criteria

✅ GET /api/health → { status: 'ok' } when everything fine  
✅ Fill disk to 86% → health check returns warn, WebSocket alert to admins  
✅ Create 25 stalled upload sessions → health detects, auto-heals, logs action  
✅ CPU temp > 80°C → media queue paused automatically  
✅ Failed media jobs > 10 → auto re-queued  
✅ Incident created when check fails → resolved automatically when check passes  
✅ GET /admin/health/history/cpu_temp → 24 data points for chart  
✅ Health checks never crash the server (all wrapped in try/catch)  
✅ Health check runs every 5 minutes exactly (verify with logs)  
✅ POST /heal/:checkType → executes heal action and returns result

## Benefits

### For Users
- **Reliability**: System fixes itself before problems impact usage
- **Uptime**: Automatic healing prevents crashes and downtime
- **Performance**: Proactive optimization (DB vacuum, temp cleanup)

### For Admins
- **Visibility**: Real-time monitoring of system health
- **Proactive**: Alerts before problems become critical
- **Automation**: Most issues fixed automatically
- **History**: Trend analysis via historical data

### Competitive Advantage
Enterprise NAS systems from Synology and QNAP charge thousands for this level of self-healing monitoring. PocketCloud provides it on a $50 Raspberry Pi.

## Future Enhancements

Potential additions:
- Network connectivity checks
- Service availability checks (WebDAV, media processing)
- Predictive alerts (trend analysis)
- Custom check thresholds per installation
- Email/SMS alerts in addition to WebSocket
- Integration with external monitoring tools (Prometheus, Grafana)
