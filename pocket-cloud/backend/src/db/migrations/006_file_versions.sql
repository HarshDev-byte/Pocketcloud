-- File versioning system migration
-- Creates file_versions table and adds version tracking to files table

-- Create file_versions table
CREATE TABLE IF NOT EXISTS file_versions (
    id          TEXT PRIMARY KEY,
    file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    version_num INTEGER NOT NULL,
    size        INTEGER NOT NULL,
    checksum    TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_by  TEXT NOT NULL REFERENCES users(id),
    created_at  INTEGER NOT NULL,
    comment     TEXT,
    is_current  INTEGER NOT NULL DEFAULT 0
);

-- Create index for efficient version queries
CREATE INDEX IF NOT EXISTS idx_versions_file ON file_versions(file_id, version_num DESC);

-- Add version tracking columns to files table
ALTER TABLE files ADD COLUMN version_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE files ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1;

-- Create initial version records for existing files
INSERT INTO file_versions (id, file_id, version_num, size, checksum, storage_path, created_by, created_at, comment, is_current)
SELECT 
    hex(randomblob(16)) as id,
    f.id as file_id,
    1 as version_num,
    f.size,
    f.checksum,
    f.storage_path,
    f.owner_id as created_by,
    f.created_at,
    'Initial version' as comment,
    1 as is_current
FROM files f
WHERE f.is_deleted = 0
AND NOT EXISTS (
    SELECT 1 FROM file_versions fv WHERE fv.file_id = f.id
);