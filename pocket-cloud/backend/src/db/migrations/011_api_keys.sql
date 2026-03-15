-- API Keys for Developer API
-- Enables third-party applications and scripts to authenticate with the API

CREATE TABLE api_keys (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,         -- "Home Automation", "Backup Script"
    key_hash     TEXT UNIQUE NOT NULL,  -- SHA-256 of raw key
    key_prefix   TEXT NOT NULL,         -- first 8 chars (for display: "pcd_a1b2...")
    scopes       TEXT NOT NULL,         -- JSON array: ["files:read","files:write","admin"]
    last_used_at INTEGER,
    expires_at   INTEGER,               -- NULL = never expires
    created_at   INTEGER NOT NULL,
    is_active    INTEGER DEFAULT 1
);

-- Index for fast key lookup
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_active ON api_keys(is_active, expires_at);

-- Add API key usage tracking
CREATE TABLE api_key_usage (
    id         TEXT PRIMARY KEY,
    api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL,
    method     TEXT NOT NULL,
    status     INTEGER NOT NULL,
    timestamp  INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT
);

-- Index for usage analytics
CREATE INDEX idx_api_key_usage_key_id ON api_key_usage(api_key_id);
CREATE INDEX idx_api_key_usage_timestamp ON api_key_usage(timestamp);

-- Rate limiting table for API keys
CREATE TABLE api_key_rate_limits (
    api_key_id TEXT PRIMARY KEY REFERENCES api_keys(id) ON DELETE CASCADE,
    requests_count INTEGER DEFAULT 0,
    window_start INTEGER NOT NULL,
    last_reset INTEGER NOT NULL
);