-- Session 26: Clean up clients table RLS policies
--
-- Admin operations always use createAdminClient() (service role key).
-- The service role bypasses RLS entirely — no admin-facing policy is needed.
-- Only the client-facing read policy is required.
--
-- Run this in Supabase SQL Editor → SQL Editor.

-- Drop existing policies on clients
drop policy if exists "admin: full access to clients" on clients;
drop policy if exists "client: read own client record" on clients;

-- Recreate only the client read policy
-- (Service role bypasses RLS automatically — no admin policy needed)
create policy "client: read own record"
  on clients for select
  using (id = get_my_client_id());
