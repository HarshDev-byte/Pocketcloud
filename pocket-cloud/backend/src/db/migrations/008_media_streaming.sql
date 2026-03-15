-- Media streaming tables for playback positions and media library

-- Playback positions for resume functionality
CREATE TABLE IF NOT EXISTS playback_positions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    position REAL NOT NULL DEFAULT 0,  -- seconds
    duration REAL,                     -- total duration in seconds
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (user_id, file_id)
);

-- Media library for enhanced metadata and organization
CREATE TABLE IF NOT EXISTS media_library (
    file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,          -- 'movie', 'episode', 'music', 'photo'
    title TEXT,                        -- parsed or user-defined title
    year INTEGER,                      -- release year
    duration REAL,                     -- duration in seconds
    width INTEGER,                     -- video width
    height INTEGER,                    -- video height
    video_codec TEXT,                  -- video codec (h264, hevc, etc)
    audio_codec TEXT,                  -- audio codec (aac, mp3, etc)
    needs_transcode INTEGER DEFAULT 0, -- 1 if transcoding needed
    transcode_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    indexed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_playback_positions_user_updated 
ON playback_positions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_playback_positions_file 
ON playback_positions(file_id);

CREATE INDEX IF NOT EXISTS idx_media_library_type 
ON media_library(media_type);

CREATE INDEX IF NOT EXISTS idx_media_library_transcode 
ON media_library(needs_transcode, transcode_status);

CREATE INDEX IF NOT EXISTS idx_media_library_duration 
ON media_library(duration DESC);

-- Triggers to update timestamps
CREATE TRIGGER IF NOT EXISTS update_playback_positions_timestamp
    AFTER UPDATE ON playback_positions
    FOR EACH ROW
BEGIN
    UPDATE playback_positions 
    SET updated_at = strftime('%s', 'now') * 1000 
    WHERE user_id = NEW.user_id AND file_id = NEW.file_id;
END;

CREATE TRIGGER IF NOT EXISTS update_media_library_timestamp
    AFTER UPDATE ON media_library
    FOR EACH ROW
BEGIN
    UPDATE media_library 
    SET updated_at = strftime('%s', 'now') * 1000 
    WHERE file_id = NEW.file_id;
END;