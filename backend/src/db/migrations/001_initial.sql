CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
    quota_bytes  INTEGER,
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL,
    last_login   INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT UNIQUE NOT NULL,
    ip_address   TEXT,
    user_agent   TEXT,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
    id           TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL REFERENCES users(id),
    parent_id    TEXT REFERENCES folders(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    path         TEXT NOT NULL,
    is_deleted   INTEGER NOT NULL DEFAULT 0,
    deleted_at   INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
    id           TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL REFERENCES users(id),
    folder_id    TEXT REFERENCES folders(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type    TEXT NOT NULL,
    size         INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    checksum     TEXT NOT NULL,
    is_deleted   INTEGER NOT NULL DEFAULT 0,
    deleted_at   INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS upload_sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id),
    folder_id    TEXT REFERENCES folders(id),
    filename     TEXT NOT NULL,
    mime_type    TEXT NOT NULL,
    total_size   INTEGER NOT NULL,
    chunk_size   INTEGER NOT NULL DEFAULT 5242880,
    total_chunks INTEGER NOT NULL,
    received_chunks TEXT NOT NULL DEFAULT '[]',
    checksum     TEXT NOT NULL,
    temp_dir     TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS network_config (
    id               INTEGER PRIMARY KEY CHECK (id = 1),
    mode             TEXT NOT NULL DEFAULT 'hotspot',
    hotspot_ssid     TEXT NOT NULL DEFAULT 'PocketCloud',
    hotspot_password TEXT NOT NULL DEFAULT 'pocketcloud123',
    client_ssid      TEXT,
    updated_at       INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_deleted ON files(is_deleted);
CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user ON upload_sessions(user_id);