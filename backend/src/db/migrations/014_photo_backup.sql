-- Backup devices table
CREATE TABLE IF NOT EXISTS backup_devices (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name  TEXT NOT NULL,       -- "iPhone 15 Pro", "Pixel 8"
  device_os    TEXT NOT NULL,       -- 'ios' | 'android'
  last_seen    INTEGER,
  last_backup  INTEGER,
  total_backed_up INTEGER DEFAULT 0,
  created_at   INTEGER NOT NULL
);

-- Backup manifest - tracks which photos from each device are backed up
CREATE TABLE IF NOT EXISTS backup_manifest (
  device_id    TEXT NOT NULL REFERENCES backup_devices(id) ON DELETE CASCADE,
  local_id     TEXT NOT NULL,       -- device-local photo ID (never changes)
  file_id      TEXT REFERENCES files(id) ON DELETE SET NULL,
  checksum     TEXT NOT NULL,
  backed_up_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, local_id) ON CONFLICT REPLACE
);

CREATE INDEX IF NOT EXISTS idx_manifest_device ON backup_manifest(device_id);
CREATE INDEX IF NOT EXISTS idx_manifest_checksum ON backup_manifest(checksum);
CREATE INDEX IF NOT EXISTS idx_backup_devices_user ON backup_devices(user_id);
