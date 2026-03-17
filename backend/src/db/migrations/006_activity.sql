-- Activity logging system for comprehensive audit trail
CREATE TABLE IF NOT EXISTS activity_log (
    id           TEXT PRIMARY KEY,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    action       TEXT NOT NULL,
    resource_type TEXT,        -- 'file'|'folder'|'share'|'user'|'system'
    resource_id  TEXT,
    resource_name TEXT,        -- snapshot of name at time of action
    ip_address   TEXT,
    user_agent   TEXT,
    details      TEXT,         -- JSON with extra context
    created_at   INTEGER NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_resource ON activity_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);

-- Auto-delete logs older than 90 days (handled by cleanup job)