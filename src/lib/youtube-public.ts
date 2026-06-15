export type YouTubePublicVideo = {
  videoId: string
  title: string | null
  thumbnailUrl: string | null
  stats: {
    views: number
    likes: number
    comments: number
  }
}

function parseCount(value: unknown): number {
  return parseInt(String(value ?? '0'), 10)
}

export async function fetchYouTubePublicVideo(videoId: string): Promise<YouTubePublicVideo | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    console.warn('[yt-public] YOUTUBE_API_KEY not set')
    return null
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${key}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) {
    console.error(`[yt-public] Data API HTTP ${res.status} for ${videoId}:`, await res.text())
    return null
  }

  const json = await res.json()
  const item = json.items?.[0]
  if (!item) {
    console.log(`[yt-public] no video found for ${videoId}`)
    return null
  }

  const stats = item.statistics ?? {}
  const thumbnails = item.snippet?.thumbnails ?? {}
  const thumb =
    thumbnails.maxres?.url ??
    thumbnails.standard?.url ??
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url ??
    null

  return {
    videoId,
    title: item.snippet?.title ?? null,
    thumbnailUrl: thumb,
    stats: {
      views:    parseCount(stats.viewCount),
      likes:    parseCount(stats.likeCount),
      comments: parseCount(stats.commentCount),
    },
  }
}
