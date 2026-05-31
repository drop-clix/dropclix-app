'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_STATUSES = new Set([
  'SCRIPTED', 'PLANNED', 'FILMING', 'EDITING',
  'REVIEWING', 'SCHEDULED', 'POSTED', 'CANCELLED',
])

export async function updatePipelineStatus(
  itemId: string,
  newStatus: string,
): Promise<{ error?: string }> {
  if (!VALID_STATUSES.has(newStatus)) return { error: 'Invalid status' }

  // Verify caller is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  // Use admin client to bypass RLS — ownership is enforced below
  const admin = createAdminClient()

  const filter: Record<string, string> = { id: itemId }
  // Non-admins can only touch their own client's items
  if (profile.role !== 'admin' && profile.client_id) {
    filter.client_id = profile.client_id
  }

  const { error } = await admin
    .from('pipeline_items')
    .update({ status: newStatus })
    .match(filter)

  if (error) return { error: error.message }

  revalidatePath('/pipeline')
  return {}
}
