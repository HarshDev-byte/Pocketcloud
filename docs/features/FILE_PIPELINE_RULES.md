# File Pipeline Rules

Users define rules that run automatically on uploaded files. "When I upload a photo → move to Photos folder". "When file size > 1GB → compress it". "When filename contains 'invoice' → tag as Work".

No competitor has this on a self-hosted device. This is what makes power users never leave.

## Overview

File Pipeline Rules provide powerful automation for file management. Users can create rules with conditions and actions that automatically process files as they're uploaded or on-demand.

## Features

### Trigger Types
- **upload**: Run automatically when files are uploaded
- **manual**: Run on-demand against existing files
- **schedule**: (Future) Run on a schedule

### Condition Types

#### 1. MIME Type
Match files by content type.

```json
{
  "type": "mime_type",
  "operator": "starts_with",
  "value": "image/"
}
```

Operators: `starts_with`, `equals`, `contains`

Examples:
- `starts_with "image/"` - All images
- `equals "application/pdf"` - Only PDFs
- `contains "video"` - All videos

#### 2. Filename
Match files by name patterns.

```json
{
  "type": "filename",
  "operator": "contains",
  "value": "invoice"
}
```

Operators: `contains`, `starts_with`, `ends_with`, `equals`, `regex`

Examples:
- `contains "invoice"` - Any file with "invoice" in name
- `starts_with "IMG_"` - Camera photos
- `ends_with ".raw"` - RAW image files
- `regex "^IMG_\\d+"` - IMG_ followed by numbers

#### 3. File Size
Match files by size in bytes.

```json
{
  "type": "file_size",
  "operator": "greater_than",
  "value": 1073741824
}
```

Operators: `greater_than`, `less_than`, `equals`

Examples:
- `greater_than 1073741824` - Files > 1GB
- `less_than 10240` - Files < 10KB

#### 4. Folder Path
Match files by their folder location.

```json
{
  "type": "folder_path",
  "operator": "contains",
  "value": "Camera"
}
```

Operators: `contains`

Examples:
- `contains "Camera"` - Files in Camera folder
- `contains "Documents"` - Files in Documents folder

#### 5. Upload Hour
Match files by upload time.

```json
{
  "type": "upload_hour",
  "operator": "between",
  "value": [22, 6]
}
```

Operators: `between`

Examples:
- `between [22, 6]` - Night uploads (10 PM to 6 AM)
- `between [9, 17]` - Business hours

### Action Types

#### 1. Move to Folder
Move file to a specific folder.

```json
{
  "type": "move_to_folder",
  "folderId": "folder-uuid"
}
```

#### 2. Add Tag
Add a tag to the file.

```json
{
  "type": "add_tag",
  "tagId": "tag-uuid"
}
```

#### 3. Remove Tag
Remove a tag from the file.

```json
{
  "type": "remove_tag",
  "tagId": "tag-uuid"
}
```

#### 4. Rename
Rename file using a template pattern.

```json
{
  "type": "rename",
  "pattern": "{date}_{name}.{ext}"
}
```

Template variables:
- `{name}` - Original filename without extension
- `{ext}` - File extension
- `{date}` - Today's date (YYYY-MM-DD)
- `{datetime}` - Today's date and time (YYYY-MM-DD_HH-MM-SS)
- `{size}` - File size in bytes
- `{mime}` - MIME type category (image, video, audio, etc)
- `{exif_date}` - EXIF date taken (or 'unknown')

Examples:
- `{date}_{name}.{ext}` → `2024-03-17_photo.jpg`
- `{exif_date}_{name}.{ext}` → `2024-01-15_IMG_001.jpg`

#### 5. Add to Favorites
Add file to favorites.

```json
{
  "type": "add_to_favorites"
}
```

#### 6. Notify Webhook
Trigger a webhook notification.

```json
{
  "type": "notify_webhook",
  "webhookId": "webhook-uuid"
}
```

#### 7. Create Share
Automatically create a share link.

```json
{
  "type": "create_share",
  "expiresInHours": 24
}
```

#### 8. Compress Image
Re-encode image as WebP with quality setting.

```json
{
  "type": "compress_image",
  "quality": 80
}
```

Note: Only works on image files. Converts to WebP format.

#### 9. Delete
Move file to trash.

```json
{
  "type": "delete"
}
```

## Database Schema

### pipeline_rules
Stores user-defined automation rules.

```sql
CREATE TABLE pipeline_rules (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1,
  trigger_type TEXT NOT NULL,   -- 'upload'|'schedule'|'manual'
  priority     INTEGER NOT NULL DEFAULT 0,
  conditions   TEXT NOT NULL,   -- JSON array of condition objects
  actions      TEXT NOT NULL,   -- JSON array of action objects
  run_count    INTEGER NOT NULL DEFAULT 0,
  last_run     INTEGER,
  created_at   INTEGER NOT NULL
);
```

### pipeline_runs
Tracks rule execution history.

```sql
CREATE TABLE pipeline_runs (
  id           TEXT PRIMARY KEY,
  rule_id      TEXT NOT NULL REFERENCES pipeline_rules(id) ON DELETE CASCADE,
  file_id      TEXT REFERENCES files(id) ON DELETE SET NULL,
  status       TEXT NOT NULL,    -- 'success'|'failed'|'skipped'
  actions_run  TEXT NOT NULL,    -- JSON array of completed actions
  error        TEXT,
  ran_at       INTEGER NOT NULL
);
```

## API Endpoints

### GET /api/pipeline/rules
Get all rules for current user.

Response:
```json
{
  "rules": [
    {
      "id": "rule-uuid",
      "userId": "user-uuid",
      "name": "Auto-organize photos",
      "isActive": true,
      "triggerType": "upload",
      "priority": 0,
      "conditions": [
        {
          "type": "mime_type",
          "operator": "starts_with",
          "value": "image/"
        }
      ],
      "actions": [
        {
          "type": "move_to_folder",
          "folderId": "photos-folder-uuid"
        },
        {
          "type": "add_tag",
          "tagId": "photos-tag-uuid"
        }
      ],
      "runCount": 42,
      "lastRun": 1234567890,
      "createdAt": 1234567890
    }
  ]
}
```

### POST /api/pipeline/rules
Create a new rule.

Request:
```json
{
  "name": "Auto-organize invoices",
  "triggerType": "upload",
  "priority": 0,
  "conditions": [
    {
      "type": "filename",
      "operator": "contains",
      "value": "invoice"
    }
  ],
  "actions": [
    {
      "type": "move_to_folder",
      "folderId": "invoices-folder-uuid"
    },
    {
      "type": "add_tag",
      "tagId": "work-tag-uuid"
    }
  ]
}
```

Validation:
- 1-10 conditions per rule
- 1-5 actions per rule
- Maximum 10 rules per user
- Valid condition and action types

Response:
```json
{
  "rule": { /* created rule */ }
}
```

### PATCH /api/pipeline/rules/:id
Update an existing rule.

Request:
```json
{
  "name": "Updated name",
  "priority": 5,
  "conditions": [ /* updated conditions */ ],
  "actions": [ /* updated actions */ ]
}
```

### DELETE /api/pipeline/rules/:id
Delete a rule.

Response:
```json
{
  "success": true
}
```

### POST /api/pipeline/rules/:id/toggle
Enable or disable a rule.

Response:
```json
{
  "isActive": true
}
```

### GET /api/pipeline/rules/:id/runs
Get execution history for a rule (last 50 runs).

Response:
```json
{
  "runs": [
    {
      "id": "run-uuid",
      "ruleId": "rule-uuid",
      "fileId": "file-uuid",
      "status": "success",
      "actionsRun": [
        {
          "action": "move_to_folder",
          "success": true,
          "detail": "folder-uuid"
        },
        {
          "action": "add_tag",
          "success": true,
          "detail": "tag-uuid"
        }
      ],
      "error": null,
      "ranAt": 1234567890
    }
  ]
}
```

### POST /api/pipeline/rules/:id/test
Test a rule against a specific file (dry run - doesn't execute actions).

Request:
```json
{
  "fileId": "file-uuid"
}
```

Response:
```json
{
  "matches": true,
  "matchedConditions": [
    "mime_type starts_with \"image/\"",
    "file_size greater_than 1048576"
  ],
  "skippedConditions": []
}
```

### POST /api/pipeline/rules/:id/run
Manually run a rule against all user's files.

Response:
```json
{
  "success": true,
  "message": "Running rule against 150 files",
  "fileCount": 150
}
```

Note: Runs asynchronously in background.

### GET /api/pipeline/conditions
Get available condition types with schemas.

Response:
```json
{
  "conditions": [
    {
      "type": "mime_type",
      "label": "File Type",
      "operators": ["starts_with", "equals", "contains"],
      "valueType": "string",
      "examples": ["image/", "application/pdf", "video/"]
    }
  ]
}
```

### GET /api/pipeline/actions
Get available action types with schemas.

Response:
```json
{
  "actions": [
    {
      "type": "move_to_folder",
      "label": "Move to Folder",
      "params": [
        {
          "name": "folderId",
          "type": "string",
          "required": true
        }
      ]
    }
  ]
}
```

## Rule Execution

### Automatic Execution (Upload Trigger)

When a file is uploaded, the pipeline service automatically:

1. Fetches all active rules with `trigger_type = 'upload'`
2. Sorts by priority (DESC) and creation time (ASC)
3. Evaluates each rule's conditions against the file
4. If all conditions match (AND logic), executes actions sequentially
5. Records execution in `pipeline_runs` table
6. Updates rule statistics (`run_count`, `last_run`)

Execution is non-blocking - runs via `setImmediate()` to avoid delaying upload response.

### Manual Execution

Users can manually run rules against:
- A specific file (test mode - no actions executed)
- All their files (bulk processing)

### Priority System

Rules with higher priority values run first. If priorities are equal, older rules run first.

Example:
- Priority 10: Critical organization rules
- Priority 5: Tagging rules
- Priority 0: Default rules

### Error Handling

If an action fails:
- Error is logged in `pipeline_runs.error`
- Status set to `'failed'`
- Remaining actions for that rule are skipped
- Other matching rules still execute

## Example Use Cases

### 1. Auto-organize Photos

```json
{
  "name": "Auto-organize photos",
  "triggerType": "upload",
  "conditions": [
    {
      "type": "mime_type",
      "operator": "starts_with",
      "value": "image/"
    }
  ],
  "actions": [
    {
      "type": "move_to_folder",
      "folderId": "photos-folder-uuid"
    },
    {
      "type": "add_tag",
      "tagId": "photos-tag-uuid"
    }
  ]
}
```

### 2. Compress Large Images

```json
{
  "name": "Compress large images",
  "triggerType": "upload",
  "conditions": [
    {
      "type": "mime_type",
      "operator": "starts_with",
      "value": "image/"
    },
    {
      "type": "file_size",
      "operator": "greater_than",
      "value": 5242880
    }
  ],
  "actions": [
    {
      "type": "compress_image",
      "quality": 80
    }
  ]
}
```

### 3. Auto-tag Work Documents

```json
{
  "name": "Tag work documents",
  "triggerType": "upload",
  "conditions": [
    {
      "type": "filename",
      "operator": "contains",
      "value": "invoice"
    }
  ],
  "actions": [
    {
      "type": "add_tag",
      "tagId": "work-tag-uuid"
    },
    {
      "type": "move_to_folder",
      "folderId": "invoices-folder-uuid"
    }
  ]
}
```

### 4. Rename Camera Photos

```json
{
  "name": "Rename camera photos",
  "triggerType": "upload",
  "conditions": [
    {
      "type": "filename",
      "operator": "regex",
      "value": "^IMG_\\d+"
    }
  ],
  "actions": [
    {
      "type": "rename",
      "pattern": "{date}_{name}.{ext}"
    }
  ]
}
```

### 5. Alert on Large Files

```json
{
  "name": "Alert on large files",
  "triggerType": "upload",
  "conditions": [
    {
      "type": "file_size",
      "operator": "greater_than",
      "value": 1073741824
    }
  ],
  "actions": [
    {
      "type": "notify_webhook",
      "webhookId": "alert-webhook-uuid"
    }
  ]
}
```

### 6. Night Upload Organization

```json
{
  "name": "Organize night uploads",
  "triggerType": "upload",
  "conditions": [
    {
      "type": "upload_hour",
      "operator": "between",
      "value": [22, 6]
    }
  ],
  "actions": [
    {
      "type": "move_to_folder",
      "folderId": "night-uploads-folder-uuid"
    }
  ]
}
```

## Performance

### Non-Blocking Execution
- Rules run via `setImmediate()` after upload completes
- Upload response time unchanged (<1ms overhead)
- Actions execute sequentially to maintain consistency

### Efficient Evaluation
- Conditions evaluated in order (short-circuit on first failure)
- File data fetched once per rule execution
- Database queries optimized with indexes

### Limits
- Maximum 10 rules per user
- Maximum 10 conditions per rule
- Maximum 5 actions per rule
- Last 50 runs stored per rule

## Migration

Migration file: `backend/src/db/migrations/020_pipeline.sql`

Run migrations:
```bash
npm run migrate
```

## Testing

```bash
# Start server
npm run dev

# Create a rule
curl -X POST http://localhost:3000/api/pipeline/rules \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Auto-organize photos",
    "triggerType": "upload",
    "conditions": [
      {
        "type": "mime_type",
        "operator": "starts_with",
        "value": "image/"
      }
    ],
    "actions": [
      {
        "type": "add_tag",
        "tagId": "photos-tag-uuid"
      }
    ]
  }'

# Test rule against a file
curl -X POST http://localhost:3000/api/pipeline/rules/<rule-id>/test \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"fileId": "file-uuid"}'

# Get rule runs
curl http://localhost:3000/api/pipeline/rules/<rule-id>/runs \
  -H "Authorization: Bearer <token>"
```

## Acceptance Criteria

✅ Create rule: "if mime starts_with image/ → add_tag Photos" - Upload JPEG → automatically tagged  
✅ Create rule: "if filename contains invoice → move to Invoices folder" - Upload "invoice-2024.pdf" → automatically moved  
✅ Create rule: "if file_size > 1GB → notify_webhook" - Upload 2GB file → webhook fired  
✅ Create rule: "if filename matches regex ^IMG_ → rename to {date}_{name}.{ext}" - Upload "IMG_001.jpg" → renamed  
✅ Rules run async → upload response time unchanged (<1ms overhead)  
✅ POST /test → returns matches:true/false without executing actions  
✅ Multiple rules: all matching rules run in priority order  
✅ Action fails → logged in pipeline_runs, other actions still run  
✅ Compress image action → file smaller on disk, mime updated to webp  
✅ 10+ rules per user → 400 validation error

## Benefits

### For Power Users
- **Automation**: Set it and forget it - files organize themselves
- **Consistency**: Rules ensure files are always handled the same way
- **Flexibility**: Combine conditions and actions for complex workflows
- **Control**: Enable/disable rules, test before applying, view execution history

### For Admins
- **Reduced Support**: Users can automate their own workflows
- **Storage Optimization**: Auto-compress large files
- **Compliance**: Auto-tag and organize sensitive files

### Competitive Advantage
No other self-hosted cloud solution offers this level of file automation. This feature makes PocketCloud feel intelligent and keeps power users engaged.
