-- ============================================================
-- DROP CLIX — Full Database Schema
-- Run this in Supabase SQL Editor (Project > SQL Editor)
-- ============================================================

-- CLIENTS
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  phone text,
  slug text unique not null,
  logo_url text,
  timezone text default 'America/Denver',
  created_at timestamptz default now()
);

-- USERS
create table users (
  id uuid primary key references auth.users(id),
  email text unique not null,
  phone text,
  role text not null check (role in ('admin','client')),
  client_id uuid references clients(id),
  created_at timestamptz default now()
);

-- POSTS
create table posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  post_id text not null,
  title text not null,
  platform text[] not null,
  pillar text,
  hook text,
  format text,
  cta text,
  date date,
  notes text,
  decision text,
  thumbnail_url text,
  created_at timestamptz default now(),
  unique(client_id, post_id)
);

-- POST ANALYTICS
create table post_analytics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id),
  client_id uuid not null references clients(id),
  metric_window text not null check (metric_window in ('live','w24','w3','w7','eom')),
  platform text not null,
  views integer default 0,
  client_views integer,
  likes integer default 0,
  comments integer default 0,
  shares integer default 0,
  saves integer default 0,
  followers integer default 0,
  watch_pct numeric(5,2) default 0,
  hook_rate numeric(5,2) default 0,
  impressions integer default 0,
  ctr numeric(5,2) default 0,
  yt_id text,
  recorded_at timestamptz default now(),
  unique(post_id, platform, metric_window)
);

-- PIPELINE ITEMS
create table pipeline_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  post_id text not null,
  title text not null,
  platform text[] not null,
  yt_type text,
  pillar text,
  status text default 'PLANNED',
  priority integer default 2,
  week text,
  scheduled_date date,
  video_url text,
  thumbnail_url text,
  drive_url text,
  script_content text,
  script_status text default 'draft',
  video_status text default 'draft',
  notes text,
  created_at timestamptz default now()
);

-- APPROVALS
create table approvals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  pipeline_item_id uuid not null references pipeline_items(id),
  type text not null check (type in ('script','video')),
  status text not null check (status in ('pending','approved','rejected')),
  reviewer_id uuid references users(id),
  feedback text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- AD CAMPAIGNS
create table ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  date date,
  objective text,
  status text default 'Active',
  spend numeric(10,2) default 0,
  impressions integer default 0,
  reach integer default 0,
  clicks integer default 0,
  leads integer default 0,
  hires integer default 0,
  revenue numeric(10,2) default 0,
  ctr numeric(5,2) default 0,
  cpm numeric(8,2) default 0,
  cpc numeric(8,2) default 0,
  cpl numeric(8,2) default 0,
  cph numeric(8,2) default 0,
  roas numeric(8,2) default 0,
  created_at timestamptz default now()
);

-- AD CREATIVES
create table ad_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references ad_campaigns(id),
  client_id uuid not null references clients(id),
  name text not null,
  type text check (type in ('video','image','carousel')),
  description text,
  impressions integer default 0,
  ctr numeric(5,2) default 0,
  watch_pct numeric(5,2) default 0,
  cpl numeric(8,2) default 0,
  cph numeric(8,2) default 0,
  status text default 'Testing',
  created_at timestamptz default now()
);

-- AD AUDIENCES
create table ad_audiences (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references ad_campaigns(id),
  client_id uuid not null references clients(id),
  name text not null,
  age text,
  location text,
  targeting text,
  spend numeric(10,2) default 0,
  leads integer default 0,
  cpl numeric(8,2) default 0,
  hires integer default 0,
  cph numeric(8,2) default 0,
  notes text,
  created_at timestamptz default now()
);

-- GOALS
create table goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  period text not null check (period in ('weekly','monthly')),
  metric text not null,
  target numeric(10,2) not null,
  created_at timestamptz default now()
);

-- NOTIFICATIONS
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  client_id uuid references clients(id),
  type text not null,
  title text not null,
  body text,
  channel text check (channel in ('email','sms','in_app')),
  status text default 'sent',
  sent_at timestamptz default now()
);

-- AD RESULTS
create table ad_results (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references ad_campaigns(id),
  client_id uuid not null references clients(id),
  result_type text check (result_type in ('lead','sale','hire','conversation')),
  value numeric(10,2) default 0,
  threshold_hit boolean default false,
  notified_at timestamptz,
  created_at timestamptz default now()
);

-- CALENDAR EVENTS
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  pipeline_item_id uuid references pipeline_items(id),
  title text not null,
  platform text,
  event_date date not null,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
create index on posts(client_id);
create index on post_analytics(post_id);
create index on post_analytics(client_id);
create index on pipeline_items(client_id);
create index on pipeline_items(status);
create index on ad_campaigns(client_id);
create index on calendar_events(client_id);
create index on calendar_events(event_date);
