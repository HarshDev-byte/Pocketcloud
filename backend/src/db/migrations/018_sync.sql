-- Folder Sync Protocol

-- Sync clients (desktop apps)
CREATE TABLE IF NOT EXISTS sync_clients (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name  TEXT NOT NULL,
  device_os    TEXT NOT NULL,  -- 'macos'|'windows'|'linux'
  remote_folder_id TEXT REFERENCES folders(id),
  last_sync    INTEGER,
  sync_token   TEXT UNIQUE,    -- cursor for delta sync
  created_at   INTEGER NOT NULL
);

-- Sync state tracking (what's on each client)
CREATE TABLE IF NOT EXISTS sync_state (
  client_id    TEXT NOT NULL REFERENCES sync_clients(id) ON DELETE CASCADE,
  file_id      TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  local_path   TEXT NOT NULL,  -- relative path on client device
  local_hash   TEXT NOT NULL,  -- SHA-256 of client's copy
  synced_at    INTEGER NOT NULL,
  PRIMARY KEY (client_id, file_id)
);

-- Sync events (change log for delta sync)
CREATE TABLE IF NOT EXISTS sync_events (
  id           TEXT PRIMARY KEY,
  folder_id    TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,  -- 'created'|'modified'|'deleted'|'moved'
  file_id      TEXT REFERENCES files(id),
  old_path     TEXT,
  new_path     TEXT,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_clients_user ON sync_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_client ON sync_state(client_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_folder_time ON sync_events(folder_id, created_at DESC);
