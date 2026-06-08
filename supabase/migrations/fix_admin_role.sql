-- ============================================================
-- Fix: Admin role resilience
-- Run in Supabase SQL Editor on production
-- ============================================================

-- 1. Update get_my_role() to fall back to JWT app_metadata.
--    This allows the admin to operate even if the public.users row
--    is somehow missing (chicken-and-egg bootstrap problem).
create or replace function get_my_role()
returns text as $$
  select coalesce(
    (select role from users where id = auth.uid()),
    auth.jwt() -> 'app_metadata' ->> 'role'
  );
$$ language sql security definer stable;

-- 2. Upsert the admin users row.
--    Uses the auth.users table as the source of truth for the admin's UUID.
--    ON CONFLICT (id) keeps any existing row, only setting role=admin if it was wrong.
insert into public.users (id, email, role, client_id)
select id, email, 'admin', null
from auth.users
where email = 'chaserevans2003@gmail.com'
on conflict (id) do update
  set role = 'admin', client_id = null;

-- 3. Run the Session 25 migration if not already applied.
alter table clients add column if not exists enabled_platforms text[] default array['ig'];
alter table clients add column if not exists enabled_tabs text[] default array['dashboard','analytics','angles','pipeline','studio','ads','calendar','goals'];
