-- Agency docs (SOPs) — admin-only read/write via service role in edit-actions.ts
create table if not exists agency_docs (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Service role bypasses RLS; lock down direct access just in case
alter table agency_docs enable row level security;

-- No client-facing policies — all access via admin client in edit-actions.ts
