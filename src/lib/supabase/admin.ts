import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS.
// ONLY import this in server actions and server components, never in client code.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
