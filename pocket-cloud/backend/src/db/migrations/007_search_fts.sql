-- Advanced search system migration
-- Creates FTS5 virtual table and triggers for full-text search

-- Create FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
    file_id UNINDEXED,
    name,
    content_preview,    -- first 500 chars of text files, PDF text, EXIF data
    tags,
    tokenize = 'porter unicode61'
);

-- Create trigger to keep FTS table in sync with files table
CREATE TRIGGER IF NOT EXISTS files_fts_insert AFTER INSERT ON files BEGIN
    INSERT INTO files_fts(file_id, name, content_preview, tags) 
    VALUES (new.id, new.name, '', '');
END;

CREATE TRIGGER IF NOT EXISTS files_fts_update AFTER UPDATE ON files BEGIN
    UPDATE files_fts 
    SET name = new.name 
    WHERE file_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS files_fts_delete AFTER DELETE ON files BEGIN
    DELETE FROM files_fts WHERE file_id = old.id;
END;

-- Add search analytics table
CREATE TABLE IF NOT EXISTS search_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    user_id TEXT REFERENCES users(id),
    results_count INTEGER NOT NULL DEFAULT 0,
    search_time_ms INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics(query);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created_at ON search_analytics(created_at);

-- Add content indexing status to files table
ALTER TABLE files ADD COLUMN content_indexed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN content_preview TEXT;
ALTER TABLE files ADD COLUMN tags TEXT;

-- Populate FTS table with existing files
INSERT OR IGNORE INTO files_fts(file_id, name, content_preview, tags)
SELECT id, name, COALESCE(content_preview, ''), COALESCE(tags, '')
FROM files 
WHERE is_deleted = 0;