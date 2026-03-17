-- File Encryption at Rest Migration
-- Adds support for client-side encryption with zero-knowledge architecture

-- Add encryption columns to files table
ALTER TABLE files ADD COLUMN is_encrypted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN encryption_salt TEXT;
ALTER TABLE files ADD COLUMN encryption_iv TEXT;
ALTER TABLE files ADD COLUMN encryption_hint TEXT;

-- Create vaults table for encrypted folders
CREATE TABLE IF NOT EXISTS vaults (
    id           TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id    TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    salt         TEXT NOT NULL,
    hint         TEXT,
    created_at   INTEGER NOT NULL
);

-- Create unique index to ensure one vault per folder
CREATE UNIQUE INDEX IF NOT EXISTS idx_vaults_folder ON vaults(folder_id);

-- Create index for encrypted files lookup
CREATE INDEX IF NOT EXISTS idx_files_encrypted ON files(is_encrypted) WHERE is_encrypted = 1;

-- Create index for vault ownership
CREATE INDEX IF NOT EXISTS idx_vaults_owner ON vaults(owner_id);