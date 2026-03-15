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

CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id ON upload_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at ON upload_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_id ON upload_sessions (upload_id);

-- Trigger for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS update_upload_sessions_timestamp 
    AFTER UPDATE ON upload_sessions
    BEGIN
        UPDATE upload_sessions SET updated_at = unixepoch() WHERE id = NEW.id;
    END;