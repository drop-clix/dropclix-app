-- Session 35: Content approval workflow + client notes + agency docs

-- Add drive_file_id and approval fields to pipeline_items
ALTER TABLE pipeline_items
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS approval_comment text;

-- Client notes table
CREATE TABLE IF NOT EXISTS client_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  shared_with_client boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure one note row per client
CREATE UNIQUE INDEX IF NOT EXISTS client_notes_client_id_idx ON client_notes(client_id);

-- Agency docs table (global, not per-client)
CREATE TABLE IF NOT EXISTS agency_docs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: service role bypasses, client reads own notes if shared
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_notes_select" ON client_notes
  FOR SELECT USING (
    client_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "agency_docs_admin_only" ON agency_docs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
