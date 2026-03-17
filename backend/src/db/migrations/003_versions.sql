CREATE TABLE IF NOT EXISTS file_versions (
    id           TEXT PRIMARY KEY,
    file_id      TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    version_num  INTEGER NOT NULL,
    size         INTEGER NOT NULL,
    checksum     TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_by   TEXT NOT NULL REFERENCES users(id),
    created_at   INTEGER NOT NULL,
    label        TEXT,          -- optional: "Before redesign", auto: "v3"
    is_current   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_versions_file ON file_versions(file_id, version_num DESC);
CREATE INDEX IF NOT EXISTS idx_versions_current ON file_versions(file_id) WHERE is_current = 1;

-- Add version tracking to files table
ALTER TABLE files ADD COLUMN version_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE files ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1;