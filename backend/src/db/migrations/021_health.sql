-- Health Monitoring System

CREATE TABLE IF NOT EXISTS health_checks (
  id           TEXT PRIMARY KEY,
  check_type   TEXT NOT NULL,
  status       TEXT NOT NULL,    -- 'ok'|'warn'|'critical'|'error'
  value        TEXT,             -- current measured value
  threshold    TEXT,             -- threshold that was breached
  message      TEXT,
  auto_healed  INTEGER DEFAULT 0,
  heal_action  TEXT,
  checked_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_type_time ON health_checks(check_type, checked_at DESC);

CREATE TABLE IF NOT EXISTS health_incidents (
  id           TEXT PRIMARY KEY,
  check_type   TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  resolved_at  INTEGER,
  status       TEXT NOT NULL,    -- 'active'|'resolved'|'acknowledged'
  severity     TEXT NOT NULL,    -- 'warn'|'critical'
  description  TEXT NOT NULL,
  auto_resolved INTEGER DEFAULT 0,
  resolution   TEXT
);

CREATE INDEX IF NOT EXISTS idx_health_incidents_status ON health_incidents(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_incidents_type ON health_incidents(check_type);
