-- Storage Analytics

-- Daily storage snapshots (for growth charts)
CREATE TABLE IF NOT EXISTS storage_snapshots (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,         -- 'YYYY-MM-DD'
  file_count   INTEGER NOT NULL,
  total_bytes  INTEGER NOT NULL,
  image_bytes  INTEGER NOT NULL DEFAULT 0,
  video_bytes  INTEGER NOT NULL DEFAULT 0,
  audio_bytes  INTEGER NOT NULL DEFAULT 0,
  doc_bytes    INTEGER NOT NULL DEFAULT 0,
  other_bytes  INTEGER NOT NULL DEFAULT 0,
  trash_bytes  INTEGER NOT NULL DEFAULT 0,
  version_bytes INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);

-- Admin-level snapshots (null user_id = global)
CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON storage_snapshots(user_id, date DESC);

-- Upload activity (for upload frequency charts)
CREATE TABLE IF NOT EXISTS upload_stats (
  date         TEXT NOT NULL,
  hour         INTEGER NOT NULL,      -- 0-23
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  file_count   INTEGER NOT NULL DEFAULT 0,
  total_bytes  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, hour, user_id)
);

CREATE INDEX IF NOT EXISTS idx_upload_stats_user_date ON upload_stats(user_id, date DESC);
