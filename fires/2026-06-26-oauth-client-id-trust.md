# FIRE: OAuth Client ID Trust Vulnerability
**Date:** June 26, 2026
**Severity:** HIGH
**Status:** RESOLVED

## What Happened
During the client-facing platform connection audit, Instagram, TikTok, and
YouTube OAuth routes were found to trust `client_id` directly from the URL.
The initiation routes copied `?client_id=` into OAuth `state`, and the callback
routes used that state value with `createAdminClient()` to upsert
`platform_connections`.

Because `/api/` routes bypass proxy auth by design, the OAuth routes needed to
enforce their own session authorization but did not.

## Root Cause
The original routes were built for admin-only UI links and assumed the admin
panel was the only caller. That made the URL query string the effective
authorization source. A logged-in user could potentially start an OAuth flow
with another client's UUID and attach a platform token to the wrong client row.

## What Was Done
- Added shared signed OAuth state handling in `src/lib/oauth-state.ts`.
- Initiation routes for Instagram, TikTok, and YouTube now require a session.
- Admin sessions may still pass an explicit `client_id`, preserving the admin
  connect/reconnect flow.
- Client sessions ignore any supplied `client_id` and use only their own
  `users.client_id`.
- OAuth state now contains platform, resolved client ID, timestamp, and nonce,
  signed server-side and paired with an httpOnly nonce cookie.
- Callback routes for Instagram, TikTok, and YouTube now require a session,
  verify signed state, verify nonce, re-resolve the current session, and reject
  mismatched client authorization before any `platform_connections` write.

## Prevention
- Never trust `client_id` from a query string for writes made through
  `createAdminClient()`.
- Any future OAuth route under `/api/auth/*` must use the shared state/session
  authorization helper or an equivalent signed-state pattern.
- RLS is not enough for these callbacks because `createAdminClient()` bypasses
  RLS by design.

## Resolution
[x] RESOLVED
