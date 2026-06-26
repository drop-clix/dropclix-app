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

## Follow-up Build — Client Settings Connections
After the signed-state/session authorization fix was in place, a
client-facing `/settings` page was added as the first self-service account
surface. Clients can now connect or reconnect Instagram, TikTok, and YouTube
from their own portal session without a `client_id` query string.

This keeps the S66 protection intact:
- Admin-origin OAuth still redirects back to `/admin`.
- Client-origin OAuth now redirects back to `/settings`.
- The signed OAuth state includes the origin and the authorized client ID.
- The Settings page fetches only safe connection metadata and never exposes
  `access_token` or `refresh_token` to browser-visible props.

Business impact: this unblocks Nick's pending YouTube reconnection because he
can replace the wrong connected channel from his own client portal session.

## Follow-up Discovery — Settings Reconnect Landing
After the Settings page shipped, Reconnect from `/settings` did not complete
cleanly when tested from an admin-impersonated client portal session.

Root cause: `/settings` correctly omitted `client_id` from the OAuth link, but
`resolveOAuthClientForInitiation()` only supported two cases: admin with an
explicit `client_id`, or client with `users.client_id`. An admin viewing the
client portal through the `dropclix_impersonate_client_id` cookie is still an
admin profile, so the shared helper returned `client_id_required` before the
provider OAuth flow could begin.

Fix: The shared OAuth initiation helper now falls back to the existing
impersonation cookie for admin sessions when no explicit `client_id` is
present, and signs that flow as `origin='client'` so callbacks return to
`/settings`. Admin panel links with explicit `client_id` still return to
`/admin`, and real client sessions remain locked to their own `users.client_id`.

Related UI fix: Settings platform cards now use actual Instagram, TikTok, and
YouTube SVG brand marks instead of text initials.
