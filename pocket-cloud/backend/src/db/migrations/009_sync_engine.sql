-- Intelligent folder sync engine tables

-- Sync clients (registered devices)
CREATE TABLE IF NOT EXISTS sync_clients (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    device_os TEXT NOT NULL CHECK (device_os IN ('macos', 'windows', 'linux')),
    last_seen INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    sync_folder TEXT,
    local_path TEXT,
    status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'scanning', 'comparing', 'syncing', 'error', 'paused')),
    conflict_strategy TEXT DEFAULT 'ask_user' CHECK (conflict_strategy IN ('ask_user', 'newer_wins', 'larger_wins', 'keep_both')),
    bandwidth_limit INTEGER DEFAULT 0, -- 0 = unlimited, bytes per second
    sync_schedule TEXT DEFAULT 'continuous' CHECK (sync_schedule IN ('continuous', 'periodic', 'manual')),
    sync_interval INTEGER DEFAULT 300, -- seconds for periodic sync
    selective_sync TEXT, -- JSON array of excluded paths
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Sync state tracking (per client, per file)
CREATE TABLE IF NOT EXISTS sync_state (
    client_id TEXT NOT NULL REFERENCES sync_clients(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    local_path TEXT NOT NULL,
    local_hash TEXT NOT NULL,
    local_mtime INTEGER NOT NULL,
    local_size INTEGER NOT NULL,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    sync_version INTEGER DEFAULT 1,
    PRIMARY KEY (client_id, file_id)
);

-- Sync conflicts requiring resolution
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES sync_clients(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    client_hash TEXT NOT NULL,
    server_hash TEXT NOT NULL,
    client_mtime INTEGER NOT NULL,
    server_mtime INTEGER NOT NULL,
    client_size INTEGER NOT NULL,
    server_size INTEGER NOT NULL,
    resolution TEXT CHECK (resolution IN ('keep_client', 'keep_server', 'keep_both', 'ask_user')),
    resolved_at INTEGER,
    resolved_by TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Sync activity log for monitoring and debugging
CREATE TABLE IF NOT EXISTS sync_activity (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES sync_clients(id) ON DELETE CASCADE,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('upload', 'download', 'delete', 'conflict', 'scan', 'error')),
    file_path TEXT NOT NULL,
    file_size INTEGER,
    duration_ms INTEGER,
    success INTEGER NOT NULL DEFAULT 1,
    error_message TEXT,
    metadata TEXT, -- JSON for additional operation details
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Sync sessions for tracking complete sync operations
CREATE TABLE IF NOT EXISTS sync_sessions (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES sync_clients(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL CHECK (session_type IN ('full', 'incremental', 'conflict_resolution')),
    started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    completed_at INTEGER,
    files_scanned INTEGER DEFAULT 0,
    files_uploaded INTEGER DEFAULT 0,
    files_downloaded INTEGER DEFAULT 0,
    files_deleted INTEGER DEFAULT 0,
    conflicts_found INTEGER DEFAULT 0,
    bytes_transferred INTEGER DEFAULT 0,
    success INTEGER DEFAULT 1,
    error_message TEXT
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_sync_clients_user_id ON sync_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_clients_status ON sync_clients(status);
CREATE INDEX IF NOT EXISTS idx_sync_clients_last_seen ON sync_clients(last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_sync_state_client_id ON sync_state(client_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_synced_at ON sync_state(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_state_local_path ON sync_state(client_id, local_path);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_client_id ON sync_conflicts(client_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved ON sync_conflicts(resolved_at);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_created ON sync_conflicts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_activity_client_id ON sync_activity(client_id);
CREATE INDEX IF NOT EXISTS idx_sync_activity_created ON sync_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_activity_operation ON sync_activity(operation_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_sessions_client_id ON sync_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_sync_sessions_started ON sync_sessions(started_at DESC);

-- Triggers for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS update_sync_clients_timestamp
    AFTER UPDATE ON sync_clients
    FOR EACH ROW
BEGIN
    UPDATE sync_clients 
    SET updated_at = strftime('%s', 'now') * 1000 
    WHERE id = NEW.id;
END;

-- Trigger to clean up old sync activity (keep last 1000 entries per client)
CREATE TRIGGER IF NOT EXISTS cleanup_sync_activity
    AFTER INSERT ON sync_activity
    FOR EACH ROW
BEGIN
    DELETE FROM sync_activity 
    WHERE client_id = NEW.client_id 
    AND id NOT IN (
        SELECT id FROM sync_activity 
        WHERE client_id = NEW.client_id 
        ORDER BY created_at DESC 
        LIMIT 1000
    );
END;

-- Trigger to auto-resolve conflicts older than 30 days
CREATE TRIGGER IF NOT EXISTS auto_resolve_old_conflicts
    AFTER INSERT ON sync_conflicts
    FOR EACH ROW
BEGIN
    UPDATE sync_conflicts 
    SET resolution = 'keep_server', 
        resolved_at = strftime('%s', 'now') * 1000,
        resolved_by = 'system'
    WHERE created_at < (strftime('%s', 'now') - 2592000) * 1000 -- 30 days
    AND resolution IS NULL;
END;