-- Media processing pipeline tables and columns
-- Adds thumbnail paths, media metadata, and processing queue

-- Add media-related columns to files table
ALTER TABLE files ADD COLUMN thumb_sm_path TEXT;
ALTER TABLE files ADD COLUMN thumb_md_path TEXT;
ALTER TABLE files ADD COLUMN media_width INTEGER;
ALTER TABLE files ADD COLUMN media_height INTEGER;
ALTER TABLE files ADD COLUMN media_duration REAL;
ALTER TABLE files ADD COLUMN media_codec TEXT;
ALTER TABLE files ADD COLUMN exif_date INTEGER;
ALTER TABLE files ADD COLUMN exif_lat REAL;
ALTER TABLE files ADD COLUMN exif_lng REAL;
ALTER TABLE files ADD COLUMN exif_camera TEXT;
ALTER TABLE files ADD COLUMN dominant_color TEXT;
ALTER TABLE files ADD COLUMN media_status TEXT DEFAULT 'pending';

-- HLS streaming data
CREATE TABLE IF NOT EXISTS hls_streams (
    file_id      TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    master_path  TEXT NOT NULL,
    qualities    TEXT NOT NULL,  -- JSON: ["360p","720p"]
    duration     REAL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   INTEGER NOT NULL,
    error        TEXT
);

-- Media processing queue
CREATE TABLE IF NOT EXISTS media_queue (
    id           TEXT PRIMARY KEY,
    file_id      TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    task_type    TEXT NOT NULL,  -- 'thumbnail'|'hls'|'exif'|'content_index'
    priority     INTEGER NOT NULL DEFAULT 5,
    attempts     INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    status       TEXT NOT NULL DEFAULT 'queued',
    error        TEXT,
    created_at   INTEGER NOT NULL,
    started_at   INTEGER,
    completed_at INTEGER
);

-- Index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_media_queue_status ON media_queue(status, priority DESC, created_at ASC);

-- Index for HLS lookups
CREATE INDEX IF NOT EXISTS idx_hls_streams_file_id ON hls_streams(file_id);

-- Index for media metadata queries
CREATE INDEX IF NOT EXISTS idx_files_media_status ON files(media_status);
CREATE INDEX IF NOT EXISTS idx_files_exif_date ON files(exif_date) WHERE exif_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_exif_location ON files(exif_lat, exif_lng) WHERE exif_lat IS NOT NULL AND exif_lng IS NOT NULL;