# FIRE: Stored Decision used the wrong formula, window and platform
**Date:** November 17, 2026
**Severity:** HIGH
**Status:** RESOLVED, except 24 Nick Nascimento flips held for owner review.

## What Happened
`posts.decision`, the text shown on Analytics, Dashboard, Report Card, Angles, Goals and the AI routes, was wrong or missing on most posts:
- 513 posts rows had NULL Decision despite having data.
- Stored values came from locked windows, mostly `eom`, never from `live`.
- Every path used (likes + comments + shares + saves) / views, including YouTube, whose locked formula uses subscribers gained.
- No sync and no cron job ever wrote `posts.decision`, so it never tracked live data. After the S77 YouTube fix, 11 Day 1 videos still said Iterate while their lifetime ER was Kill.

## Root Cause
- Decision was computed in three places (manual edit, Studio, admin CSV preview), each with the saves formula and the eom → w7 → w3 → w24 order.
- The audit found no live-first Decision change had ever shipped. S42 only changed the Analytics view's default window.

## What Was Done
- **Stage 1:** `decisionFromWindows()` in `src/lib/decision.ts`. It applies the platform's locked ER formula to the live window, falling back to eom → w7 → w3 → w24 only with no live row. Platform comes from the posts row's own ID prefix. The manual edit, Studio create/update and admin Clients table now use it, and the saves-for-everything formula is gone from those paths.
- **Stage 2:** `recomputeStoredDecision()` in `src/lib/decision-store.ts` runs after each successful live upsert in the IG, TikTok and YouTube syncs, and in `upsertPolledStats()`, which covers cron polling and snapshots. It never throws.
- **Stage 3:** `scripts/recompute-decisions.ts`. The dry run listed 548 changes across all clients. The owner approved 524 and held Nick Nascimento's 24 flips.
- **Hold:** `DECISION_REVIEW_HOLD` in `decision-store.ts` keeps those 24 rows unchanged. Without it, the cron polls Nick's YouTube live rows and would have applied 5 held flips before the review.
- No ER% formula, threshold, locked window, schema, token refresh or OAuth change.

## Recompute Written (2026-11-17, ~19:00 UTC)
| Platform | Flips written | NULL to value written | Held |
|---|---|---|---|
| Instagram | 0 | 63 | 19 Nick Kill→Iterate |
| TikTok | 0 | 100 | 0 |
| YouTube | 11 Day 1 Iterate→Kill | 350 | 5 Nick (#LF0005/07/13/14 Double Down→Iterate, #LF0006 Iterate→Kill) |

- Written 524/524. A full before/after snapshot of all 710 posts rows shows exactly those 524 changed, to the expected values. No other row changed, and no held row changed.
- Day 1 YouTube flips: #yt0014, 0016, 0029, 0035, 0041, 0045, 0050, 0058, 0061, 0075, 0078. #yt0115 went NULL → Kill.

## Nick Nascimento Provenance (for the held review)
- **IG live rows (50):** written by the May 31 to June 2 imports, at client onboarding. They have never been polled, and no Instagram connection exists for Nick. Every one equals its `eom` row field for field. The flips come from the formula, not the window: the old values were Kill under the eom rule, and the same numbers give 4.0–6.8% today. The cause of the old Kill values is not recorded. The seed file's IDs (`#0031`) don't match the posts IDs.
- **YT live rows (354):** synced. Each has `last_polled_at` set and 353 were polled on 2026-11-17. None equals `eom`. 202 differ from it and 151 have no `eom` row. For the 5 held videos, `eom` is all zeros dated 2026-06-06, so the old Double Down values did not come from `eom`.

## Verification
- `npx tsc --noEmit` clean. Lint error counts unchanged in all touched files, and the new files have 0 errors.
- 19 pure helper tests pass, covering prefixes, each formula, NULL saves, live-over-locked, live 0 views, fallback order and exact thresholds.
- Deployed `f5d20c5` to production. Day 1 IG sync: 112 synced, 0 failed. TikTok: 100 synced, 0 errors. Neither changed a Decision, because all were already current. The 687 locked rows were identical before and after.
- Hook proof: a Day 1 Decision was cleared to NULL, then `syncSingleIGVideo` (#ig0061) and `syncSingleTTVideo` (#tt0035) each rewrote Iterate.
- Same-value manual edits on live likes with the real `updateAnalyticsMetric`, session stubbed, Decision cleared first: #ig0061 Iterate, #tt0035 Iterate and #yt0014 Kill were each returned and stored, matching the helper. Held #LF0006 kept Iterate even though the helper gives Kill.
- After everything, a dry run across all clients shows 686 rows matching the helper. The 24 mismatches are exactly the held rows.

## Not Verified
- **The YouTube sync was not run after deploy.** The Day 1 token expired at 18:45 UTC. Refreshing it needs the Google client secret, which the session did not read, and the deployed route needs an admin login. The YouTube hook calls the same `recomputeStoredDecision()` proven by the IG and TikTok hooks and by the YouTube manual edit. Run a Day 1 YouTube sync from the admin panel to confirm.

## Prevention
- One formula and one window rule live in `src/lib/decision.ts`. Any new writer of `posts.decision` must call it.
- Release the review hold by editing `DECISION_REVIEW_HOLD`, then run `scripts/recompute-decisions.ts --run`.
