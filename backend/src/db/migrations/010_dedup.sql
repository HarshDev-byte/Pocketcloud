-- File Deduplication Migration
-- Creates content_store table for deduplication and updates files table

-- Content store table - one entry per unique file content
CREATE TABLE IF NOT EXISTS content_store (
    checksum     TEXT PRIMARY KEY,  -- SHA-256 of file contents
    storage_path TEXT NOT NULL,     -- ONE canonical path on disk
    size         INTEGER NOT NULL,  -- File size in bytes
    ref_count    INTEGER NOT NULL DEFAULT 1,  -- Number of files referencing this content
    created_at   INTEGER NOT NULL   -- Timestamp when content was first stored
);

-- Add content_checksum column to files table
ALTER TABLE files ADD COLUMN content_checksum TEXT REFERENCES content_store(checksum);

-- Migrate existing files: populate content_checksum from files.checksum
UPDATE files SET content_checksum = checksum WHERE content_checksum IS NULL;

-- Index for fast dedup check on upload
CREATE INDEX IF NOT EXISTS idx_content_store_checksum ON content_store(checksum);

-- Index for efficient ref_count operations
CREATE INDEX IF NOT EXISTS idx_content_store_ref_count ON content_store(ref_count);

-- Populate content_store with existing unique files
INSERT OR IGNORE INTO content_store (checksum, storage_path, size, ref_count, created_at)
SELECT 
    checksum,
    storage_path,
    size,
    COUNT(*) as ref_count,
    MIN(created_at) as created_at
FROM files 
WHERE is_deleted = 0 AND checksum IS NOT NULL
GROUP BY checksum;