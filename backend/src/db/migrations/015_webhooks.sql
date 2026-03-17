-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  secret       TEXT NOT NULL,
  events       TEXT NOT NULL,  -- JSON array of event types
  is_active    INTEGER NOT NULL DEFAULT 1,
  fail_count   INTEGER NOT NULL DEFAULT 0,
  last_fired   INTEGER,
  last_status  INTEGER,
  created_at   INTEGER NOT NULL
);

-- Webhook delivery logs
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           TEXT PRIMARY KEY,
  webhook_id   TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  payload      TEXT NOT NULL,
  http_status  INTEGER,
  response     TEXT,
  duration_ms  INTEGER,
  success      INTEGER,
  delivered_at INTEGER NOT NULL,
  retry_count  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, delivered_at DESC);
