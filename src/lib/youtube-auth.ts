import { createAdminClient } from '@/lib/supabase/admin'

export type YouTubeConnection = {
  id: string
  client_id: string
  access_token: string
  refresh_token: string
  token_expires_at: string
  channel_id: string | null
  channel_name: string | null
  subscriber_count: number | null
  last_synced_at: string | null
  connected_at: string
}

export async function getYouTubeConnection(clientId: string): Promise<YouTubeConnection | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('platform_connections')
    .select('*')
    .eq('client_id', clientId)
    .eq('platform', 'youtube')
    .single()

  if (error || !data) return null

  // Refresh token if expiring within 5 minutes
  const expiry = new Date((data as YouTubeConnection).token_expires_at)
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000)
  if (expiry < fiveMinFromNow) {
    return refreshYouTubeToken(clientId, (data as YouTubeConnection).refresh_token)
  }

  return data as YouTubeConnection
}

export async function refreshYouTubeToken(
  clientId: string,
  refreshToken: string,
): Promise<YouTubeConnection | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    console.error('YouTube token refresh failed:', await res.text())
    return null
  }

  const json = await res.json()
  const expiry = new Date(Date.now() + json.expires_in * 1000).toISOString()

  const admin = createAdminClient()
  const { data } = await admin
    .from('platform_connections')
    .update({
      access_token: json.access_token,
      token_expires_at: expiry,
      updated_at: new Date().toISOString(),
    })
    .eq('client_id', clientId)
    .eq('platform', 'youtube')
    .select('*')
    .single()

  return data as YouTubeConnection | null
}

// Fetch channel info (name + subscribers) using the stored access token
export async function fetchChannelInfo(accessToken: string): Promise<{
  channelId: string
  channelName: string
  subscriberCount: number
} | null> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) return null

  const json = await res.json()
  const item = json.items?.[0]
  if (!item) return null

  return {
    channelId: item.id,
    channelName: item.snippet?.title ?? '',
    subscriberCount: parseInt(item.statistics?.subscriberCount ?? '0', 10),
  }
}
