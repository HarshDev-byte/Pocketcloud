-- File Pipeline Rules

CREATE TABLE IF NOT EXISTS pipeline_rules (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1,
  trigger_type TEXT NOT NULL,   -- 'upload'|'schedule'|'manual'
  priority     INTEGER NOT NULL DEFAULT 0,
  conditions   TEXT NOT NULL,   -- JSON array of condition objects
  actions      TEXT NOT NULL,   -- JSON array of action objects
  run_count    INTEGER NOT NULL DEFAULT 0,
  last_run     INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id           TEXT PRIMARY KEY,
  rule_id      TEXT NOT NULL REFERENCES pipeline_rules(id) ON DELETE CASCADE,
  file_id      TEXT REFERENCES files(id) ON DELETE SET NULL,
  status       TEXT NOT NULL,    -- 'success'|'failed'|'skipped'
  actions_run  TEXT NOT NULL,    -- JSON array of completed actions
  error        TEXT,
  ran_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_rules_user ON pipeline_rules(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_rule ON pipeline_runs(rule_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_file ON pipeline_runs(file_id);
