-- Add posted_at to pipeline_items for tracking the exact datetime a post was/will be published
alter table pipeline_items add column if not exists posted_at timestamptz;
