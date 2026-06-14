-- Session 37 Build 2: Snapshot tables + interpolation columns

-- Permanent analytics captures (never overwrite — one record per post per window)
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES posts(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  pipeline_item_id uuid REFERENCES pipeline_items(id),
  window_type text NOT NULL CHECK (window_type IN ('24hr', '3day', '7day', 'eom')),
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  er_pct numeric(8,4) DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, window_type)
);

-- Scheduled capture jobs (queued at post-detection, executed by cron)
CREATE TABLE IF NOT EXISTS snapshot_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES posts(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  pipeline_item_id uuid REFERENCES pipeline_items(id),
  window_type text NOT NULL CHECK (window_type IN ('24hr', '3day', '7day', 'eom')),
  target_time timestamptz NOT NULL,
  captured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, window_type)
);

-- Enable RLS
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot_jobs ENABLE ROW LEVEL SECURITY;

-- Interpolation support: previous poll data point for growth-rate calculation
ALTER TABLE post_analytics
  ADD COLUMN IF NOT EXISTS prev_views integer,
  ADD COLUMN IF NOT EXISTS prev_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;
