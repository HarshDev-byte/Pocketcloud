-- Trash metadata view (makes querying easier)
CREATE VIEW IF NOT EXISTS trash_items AS
SELECT 
    'file' as item_type,
    f.id,
    f.owner_id,
    f.name,
    f.mime_type,
    f.size,
    f.folder_id as parent_id,
    f.deleted_at,
    (f.deleted_at + 30 * 24 * 60 * 60 * 1000) as purge_at,
    CAST((f.deleted_at + 30 * 24 * 60 * 60 * 1000 - (unixepoch() * 1000)) / 86400000 AS INTEGER) as days_until_purge
FROM files f
WHERE f.is_deleted = 1

UNION ALL

SELECT 
    'folder' as item_type,
    fo.id,
    fo.owner_id,
    fo.name,
    'folder' as mime_type,
    0 as size,
    fo.parent_id,
    fo.deleted_at,
    (fo.deleted_at + 30 * 24 * 60 * 60 * 1000) as purge_at,
    CAST((fo.deleted_at + 30 * 24 * 60 * 60 * 1000 - (unixepoch() * 1000)) / 86400000 AS INTEGER) as days_until_purge
FROM folders fo
WHERE fo.is_deleted = 1;

-- Index for cleanup job performance
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at) WHERE is_deleted = 1;
CREATE INDEX IF NOT EXISTS idx_folders_deleted_at ON folders(deleted_at) WHERE is_deleted = 1;