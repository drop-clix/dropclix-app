-- S72: Unlinked platform video discovery candidates.
-- Discovery rows are passive candidates only. They never write to pipeline_items
-- until an admin explicitly links, creates, or ignores them.

create table if not exists unlinked_video_discoveries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  platform text not null check (platform in ('ig','tt','yt')),
  platform_video_id text not null,
  permalink text,
  title text,
  thumbnail_url text,
  published_at timestamptz,
  views integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  status text not null default 'unlinked' check (status in ('unlinked','linked','ignored')),
  pipeline_item_id uuid references pipeline_items(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  linked_at timestamptz,
  ignored_at timestamptz,
  unique(client_id, platform, platform_video_id)
);

create index if not exists unlinked_video_discoveries_client_status
  on unlinked_video_discoveries(client_id, status, last_seen_at desc);

alter table unlinked_video_discoveries enable row level security;

drop policy if exists "admin: full access to unlinked_video_discoveries"
  on unlinked_video_discoveries;

create policy "admin: full access to unlinked_video_discoveries"
  on unlinked_video_discoveries for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');
