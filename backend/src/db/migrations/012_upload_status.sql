-- Add status column to upload_sessions for graceful shutdown support
ALTER TABLE upload_sessions ADD COLUMN status TEXT DEFAULT 'active';

-- Create index for faster status queries
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
