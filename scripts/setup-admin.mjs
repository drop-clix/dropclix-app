/**
 * setup-admin.mjs
 *
 * Ensures the admin user is correctly configured in both:
 *   1. auth.users.app_metadata  { role: 'admin' }   ← read by proxy without DB
 *   2. public.users              { id, email, role }  ← read by get_my_role() and RLS
 *
 * Usage:
 *   node scripts/setup-admin.mjs              (dry-run — shows what would change)
 *   node scripts/setup-admin.mjs --run        (applies changes)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (match) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
    }
  } catch { /* env already set */ }
}
loadEnv()

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SECRET   = process.env.SUPABASE_SECRET_KEY
const ADMIN_EMAIL       = 'chaserevans2003@gmail.com'
const DRY_RUN           = !process.argv.includes('--run')

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const adm = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log(DRY_RUN ? '\n[DRY RUN] Pass --run to apply\n' : '\n[APPLYING CHANGES]\n')

// ── 1. Find admin in auth.users ───────────────────────────────────────────────
const { data: { users }, error: listErr } = await adm.auth.admin.listUsers({ perPage: 1000 })
if (listErr) { console.error('Failed to list auth users:', listErr.message); process.exit(1) }

const adminUser = users.find(u => u.email === ADMIN_EMAIL)
if (!adminUser) {
  console.error(`No Supabase auth user found for ${ADMIN_EMAIL}`)
  console.error('Create one in the Supabase dashboard first, then re-run this script.')
  process.exit(1)
}

console.log(`Found auth user: ${adminUser.id} (${adminUser.email})`)

// ── 2. Set app_metadata.role = 'admin' ───────────────────────────────────────
const currentMeta = adminUser.app_metadata ?? {}
if (currentMeta.role === 'admin') {
  console.log('app_metadata.role already = "admin" ✓')
} else {
  console.log(`app_metadata.role is currently "${currentMeta.role ?? '(unset)'}" → will set to "admin"`)
  if (!DRY_RUN) {
    const { error } = await adm.auth.admin.updateUserById(adminUser.id, {
      app_metadata: { ...currentMeta, role: 'admin' },
    })
    if (error) { console.error('Failed to update app_metadata:', error.message); process.exit(1) }
    console.log('app_metadata.role set to "admin" ✓')
  }
}

// ── 3. Upsert public.users row ────────────────────────────────────────────────
const { data: existingRow, error: selectErr } = await adm
  .from('users')
  .select('id, email, role, client_id')
  .eq('id', adminUser.id)
  .single()

if (selectErr && selectErr.code !== 'PGRST116') {
  console.error('Failed to check public.users:', selectErr.message)
  process.exit(1)
}

if (existingRow) {
  console.log(`public.users row exists: role="${existingRow.role}" ✓`)
  if (existingRow.role !== 'admin') {
    console.log(`  → role is "${existingRow.role}", needs to be "admin"`)
    if (!DRY_RUN) {
      const { error } = await adm.from('users').update({ role: 'admin' }).eq('id', adminUser.id)
      if (error) { console.error('Failed to update users.role:', error.message); process.exit(1) }
      console.log('  → updated to "admin" ✓')
    }
  }
} else {
  console.log('public.users row is MISSING → will insert')
  if (!DRY_RUN) {
    const { error } = await adm.from('users').insert({
      id:        adminUser.id,
      email:     ADMIN_EMAIL,
      role:      'admin',
      client_id: null,
    })
    if (error) { console.error('Failed to insert users row:', error.message); process.exit(1) }
    console.log('public.users row inserted ✓')
  }
}

// ── 4. Summary ────────────────────────────────────────────────────────────────
console.log('\n' + (DRY_RUN
  ? '[DRY RUN COMPLETE] Re-run with --run to apply the changes above.'
  : '[DONE] Admin setup complete. get_my_role() will now return "admin" for ' + ADMIN_EMAIL
))
