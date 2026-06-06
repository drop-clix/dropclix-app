---
name: project-post-id-mapping
description: Full old→new post_id mapping after rename to #igNNNN format; 44 posts total after #ig0044 insertion
metadata:
  type: project
---

All 43 Nick/Sparta Solar post IDs renamed from `#0xxx` to `#igNNNN` sequential format (Session 14d), ordered by `date ASC` (ties broken by old ID ASC). Applied across `posts`, `pipeline_items`, and `calendar_events.notes` JSON. One additional post inserted as `#ig0044` in Session 14f (was missing from original migration). **Total: 44 IG posts.**

**Why:** Human-readable sequential IDs; `#ig` prefix encodes the platform (Instagram).

**How to apply:** When referencing specific posts, use the new IDs. The mapping below is authoritative.

| Old ID | New ID | Date |
|--------|--------|------|
| #0031 | #ig0001 | 2026-02-03 |
| #0007 | #ig0002 | 2026-02-06 |
| #0030 | #ig0003 | 2026-02-09 |
| #0023 | #ig0004 | 2026-02-10 |
| #0024 | #ig0005 | 2026-02-12 |
| #0016 | #ig0006 | 2026-02-13 |
| #0026 | #ig0007 | 2026-02-14 |
| #0035 | #ig0008 | 2026-02-17 |
| #0037 | #ig0009 | 2026-02-19 |
| #0056 | #ig0010 | 2026-02-25 |
| #0049 | #ig0011 | 2026-02-27 |
| #0059 | #ig0012 | 2026-02-28 |
| #0061 | #ig0013 | 2026-03-02 |
| #0064 | #ig0014 | 2026-03-04 |
| #0057 | #ig0015 | 2026-03-05 |
| #0058 | #ig0016 | 2026-03-05 |
| #0066 | #ig0017 | 2026-03-06 |
| #0062 | #ig0018 | 2026-03-07 |
| #0063 | #ig0019 | 2026-03-09 |
| #0065 | #ig0020 | 2026-03-10 |
| #0071 | #ig0021 | 2026-03-10 |
| #0072 | #ig0022 | 2026-03-11 |
| #0077 | #ig0023 | 2026-03-12 |
| #0082 | #ig0024 | 2026-03-13 |
| #0078 | #ig0025 | 2026-03-16 |
| #0074 | #ig0026 | 2026-03-17 |
| #0083 | #ig0027 | 2026-03-18 |
| #0079 | #ig0028 | 2026-03-19 |
| #0085 | #ig0029 | 2026-03-21 |
| #0052 | #ig0030 | 2026-03-23 |
| #0080 | #ig0031 | 2026-03-24 |
| #0073 | #ig0032 | 2026-03-25 |
| #0086 | #ig0033 | 2026-03-27 |
| #0101 | #ig0034 | 2026-03-31 |
| #0116 | #ig0035 | 2026-04-05 |
| #0103 | #ig0036 | 2026-04-14 |
| #0089 | #ig0037 | 2026-04-15 |
| #0107 | #ig0038 | 2026-04-16 |
| #0108 | #ig0039 | 2026-04-20 |
| #0109 | #ig0040 | 2026-04-22 |
| #0110 | #ig0041 | 2026-04-27 |
| #0112 | #ig0042 | 2026-05-05 |
| #0114 | #ig0043 | 2026-05-08 |
| *(new — inserted Session 14f)* | #ig0044 | 2026-02-26 |

## Untouched IDs
- Script Lab items: `SL001`–`SL005`
- `post_analytics.post_id` — UUID FK to `posts.id`, unaffected by text ID changes

## Session 22 pipeline/calendar cleanup

Ran `scripts/normalize-pipeline-post-ids.mjs --run` on 2026-06-06.

- `pipeline_items`: 154 rows scanned; 48 old or inconsistent IDs normalized to `#igNNNN`, `#ytNNNN`, `#ttNNNN`, or `#LFNNNN`.
- `calendar_events.notes`: 111 rows scanned; 9 event note `post_id` values normalized by exact unique pipeline-title match.
- Final audit: 0 pipeline rows needing normalization; 0 calendar notes needing normalization.

Script Lab IDs (`SL001`-`SL005`) remain as script-lab identifiers by design.

## Script
`scripts/rename-post-ids.mjs` — idempotent, dry-run by default. Re-run with `--run` when new posts are added.
`scripts/normalize-pipeline-post-ids.mjs` — audits/fixes pipeline text IDs and matching calendar note `post_id` values.
