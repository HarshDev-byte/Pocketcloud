-- Initial schema for Pocket Cloud Drive
-- Migration 001: Create all tables and indexes

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL,
    last_login INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    CHECK (role IN ('admin', 'user')),
    CHECK (is_active IN (0, 1))
);

-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT
);

-- Folders table
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (is_deleted IN (0, 1))
);

-- Files table
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    checksum TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (is_deleted IN (0, 1)),
    CHECK (size >= 0)
);

-- Shares table
CREATE TABLE shares (
    id TEXT PRIMARY KEY,
    file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
    folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    shared_by TEXT NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER,
    password_hash TEXT,
    created_at INTEGER NOT NULL,
    CHECK ((file_id IS NOT NULL AND folder_id IS NULL) OR (file_id IS NULL AND folder_id IS NOT NULL))
);

-- Storage stats table
CREATE TABLE storage_stats (
    id INTEGER PRIMARY KEY,
    total_bytes INTEGER NOT NULL,
    used_bytes INTEGER NOT NULL,
    file_count INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (total_bytes >= 0),
    CHECK (used_bytes >= 0),
    CHECK (file_count >= 0),
    CHECK (used_bytes <= total_bytes)
);

-- Performance indexes
CREATE INDEX idx_files_owner_id ON files(owner_id);
CREATE INDEX idx_files_folder_id ON files(folder_id);
CREATE INDEX idx_files_is_deleted ON files(is_deleted);
CREATE INDEX idx_folders_owner_id ON folders(owner_id);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_folders_path ON folders(path);
CREATE INDEX idx_files_checksum ON files(checksum);
CREATE INDEX idx_shares_token ON shares(token);

-- Insert initial storage stats record
INSERT INTO storage_stats (id, total_bytes, used_bytes, file_count, updated_at) 
VALUES (1, 0, 0, 0, strftime('%s', 'now') * 1000);