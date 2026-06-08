-- Session 24: Client onboarding system
-- Run in Supabase SQL Editor

-- 1. Add monthly_retainer to clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS monthly_retainer numeric;

-- 2. Allow clients to UPDATE target values on their own goals
--    (previously clients had SELECT only; admin updated via Supabase dashboard)
CREATE POLICY "clients_update_own_goals"
ON goals FOR UPDATE
TO authenticated
USING (
  client_id = (SELECT client_id FROM users WHERE id = auth.uid())
)
WITH CHECK (
  client_id = (SELECT client_id FROM users WHERE id = auth.uid())
);
