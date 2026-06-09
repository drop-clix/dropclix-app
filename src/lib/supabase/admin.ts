import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS entirely.
// ONLY import in server actions / server components. Never in 'use client' files.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}
