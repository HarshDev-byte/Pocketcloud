-- Add quota system to users table
ALTER TABLE users ADD COLUMN quota_bytes INTEGER NULL;

-- Add log entries table for structured logging
CREATE TABLE IF NOT EXISTS log_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  service TEXT NOT NULL,
  user_id TEXT NULL,
  message TEXT NOT NULL,
  meta TEXT NULL, -- JSON string for additional metadata
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- Index for log queries
CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries (timestamp);
CREATE INDEX IF NOT EXISTS idx_log_entries_level ON log_entries (level);
CREATE INDEX IF NOT EXISTS idx_log_entries_service ON log_entries (service);
CREATE INDEX IF NOT EXISTS idx_log_entries_user ON log_entries (user_id);

-- Add daily stats table for dashboard charts
CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY, -- YYYY-MM-DD format
  uploads_count INTEGER DEFAULT 0,
  storage_used INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Index for stats queries
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats (date);