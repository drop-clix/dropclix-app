-- Add video_url to pipeline_items for "Mark as Posted" URL tracking
ALTER TABLE pipeline_items ADD COLUMN IF NOT EXISTS video_url varchar(500);
