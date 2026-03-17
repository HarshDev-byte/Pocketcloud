-- Power Features: Favorites, Comments, Recents, 2FA, Guest Accounts, File Locking

-- Favorites / Starred files
CREATE TABLE IF NOT EXISTS favorites (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id    TEXT REFERENCES files(id) ON DELETE CASCADE,
  folder_id  TEXT REFERENCES folders(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, file_id, folder_id),
  CHECK ((file_id IS NOT NULL AND folder_id IS NULL) OR
         (file_id IS NULL AND folder_id IS NOT NULL))
);

-- Comments on files
CREATE TABLE IF NOT EXISTS file_comments (
  id         TEXT PRIMARY KEY,
  file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  edited     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_file ON file_comments(file_id, created_at ASC);

-- Recent file access tracking
CREATE TABLE IF NOT EXISTS file_access (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id      TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  accessed_at  INTEGER NOT NULL,
  access_type  TEXT NOT NULL DEFAULT 'view',  -- 'view'|'download'|'edit'
  PRIMARY KEY (user_id, file_id)  -- one record per user+file, updated each time
);

CREATE INDEX IF NOT EXISTS idx_file_access_user ON file_access(user_id, accessed_at DESC);

-- TOTP 2FA
ALTER TABLE users ADD COLUMN totp_secret TEXT;    -- null = 2FA disabled
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_backup_codes TEXT;  -- JSON array of hashed backup codes

-- Guest accounts
ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN guest_expires_at INTEGER;  -- null = permanent
ALTER TABLE users ADD COLUMN created_by TEXT REFERENCES users(id);  -- who created guest

-- File locking
CREATE TABLE IF NOT EXISTS file_locks (
  file_id    TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  locked_by  TEXT NOT NULL REFERENCES users(id),
  reason     TEXT,
  locked_at  INTEGER NOT NULL,
  expires_at INTEGER     -- null = until manually unlocked
);
