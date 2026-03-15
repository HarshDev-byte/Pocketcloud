-- Migration 005: Add audit log table for security monitoring
-- This table tracks all security-relevant events in the system

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'fail', 'detected')),
  metadata TEXT, -- JSON string for additional event data
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_ip_address ON audit_log(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_result ON audit_log(result);
CREATE INDEX IF NOT EXISTS idx_audit_resource_type ON audit_log(resource_type);

-- Insert initial audit entry for migration
INSERT INTO audit_log (
  user_id, action, resource_type, resource_id, 
  ip_address, user_agent, result, metadata, created_at
) VALUES (
  NULL, 'system_migration', 'database', '005_audit_log',
  '127.0.0.1', 'migration-script', 'success',
  '{"migration": "005_audit_log", "description": "Added audit logging table"}',
  strftime('%s', 'now') * 1000
);