-- Shares table for file and folder sharing
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  owner_id TEXT NOT NULL,
  file_id TEXT NULL,
  folder_id TEXT NULL,
  password_hash TEXT NULL,
  expires_at INTEGER NULL,
  max_downloads INTEGER NULL,
  download_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE,
  CHECK ((file_id IS NOT NULL AND folder_id IS NULL) OR (file_id IS NULL AND folder_id IS NOT NULL))
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares (token);

-- Index for owner queries
CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares (owner_id);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares (expires_at);