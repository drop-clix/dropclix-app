/**
 * Session 9b — Create Supabase auth user for Nick Nascimento
 * Creates nick@spartasolar.com in auth.users, then inserts a matching
 * row in public.users linked to Nick's existing client record.
 *
 * Usage:
 *   node scripts/create-nick-user.mjs           # dry run
 *   node scripts/create-nick-user.mjs --run     # actually create
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = !process.argv.includes('--run')

// ── Load env ─────────────────────────────────────────────────────────────────
const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY
)

const NICK_CLIENT_ID  = '913f1794-1506-4449-b56c-b683809cefc3'
const NICK_EMAIL      = 'nick@spartasolar.com'
const TEMP_PASSWORD   = 'DropClix2026!'

async function main() {
  console.log(DRY_RUN ? '⚠️  DRY RUN — pass --run to execute\n' : '🚀 Running...\n')

  // 1. Check if auth user already exists
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) { console.error('listUsers error:', listErr.message); process.exit(1) }

  const existing = listData.users.find(u => u.email === NICK_EMAIL)
  if (existing) {
    console.log(`✓ Auth user already exists: ${existing.id}`)
    await ensureUsersRow(existing.id)
    return
  }

  // 2. Create auth user
  console.log(`Creating auth user for ${NICK_EMAIL}...`)
  if (DRY_RUN) {
    console.log('  [dry run] would call supabase.auth.admin.createUser()')
    console.log(`  email: ${NICK_EMAIL}`)
    console.log(`  password: ${TEMP_PASSWORD}`)
    console.log(`  role: authenticated`)
    console.log('  email_confirm: true')
    return
  }

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: NICK_EMAIL,
    password: TEMP_PASSWORD,
    email_confirm: true,
  })
  if (createErr) { console.error('createUser error:', createErr.message); process.exit(1) }

  const authId = created.user.id
  console.log(`✓ Created auth user: ${authId}`)

  await ensureUsersRow(authId)
}

async function ensureUsersRow(authId) {
  // Check if row in public.users already exists
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('id', authId)
    .maybeSingle()

  if (existing) {
    console.log(`✓ public.users row already exists for ${authId}`)
    return
  }

  if (DRY_RUN) {
    console.log('  [dry run] would insert into public.users:')
    console.log(`  id: ${authId}`)
    console.log(`  email: ${NICK_EMAIL}`)
    console.log(`  role: client`)
    console.log(`  client_id: ${NICK_CLIENT_ID}`)
    return
  }

  const { error: insertErr } = await supabase.from('users').insert({
    id: authId,
    email: NICK_EMAIL,
    role: 'client',
    client_id: NICK_CLIENT_ID,
  })
  if (insertErr) { console.error('insert users error:', insertErr.message); process.exit(1) }

  console.log(`✓ Inserted public.users row`)
  console.log('\n✅ Done! Nick can now log in:')
  console.log(`   Email:    ${NICK_EMAIL}`)
  console.log(`   Password: ${TEMP_PASSWORD}`)
  console.log('   (Ask Nick to change his password after first login)')
}

main()
