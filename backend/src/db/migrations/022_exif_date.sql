-- Add exif_date column for photo metadata
-- This stores the date when the photo was taken (from EXIF data)
-- Falls back to created_at if no EXIF date available

ALTER TABLE files ADD COLUMN exif_date INTEGER;

-- Create index for efficient photo gallery queries
CREATE INDEX idx_files_exif_date ON files(owner_id, exif_date) WHERE mime_type LIKE 'image/%' AND is_deleted = 0;