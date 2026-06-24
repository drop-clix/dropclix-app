# FIRE: Admin Token Expiry UI Stale After Sync
**Date:** June 24, 2026
**Severity:** MEDIUM
**Status:** RESOLVED

## What Happened
After clicking Sync Now in admin, backend refresh logic could successfully update `platform_connections.token_expires_at`, but the admin UI kept showing the old expiry warning until the page was refreshed.

## Confirmed Scope
- TikTok and YouTube can refresh tokens during sync, so stale `token_expires_at` created false expired/soon-expiring warning states.
- Instagram and Meta Ads do not refresh tokens during Sync Now, but all four admin sections had the same stale client-side `last_synced_at` display pattern.
- The issue was display state only. Sync result text and backend token refresh/update behavior were separate.

## Root Cause
Admin sections fetch connection rows once server-side in `admin/page.tsx`. Sync Now posts to API routes from client components, but the components only updated small local values like subscriber count or sync result text. They did not update local `tokenExpiresAt` or `lastSyncedAt` from the sync response.

## What Was Done
- `/api/admin/sync-youtube`, `/api/admin/sync-tiktok`, `/api/admin/sync-instagram`, and `/api/admin/sync-meta-ads` now return the persisted `lastSyncedAt` and `tokenExpiresAt` from `platform_connections` after sync.
- `AdminYouTubeSection`, `AdminTikTokSection`, `AdminInstagramSection`, and `AdminMetaAdsSection` now store those response values locally after Sync Now succeeds.
- Existing labels, reconnect behavior, token refresh logic, formulas, and platform sync internals were left unchanged.

## Prevention
Any future admin Sync Now route that mutates `platform_connections` should return the updated fields the UI displays, and the matching admin section should update local state immediately instead of waiting for a page reload.

## Resolution
[x] RESOLVED
