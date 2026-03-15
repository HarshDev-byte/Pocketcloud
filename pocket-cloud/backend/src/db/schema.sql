-- PocketCloud Database Schema
-- SQLite database with WAL mode for high performance

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 1000;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;

-- Users table for authentication and authorization
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    storage_quota INTEGER DEFAULT NULL, -- bytes, NULL = unlimited
    storage_used INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    last_login_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- User sessions for JWT token management
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Files metadata table
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL, -- relative path from user root
    full_path TEXT NOT NULL, -- absolute filesystem path
    mime_type TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    checksum TEXT, -- SHA-256 hash
    owner_id INTEGER NOT NULL,
    parent_folder_id INTEGER,
    is_encrypted INTEGER DEFAULT 0,
    encryption_key_hash TEXT, -- for encrypted files
    thumbnail_path TEXT,
    metadata TEXT, -- JSON metadata (EXIF, video info, etc.)
    version INTEGER DEFAULT 1,
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (parent_folder_id) REFERENCES folders (id) ON DELETE SET NULL
);

-- Folders/directories table
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL, -- relative path from user root
    full_path TEXT NOT NULL, -- absolute filesystem path
    owner_id INTEGER NOT NULL,
    parent_folder_id INTEGER,
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (parent_folder_id) REFERENCES folders (id) ON DELETE CASCADE
);

-- File sharing links
CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    file_id INTEGER,
    folder_id INTEGER,
    owner_id INTEGER NOT NULL,
    share_type TEXT NOT NULL DEFAULT 'link' CHECK (share_type IN ('link', 'password', 'user')),
    password_hash TEXT, -- for password-protected shares
    allowed_user_id INTEGER, -- for user-specific shares
    download_limit INTEGER, -- NULL = unlimited
    download_count INTEGER DEFAULT 0,
    expires_at INTEGER, -- NULL = never expires
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (allowed_user_id) REFERENCES users (id) ON DELETE CASCADE,
    CHECK ((file_id IS NOT NULL AND folder_id IS NULL) OR (file_id IS NULL AND folder_id IS NOT NULL))
);

-- Network configuration for WiFi management
CREATE TABLE IF NOT EXISTS network_config (
    id INTEGER PRIMARY KEY,
    mode TEXT NOT NULL DEFAULT 'hotspot' CHECK (mode IN ('hotspot', 'client', 'ethernet')),
    hotspot_ssid TEXT NOT NULL DEFAULT 'PocketCloud',
    hotspot_password TEXT NOT NULL DEFAULT 'pocketcloud123',
    client_ssid TEXT,
    client_password TEXT,
    hotspot_also_on INTEGER DEFAULT 1, -- keep hotspot on in client mode
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- System audit log for security and debugging
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    resource_type TEXT, -- 'file', 'folder', 'user', 'system'
    resource_id TEXT,
    details TEXT, -- JSON details
    ip_address TEXT,
    user_agent TEXT,
    success INTEGER DEFAULT 1,
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- File versions for version control
CREATE TABLE IF NOT EXISTS file_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    version_number INTEGER NOT NULL,
    size INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE (file_id, version_number)
);

-- Full-text search index for files
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
    name,
    path,
    content, -- extracted text content
    metadata,
    content='files',
    content_rowid='id'
);

-- Media streaming metadata
CREATE TABLE IF NOT EXISTS media_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER UNIQUE NOT NULL,
    duration REAL, -- seconds
    width INTEGER,
    height INTEGER,
    bitrate INTEGER,
    codec TEXT,
    framerate REAL,
    has_audio INTEGER DEFAULT 0,
    has_video INTEGER DEFAULT 0,
    thumbnail_count INTEGER DEFAULT 0,
    hls_playlist_path TEXT, -- path to HLS m3u8 file
    transcode_status TEXT DEFAULT 'pending' CHECK (transcode_status IN ('pending', 'processing', 'completed', 'failed')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
);

-- Sync engine state tracking
CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    last_sync_at INTEGER,
    sync_token TEXT,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE (user_id, device_id)
);

-- API keys for developer access
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    permissions TEXT NOT NULL, -- JSON array of permissions
    last_used_at INTEGER,
    expires_at INTEGER, -- NULL = never expires
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Webhooks for external integrations
CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL, -- JSON array of event types
    secret TEXT, -- for webhook signature verification
    is_active INTEGER DEFAULT 1,
    last_triggered_at INTEGER,
    failure_count INTEGER DEFAULT 0,
    created_by INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
);

-- Upload sessions for chunked file uploads
CREATE TABLE IF NOT EXISTS upload_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    folder_id INTEGER,
    checksum TEXT NOT NULL,
    chunk_size INTEGER NOT NULL,
    total_chunks INTEGER NOT NULL,
    received_chunks TEXT DEFAULT '[]', -- JSON array of received chunk indices
    temp_dir TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_owner_id ON files (owner_id);
CREATE INDEX IF NOT EXISTS idx_files_parent_folder_id ON files (parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_files_path ON files (path);
CREATE INDEX IF NOT EXISTS idx_files_is_deleted ON files (is_deleted);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files (created_at);
CREATE INDEX IF NOT EXISTS idx_files_uuid ON files (uuid);

CREATE INDEX IF NOT EXISTS idx_folders_owner_id ON folders (owner_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_folder_id ON folders (parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders (path);
CREATE INDEX IF NOT EXISTS idx_folders_is_deleted ON folders (is_deleted);

CREATE INDEX IF NOT EXISTS idx_shares_uuid ON shares (uuid);
CREATE INDEX IF NOT EXISTS idx_shares_owner_id ON shares (owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares (expires_at);
CREATE INDEX IF NOT EXISTS idx_shares_is_active ON shares (is_active);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);

CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON file_versions (file_id);
CREATE INDEX IF NOT EXISTS idx_media_metadata_file_id ON media_metadata (file_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_user_device ON sync_state (user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_created_by ON webhooks (created_by);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id ON upload_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at ON upload_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_id ON upload_sessions (upload_id);

-- Triggers for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
    AFTER UPDATE ON users
    BEGIN
        UPDATE users SET updated_at = unixepoch() WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_files_timestamp 
    AFTER UPDATE ON files
    BEGIN
        UPDATE files SET updated_at = unixepoch() WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_folders_timestamp 
    AFTER UPDATE ON folders
    BEGIN
        UPDATE folders SET updated_at = unixepoch() WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_shares_timestamp 
    AFTER UPDATE ON shares
    BEGIN
        UPDATE shares SET updated_at = unixepoch() WHERE id = NEW.id;
    END;

-- Trigger for upload sessions timestamp updates
CREATE TRIGGER IF NOT EXISTS update_upload_sessions_timestamp 
    AFTER UPDATE ON upload_sessions
    BEGIN
        UPDATE upload_sessions SET updated_at = unixepoch() WHERE id = NEW.id;
    END;

-- Insert default network configuration
INSERT OR IGNORE INTO network_config (id, mode, hotspot_ssid, hotspot_password) 
VALUES (1, 'hotspot', 'PocketCloud', 'pocketcloud123');