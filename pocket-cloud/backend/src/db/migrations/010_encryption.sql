-- End-to-end encryption support

-- Add encryption fields to files table
ALTER TABLE files ADD COLUMN is_encrypted INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN encryption_hint TEXT; -- Optional user hint (not the key!)

-- Add encryption fields to folders table for vault functionality
ALTER TABLE folders ADD COLUMN is_vault INTEGER DEFAULT 0;
ALTER TABLE folders ADD COLUMN vault_hint TEXT; -- Optional user hint for vault password

-- Indexes for encrypted file queries
CREATE INDEX IF NOT EXISTS idx_files_encrypted ON files(is_encrypted) WHERE is_encrypted = 1;
CREATE INDEX IF NOT EXISTS idx_folders_vault ON folders(is_vault) WHERE is_vault = 1;

-- Update existing files to mark .pcd files as encrypted
UPDATE files SET is_encrypted = 1 WHERE name LIKE '%.pcd';

-- Trigger to automatically mark .pcd files as encrypted
CREATE TRIGGER IF NOT EXISTS mark_encrypted_files
    AFTER INSERT ON files
    FOR EACH ROW
    WHEN NEW.name LIKE '%.pcd'
BEGIN
    UPDATE files SET is_encrypted = 1 WHERE id = NEW.id;
END;

-- Trigger to prevent thumbnail generation for encrypted files
CREATE TRIGGER IF NOT EXISTS skip_encrypted_thumbnails
    AFTER INSERT ON files
    FOR EACH ROW
    WHEN NEW.is_encrypted = 1
BEGIN
    UPDATE files SET 
        processing_status = 'skipped',
        processing_error = 'Encrypted file - thumbnails not generated'
    WHERE id = NEW.id;
END;