# FIRE: Facebook Token Refresh Gap
**Date:** June 24, 2026
**Severity:** MEDIUM
**Status:** RESOLVED

## What Happened
Instagram and Meta Ads both used 60-day Facebook long-lived tokens but had no refresh-before-sync path. Instagram was especially risky because an expired token could make `/media` return an error, collapse to an empty media array, and appear as a misleading successful sync with 0 posts synced.

## Confirmed Scope
- Instagram and Meta Ads share the same Facebook OAuth mechanics:
  - `grant_type=authorization_code` for the first token exchange
  - `grant_type=fb_exchange_token` for the long-lived token exchange
  - `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`
  - `platform_connections.access_token` and `platform_connections.token_expires_at`
- TikTok and YouTube already had auto-refresh and were not changed.

## Root Cause
The original Instagram and Meta Ads builds exchanged for long-lived tokens during OAuth connect/reconnect, stored `token_expires_at`, and displayed expiry in admin, but their sync paths never checked expiry or refreshed the token before calling Graph APIs.

## What Was Done
- Added shared `refreshFacebookToken(clientId, platform)` in `src/lib/facebook-auth.ts`.
- The helper returns the current token unchanged when expiry is more than 5 minutes away.
- If expired or within the safety window, it refreshes via Graph `fb_exchange_token`, updates only the matching `client_id + platform` row, and returns the new token.
- Instagram full sync and single-video sync now call the helper before Graph API calls.
- Meta Ads sync now calls the helper before campaign/insights calls.
- If refresh fails, both admin sync routes return `401` with `Token expired, please reconnect`.

## Verification
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- Live Day 1 token metadata confirmed both tokens are outside the refresh window:
  - Instagram expires `2026-08-17T18:16:57.232Z`
  - Meta Ads expires `2026-08-18T19:52:33.628Z`

## Prevention
All platform sync paths now have refresh coverage:
- YouTube: `youtube-auth.ts`
- TikTok: `tiktok-sync.ts`
- Instagram: `facebook-auth.ts`
- Meta Ads: `facebook-auth.ts`

Future OAuth integrations must include refresh-before-sync behavior before being considered production-ready.

## Resolution
[x] RESOLVED
