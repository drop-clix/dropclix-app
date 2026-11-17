# AUDIT: Studio overwrite deletes a post's live analytics row
**Date:** November 17, 2026
**Severity:** MEDIUM
**Status:** OPEN, audit only. Not changed.

## Finding
- `overwritePostCore()` in `src/app/(dashboard)/studio/actions.ts` runs `post_analytics.delete()` for the whole posts row, on every platform and every window including `live`. It then re-inserts only the CSV's locked windows (w24, w3, w7, eom) on `data.platform[0]`.
- Overwriting an already-synced post through the Studio importer therefore removes its synced live row, and any other platform's rows on that posts row, until the next sync.

## Effect
- Between the overwrite and the next sync, Analytics shows no live data for that post. Decision is set from the CSV's locked windows, not from live.
- Other platforms' rows on a bundled posts row are lost until their own sync re-creates them.

## Options (not done)
- Delete only the locked windows being re-imported, scoped to the imported platform, and keep `live`.
