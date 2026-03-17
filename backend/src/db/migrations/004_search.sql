-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
    file_id UNINDEXED,
    name,
    content_preview,
    mime_category,
    tokenize = 'porter unicode61 remove_diacritics 1'
);

-- Populate FTS index for existing files
INSERT INTO files_fts(file_id, name, mime_category)
SELECT id, name, 
    CASE 
        WHEN mime_type LIKE 'image/%' THEN 'image'
        WHEN mime_type LIKE 'video/%' THEN 'video'
        WHEN mime_type LIKE 'audio/%' THEN 'audio'
        WHEN mime_type LIKE 'application/pdf' THEN 'pdf'
        WHEN mime_type LIKE 'text/%' THEN 'text'
        ELSE 'other'
    END
FROM files WHERE is_deleted = 0;

-- Keep FTS in sync with triggers
CREATE TRIGGER IF NOT EXISTS files_fts_insert
AFTER INSERT ON files BEGIN
    INSERT INTO files_fts(file_id, name, mime_category)
    VALUES (new.id, new.name,
        CASE 
            WHEN new.mime_type LIKE 'image/%' THEN 'image'
            WHEN new.mime_type LIKE 'video/%' THEN 'video'
            WHEN new.mime_type LIKE 'audio/%' THEN 'audio'
            WHEN new.mime_type LIKE 'application/pdf' THEN 'pdf'
            WHEN new.mime_type LIKE 'text/%' THEN 'text'
            ELSE 'other'
        END
    );
END;

CREATE TRIGGER IF NOT EXISTS files_fts_update
AFTER UPDATE OF name ON files BEGIN
    UPDATE files_fts SET name = new.name WHERE file_id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS files_fts_delete
AFTER UPDATE OF is_deleted ON files WHEN new.is_deleted = 1 BEGIN
    DELETE FROM files_fts WHERE file_id = new.id;
END;

-- Add content_preview column to files table
ALTER TABLE files ADD COLUMN content_preview TEXT;