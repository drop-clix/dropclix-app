import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type PendingOAuthPlatform = 'meta_ads' | 'instagram'
export type PendingOAuthOrigin = 'admin' | 'client'

export type PendingOAuthAccount = {
  id: string
  name: string
  business?: {
    id?: string
    name?: string
  } | null
}

type PendingSelectionPayload = {
  v: 1
  id: string
  platform: PendingOAuthPlatform
  clientId: string
  origin: PendingOAuthOrigin
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: string | null
  accounts: PendingOAuthAccount[]
  expiresAt: string
}

export type PendingSelectionRow = {
  id: string
  platform: PendingOAuthPlatform
  client_id: string
  origin: PendingOAuthOrigin
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  accounts: PendingOAuthAccount[]
  expires_at: string
}

const PENDING_MAX_AGE_MS = 15 * 60 * 1000
const IMPERSONATE_COOKIE = 'dropclix_impersonate_client_id'
const PENDING_COOKIE = 'dropclix_oauth_pending_selection'

function getSelectionSecret() {
  const secret =
    process.env.OAUTH_STATE_SECRET ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.INSTAGRAM_APP_SECRET ??
    process.env.YOUTUBE_CLIENT_SECRET

  if (!secret) throw new Error('Missing OAuth pending-selection signing secret')
  return secret
}

function encryptionKey() {
  return createHash('sha256').update(getSelectionSecret()).digest()
}

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64UrlBuffer(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64')
}

function fromBase64Url(input: string) {
  return fromBase64UrlBuffer(input).toString('utf8')
}

function sign(payload: string) {
  return toBase64Url(createHmac('sha256', getSelectionSecret()).update(payload).digest())
}

function encryptPayload(payload: PendingSelectionPayload) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    toBase64Url(iv),
    toBase64Url(tag),
    toBase64Url(encrypted),
  ].join('.')
}

function decryptPayload(value: string): PendingSelectionPayload | null {
  const [ivText, tagText, encryptedText] = value.split('.')
  if (!ivText || !tagText || !encryptedText) return null

  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), fromBase64UrlBuffer(ivText))
    decipher.setAuthTag(fromBase64UrlBuffer(tagText))
    const decrypted = Buffer.concat([
      decipher.update(fromBase64UrlBuffer(encryptedText)),
      decipher.final(),
    ]).toString('utf8')
    return JSON.parse(decrypted) as PendingSelectionPayload
  } catch {
    return null
  }
}

function createSelectionToken(id: string, expiresAt: string) {
  const encoded = toBase64Url(JSON.stringify({ v: 1, id, exp: expiresAt }))
  return `${encoded}.${sign(encoded)}`
}

function verifySelectionToken(token: string | null): { ok: true; id: string } | { ok: false; error: string } {
  if (!token) return { ok: false, error: 'missing_selection' }
  const [encoded, receivedSignature] = token.split('.')
  if (!encoded || !receivedSignature) return { ok: false, error: 'malformed_selection' }

  const expectedSignature = sign(encoded)
  const expectedBuffer = Buffer.from(expectedSignature)
  const receivedBuffer = Buffer.from(receivedSignature)
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return { ok: false, error: 'invalid_selection_signature' }
  }

  let payload: { v?: number; id?: string; exp?: string }
  try {
    payload = JSON.parse(fromBase64Url(encoded)) as { v?: number; id?: string; exp?: string }
  } catch {
    return { ok: false, error: 'invalid_selection_payload' }
  }

  if (payload.v !== 1 || !payload.id || !payload.exp) {
    return { ok: false, error: 'incomplete_selection' }
  }

  const expiresAt = new Date(payload.exp).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { ok: false, error: 'selection_expired' }
  }

  return { ok: true, id: payload.id }
}

async function clearPendingSelectionCookie() {
  const cookieStore = await cookies()
  cookieStore.set(PENDING_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

async function authorizePendingSelection(row: PendingSelectionRow) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'unauthenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { ok: false as const, error: 'missing_profile' }

  if (profile.role === 'admin') {
    if (row.origin === 'admin') return { ok: true as const }

    const cookieStore = await cookies()
    const impersonatedClientId = cookieStore.get(IMPERSONATE_COOKIE)?.value
    if (impersonatedClientId === row.client_id) return { ok: true as const }
    return { ok: false as const, error: 'client_mismatch' }
  }

  if (row.origin !== 'client') return { ok: false as const, error: 'origin_mismatch' }
  if ((profile.client_id as string | null) !== row.client_id) {
    return { ok: false as const, error: 'client_mismatch' }
  }

  return { ok: true as const }
}

function payloadToRow(payload: PendingSelectionPayload): PendingSelectionRow {
  return {
    id: payload.id,
    platform: payload.platform,
    client_id: payload.clientId,
    origin: payload.origin,
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
    token_expires_at: payload.tokenExpiresAt,
    accounts: payload.accounts,
    expires_at: payload.expiresAt,
  }
}

export async function createPendingOAuthSelection({
  platform,
  clientId,
  origin,
  accessToken,
  refreshToken = null,
  tokenExpiresAt,
  accounts,
}: {
  platform: PendingOAuthPlatform
  clientId: string
  origin: PendingOAuthOrigin
  accessToken: string
  refreshToken?: string | null
  tokenExpiresAt: string | null
  accounts: PendingOAuthAccount[]
}) {
  const id = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + PENDING_MAX_AGE_MS).toISOString()
  const payload: PendingSelectionPayload = {
    v: 1,
    id,
    platform,
    clientId,
    origin,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    accounts,
    expiresAt,
  }

  const cookieStore = await cookies()
  cookieStore.set(PENDING_COOKIE, encryptPayload(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PENDING_MAX_AGE_MS / 1000,
  })

  return {
    selection: createSelectionToken(id, expiresAt),
    expiresAt,
  }
}

export async function getPendingOAuthSelection(selection: string | null) {
  const verified = verifySelectionToken(selection)
  if (!verified.ok) return verified

  const cookieStore = await cookies()
  const encryptedPayload = cookieStore.get(PENDING_COOKIE)?.value
  if (!encryptedPayload) return { ok: false as const, error: 'selection_not_found' }

  const payload = decryptPayload(encryptedPayload)
  if (!payload || payload.v !== 1 || payload.id !== verified.id) {
    return { ok: false as const, error: 'invalid_selection_payload' }
  }

  const expiresAt = new Date(payload.expiresAt).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await clearPendingSelectionCookie()
    return { ok: false as const, error: 'selection_expired' }
  }

  const row = payloadToRow(payload)
  const auth = await authorizePendingSelection(row)
  if (!auth.ok) return auth

  return { ok: true as const, row }
}

export async function completePendingOAuthSelection(selection: string, accountId: string) {
  const pending = await getPendingOAuthSelection(selection)
  if (!pending.ok) return { error: pending.error }

  const { row } = pending
  const account = row.accounts.find(item => item.id === accountId)
  if (!account) return { error: 'account_not_found' }

  if (row.platform !== 'meta_ads') {
    return { error: 'unsupported_platform' }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error: dbErr } = await admin
    .from('platform_connections')
    .upsert({
      client_id:        row.client_id,
      platform:         'meta_ads',
      access_token:     row.access_token,
      refresh_token:    row.refresh_token,
      token_expires_at: row.token_expires_at,
      channel_id:       account.id,
      channel_name:     account.name,
      subscriber_count: null,
      last_synced_at:   null,
      created_at:       now,
      updated_at:       now,
    }, { onConflict: 'client_id,platform' })

  if (dbErr) {
    console.error('[oauth-selection] failed to save selected account:', dbErr.message)
    return { error: 'db_failed' }
  }

  await clearPendingSelectionCookie()
  revalidatePath('/admin')
  revalidatePath('/settings')

  return { ok: true as const, origin: row.origin, platform: row.platform }
}
