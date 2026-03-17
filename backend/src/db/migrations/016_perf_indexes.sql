-- Performance optimization indexes

-- Covering index for folder listing (avoids table scan)
CREATE INDEX IF NOT EXISTS idx_files_folder_listing 
ON files(owner_id, folder_id, is_deleted, name)
WHERE is_deleted = 0;

-- Covering index for trash listing
CREATE INDEX IF NOT EXISTS idx_files_trash_listing
ON files(owner_id, deleted_at DESC)
WHERE is_deleted = 1;

-- Index for search with date filter
CREATE INDEX IF NOT EXISTS idx_files_date
ON files(owner_id, created_at DESC)
WHERE is_deleted = 0;

-- Composite for share validation (hot path)
CREATE INDEX IF NOT EXISTS idx_shares_token_active
ON shares(token, expires_at);

-- Session validation (very hot path — every request)
CREATE INDEX IF NOT EXISTS idx_sessions_token_expires
ON sessions(token_hash, expires_at);

-- Activity log queries
CREATE INDEX IF NOT EXISTS idx_activity_user_date
ON activity_log(user_id, created_at DESC);

-- Webhook lookups
CREATE INDEX IF NOT EXISTS idx_webhooks_user_active
ON webhooks(user_id, is_active);

-- Backup device lookups
CREATE INDEX IF NOT EXISTS idx_backup_manifest_device_local
ON backup_manifest(device_id, local_id);

-- Analyze all tables (update query planner statistics)
ANALYZE;
