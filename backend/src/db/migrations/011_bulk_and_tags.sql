-- Bulk Operations and File Tagging Migration
-- Creates tables for tags, file_tags, and bulk_jobs

-- Tags table for organizing files
CREATE TABLE IF NOT EXISTS tags (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6366f1',
    created_at INTEGER NOT NULL,
    UNIQUE(owner_id, name)
);

-- File-Tag relationships (many-to-many)
CREATE TABLE IF NOT EXISTS file_tags (
    file_id  TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (file_id, tag_id)
);

-- Bulk operation jobs for tracking progress
CREATE TABLE IF NOT EXISTS bulk_jobs (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id),
    operation    TEXT NOT NULL,  -- 'move'|'copy'|'delete'|'tag'|'untag'
    status       TEXT NOT NULL DEFAULT 'running',
    total        INTEGER NOT NULL,
    processed    INTEGER NOT NULL DEFAULT 0,
    succeeded    INTEGER NOT NULL DEFAULT 0,
    failed       INTEGER NOT NULL DEFAULT 0,
    errors       TEXT DEFAULT '[]',  -- JSON array of {itemId, error}
    created_at   INTEGER NOT NULL,
    completed_at INTEGER
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tags_owner ON tags(owner_id);
CREATE INDEX IF NOT EXISTS idx_file_tags_file ON file_tags(file_id);
CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_user ON bulk_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_status ON bulk_jobs(status);