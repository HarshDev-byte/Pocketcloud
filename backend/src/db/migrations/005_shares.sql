-- File and folder sharing system
CREATE TABLE IF NOT EXISTS shares (
    id              TEXT PRIMARY KEY,
    owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_id         TEXT REFERENCES files(id) ON DELETE CASCADE,
    folder_id       TEXT REFERENCES folders(id) ON DELETE CASCADE,
    token           TEXT UNIQUE NOT NULL,
    password_hash   TEXT,              -- null = no password
    expires_at      INTEGER,           -- null = never expires
    max_downloads   INTEGER,           -- null = unlimited
    download_count  INTEGER NOT NULL DEFAULT 0,
    allow_upload    INTEGER NOT NULL DEFAULT 0,  -- folder shares only
    label           TEXT,              -- "Client files", "Photos"
    created_at      INTEGER NOT NULL,
    last_accessed   INTEGER,
    CHECK ((file_id IS NOT NULL AND folder_id IS NULL) OR 
           (file_id IS NULL AND folder_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_file ON shares(file_id);
CREATE INDEX IF NOT EXISTS idx_shares_folder ON shares(folder_id);
CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires_at);