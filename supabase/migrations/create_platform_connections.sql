CREATE TABLE IF NOT EXISTS platform_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  platform text NOT NULL,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  channel_name text,
  channel_id text,
  subscriber_count bigint,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id, platform)
);

ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
