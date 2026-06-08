/**
 * Seed blank-slate data for a new client.
 * Run AFTER the client row exists in the `clients` table.
 *
 * Usage:
 *   node scripts/seed-new-client.mjs <client_id>        # dry-run
 *   node scripts/seed-new-client.mjs <client_id> --run  # apply
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN   = !process.argv.includes('--run')
const clientId  = process.argv[2]

if (!clientId || clientId.startsWith('--')) {
  console.error('Usage: node scripts/seed-new-client.mjs <client_id> [--run]')
  process.exit(1)
}

// Load env
const envRaw = readFileSync(join(__dirname, '../.env.local'), 'utf-8')
const env = {}
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
)

// ── Default goals (must match GoalsClient.tsx metric names exactly) ───────────

const DEFAULT_GOALS = [
  { metric: 'Followers Gained', target: 500,    period: 'monthly' },
  { metric: 'Posts',            target: 20,     period: 'monthly' },
  { metric: 'Total Views',      target: 200000, period: 'monthly' },
  { metric: 'Elite Videos',     target: 2,      period: 'monthly' },
  { metric: 'Avg ER%',          target: 8,      period: 'monthly' },
  { metric: 'Posts',            target: 4,      period: 'weekly'  },
  { metric: 'Total Views',      target: 50000,  period: 'weekly'  },
  { metric: 'Avg ER%',          target: 7.5,    period: 'weekly'  },
  { metric: 'Followers Gained', target: 125,    period: 'weekly'  },
]

async function seed() {
  console.log(`\n${DRY_RUN ? '📋 DRY RUN' : '🚀 SEEDING'} for client: ${clientId}\n`)

  // Verify client exists
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, name, slug')
    .eq('id', clientId)
    .single()

  if (clientErr || !client) {
    console.error(`✗ Client not found: ${clientErr?.message ?? 'no data'}`)
    process.exit(1)
  }
  console.log(`✓ Client found: ${client.name} (${client.slug})`)

  // Check for existing goals
  const { data: existingGoals } = await supabase
    .from('goals')
    .select('id')
    .eq('client_id', clientId)

  if (existingGoals && existingGoals.length > 0) {
    console.log(`  ⚠  Goals already exist (${existingGoals.length} rows) — skipping goals seed`)
  } else {
    const goalsRows = DEFAULT_GOALS.map(g => ({ ...g, client_id: clientId }))
    console.log(`  → Insert ${goalsRows.length} default goals`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('goals').insert(goalsRows)
      if (error) console.error(`  ✗ Goals insert error: ${error.message}`)
      else       console.log(`  ✓ ${goalsRows.length} goals seeded`)
    }
  }

  // Check for existing pipeline items
  const { data: existingPipe } = await supabase
    .from('pipeline_items')
    .select('id')
    .eq('client_id', clientId)
    .eq('post_id', '#new0001')
    .maybeSingle()

  if (existingPipe) {
    console.log(`  ⚠  Welcome pipeline item already exists — skipping`)
  } else {
    console.log(`  → Insert welcome pipeline item "Your first video"`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('pipeline_items').insert({
        client_id:      clientId,
        post_id:        '#new0001',
        title:          'Your first video',
        status:         'PLANNED',
        priority:       1,
        platform:       ['ig'],
        pillar:         null,
        week:           null,
        scheduled_date: null,
      })
      if (error) console.error(`  ✗ Pipeline insert error: ${error.message}`)
      else       console.log(`  ✓ Welcome pipeline item created`)
    }
  }

  if (DRY_RUN) {
    console.log('\n  Pass --run to apply these changes.\n')
  } else {
    console.log('\n✅ Seed complete.\n')
  }
}

seed().catch(e => { console.error(e); process.exit(1) })
