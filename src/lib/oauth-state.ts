import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export type OAuthPlatform = 'instagram' | 'tiktok' | 'youtube'

type OAuthSessionContext = {
  role: 'admin' | 'client'
  clientId: string
}

type OAuthStatePayload = {
  v: 1
  platform: OAuthPlatform
  clientId: string
  nonce: string
  iat: number
}

const STATE_MAX_AGE_MS = 30 * 60 * 1000

function getStateSecret() {
  const secret =
    process.env.OAUTH_STATE_SECRET ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.INSTAGRAM_APP_SECRET ??
    process.env.YOUTUBE_CLIENT_SECRET

  if (!secret) throw new Error('Missing OAuth state signing secret')
  return secret
}

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function sign(payload: string) {
  return toBase64Url(createHmac('sha256', getStateSecret()).update(payload).digest())
}

function nonceCookieName(platform: OAuthPlatform) {
  return `dropclix_oauth_nonce_${platform}`
}

export async function resolveOAuthClientForInitiation(
  explicitClientId: string | null,
): Promise<{ ok: true; context: OAuthSessionContext } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const { data: profile } = await supabase
    .from('users')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { ok: false, error: 'missing_profile' }

  if (profile.role === 'admin') {
    if (!explicitClientId) return { ok: false, error: 'client_id_required' }
    return { ok: true, context: { role: 'admin', clientId: explicitClientId } }
  }

  const sessionClientId = profile.client_id as string | null
  if (!sessionClientId) return { ok: false, error: 'missing_client_id' }
  return { ok: true, context: { role: 'client', clientId: sessionClientId } }
}

export function createOAuthState(platform: OAuthPlatform, clientId: string) {
  const nonce = randomBytes(24).toString('hex')
  const payload: OAuthStatePayload = {
    v: 1,
    platform,
    clientId,
    nonce,
    iat: Date.now(),
  }
  const encoded = toBase64Url(JSON.stringify(payload))
  return {
    state: `${encoded}.${sign(encoded)}`,
    nonce,
  }
}

export function setOAuthNonceCookie(response: NextResponse, platform: OAuthPlatform, nonce: string) {
  response.cookies.set(nonceCookieName(platform), nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_MAX_AGE_MS / 1000,
  })
}

export function clearOAuthNonceCookie(response: NextResponse, platform: OAuthPlatform) {
  response.cookies.set(nonceCookieName(platform), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

async function parseAndVerifyState(
  platform: OAuthPlatform,
  state: string | null,
): Promise<{ ok: true; payload: OAuthStatePayload } | { ok: false; error: string }> {
  if (!state) return { ok: false, error: 'missing_state' }

  const [encoded, receivedSignature] = state.split('.')
  if (!encoded || !receivedSignature) return { ok: false, error: 'malformed_state' }

  const expectedSignature = sign(encoded)
  const expectedBuffer = Buffer.from(expectedSignature)
  const receivedBuffer = Buffer.from(receivedSignature)
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return { ok: false, error: 'invalid_signature' }
  }

  let payload: OAuthStatePayload
  try {
    payload = JSON.parse(fromBase64Url(encoded)) as OAuthStatePayload
  } catch {
    return { ok: false, error: 'invalid_payload' }
  }

  if (payload.v !== 1) return { ok: false, error: 'invalid_version' }
  if (payload.platform !== platform) return { ok: false, error: 'platform_mismatch' }
  if (!payload.clientId || !payload.nonce) return { ok: false, error: 'incomplete_state' }
  if (!Number.isFinite(payload.iat) || Date.now() - payload.iat > STATE_MAX_AGE_MS) {
    return { ok: false, error: 'state_expired' }
  }

  const cookieStore = await cookies()
  const storedNonce = cookieStore.get(nonceCookieName(platform))?.value
  if (!storedNonce || storedNonce !== payload.nonce) {
    return { ok: false, error: 'nonce_mismatch' }
  }

  return { ok: true, payload }
}

export async function validateOAuthCallbackState(
  platform: OAuthPlatform,
  state: string | null,
): Promise<{ ok: true; context: OAuthSessionContext } | { ok: false; error: string }> {
  const verified = await parseAndVerifyState(platform, state)
  if (!verified.ok) return verified

  const session = await resolveOAuthClientForInitiation(verified.payload.clientId)
  if (!session.ok) return session

  if (session.context.role !== 'admin' && session.context.clientId !== verified.payload.clientId) {
    return { ok: false, error: 'client_mismatch' }
  }

  return {
    ok: true,
    context: {
      role: session.context.role,
      clientId: verified.payload.clientId,
    },
  }
}
