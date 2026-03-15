-- Webhooks and automation system
-- Migration 012: Add webhook support for external integrations

CREATE TABLE webhooks (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  secret       TEXT NOT NULL,    -- HMAC signing secret
  events       TEXT NOT NULL,    -- JSON array of event types
  is_active    INTEGER DEFAULT 1,
  created_at   INTEGER NOT NULL,
  last_fired_at INTEGER,
  last_status  INTEGER,          -- HTTP status of last delivery
  fail_count   INTEGER DEFAULT 0
);

CREATE TABLE webhook_deliveries (
  id           TEXT PRIMARY KEY,
  webhook_id   TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  payload      TEXT NOT NULL,    -- JSON
  status       INTEGER,          -- HTTP response status
  response     TEXT,             -- first 500 chars of response body
  duration_ms  INTEGER,
  created_at   INTEGER NOT NULL,
  delivered_at INTEGER
);

-- Index for efficient webhook lookups
CREATE INDEX idx_webhooks_user_active ON webhooks(user_id, is_active);
CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status, created_at);

-- Index for retry logic (failed deliveries)
CREATE INDEX idx_webhook_deliveries_retry ON webhook_deliveries(webhook_id, status, created_at) 
WHERE status IS NULL OR (status >= 400 AND status < 600);