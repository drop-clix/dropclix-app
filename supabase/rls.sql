-- ============================================================
-- DROP CLIX — Row Level Security Policies
-- Run AFTER schema.sql in Supabase SQL Editor
-- ============================================================

-- Helper function: get current user's role
create or replace function get_my_role()
returns text as $$
  select role from users where id = auth.uid();
$$ language sql security definer stable;

-- Helper function: get current user's client_id
create or replace function get_my_client_id()
returns uuid as $$
  select client_id from users where id = auth.uid();
$$ language sql security definer stable;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
alter table clients         enable row level security;
alter table users           enable row level security;
alter table posts           enable row level security;
alter table post_analytics  enable row level security;
alter table pipeline_items  enable row level security;
alter table approvals       enable row level security;
alter table ad_campaigns    enable row level security;
alter table ad_creatives    enable row level security;
alter table ad_audiences    enable row level security;
alter table goals           enable row level security;
alter table notifications   enable row level security;
alter table ad_results      enable row level security;
alter table calendar_events enable row level security;

-- ============================================================
-- CLIENTS
-- ============================================================
create policy "admin: full access to clients"
  on clients for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own client record"
  on clients for select
  using (id = get_my_client_id());

-- ============================================================
-- USERS
-- ============================================================
create policy "admin: full access to users"
  on users for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own user record"
  on users for select
  using (id = auth.uid());

-- ============================================================
-- POSTS
-- ============================================================
create policy "admin: full access to posts"
  on posts for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own posts"
  on posts for select
  using (client_id = get_my_client_id());

-- ============================================================
-- POST ANALYTICS
-- ============================================================
create policy "admin: full access to post_analytics"
  on post_analytics for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own post analytics"
  on post_analytics for select
  using (client_id = get_my_client_id());

-- ============================================================
-- PIPELINE ITEMS
-- ============================================================
create policy "admin: full access to pipeline_items"
  on pipeline_items for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own pipeline items"
  on pipeline_items for select
  using (client_id = get_my_client_id());

-- ============================================================
-- APPROVALS
-- ============================================================
create policy "admin: full access to approvals"
  on approvals for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own approvals"
  on approvals for select
  using (client_id = get_my_client_id());

create policy "client: update own approvals (approve/reject)"
  on approvals for update
  using (client_id = get_my_client_id())
  with check (client_id = get_my_client_id());

-- ============================================================
-- AD CAMPAIGNS
-- ============================================================
create policy "admin: full access to ad_campaigns"
  on ad_campaigns for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own ad campaigns"
  on ad_campaigns for select
  using (client_id = get_my_client_id());

-- ============================================================
-- AD CREATIVES
-- ============================================================
create policy "admin: full access to ad_creatives"
  on ad_creatives for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own ad creatives"
  on ad_creatives for select
  using (client_id = get_my_client_id());

-- ============================================================
-- AD AUDIENCES
-- ============================================================
create policy "admin: full access to ad_audiences"
  on ad_audiences for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own ad audiences"
  on ad_audiences for select
  using (client_id = get_my_client_id());

-- ============================================================
-- GOALS
-- ============================================================
create policy "admin: full access to goals"
  on goals for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own goals"
  on goals for select
  using (client_id = get_my_client_id());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create policy "admin: full access to notifications"
  on notifications for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own notifications"
  on notifications for select
  using (
    user_id = auth.uid()
    or client_id = get_my_client_id()
  );

-- ============================================================
-- AD RESULTS
-- ============================================================
create policy "admin: full access to ad_results"
  on ad_results for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own ad results"
  on ad_results for select
  using (client_id = get_my_client_id());

-- ============================================================
-- CALENDAR EVENTS
-- ============================================================
create policy "admin: full access to calendar_events"
  on calendar_events for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

create policy "client: read own calendar events"
  on calendar_events for select
  using (client_id = get_my_client_id());
