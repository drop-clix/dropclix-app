# FIRE: IG Posts Disappeared After TikTok Sync Build
**Date:** June 18, 2026
**Severity:** HIGH
**Status:** IN PROGRESS

## What Happened
After building TikTok sync (commit 791f3f8), IG Analytics
tab dropped from 4 posts to 2. #ig0031 and #ig0033
disappeared from the IG pill view.

## Confirmed Data State
- #ig0031 and #ig0033 have both ig/live AND yt/live rows
- posts rows exist with platform=['ig'] for both
- No null platform rows confirmed

## Suspected Cause
Client-side dedup logic introduced earlier today may be
collapsing #ig0031/#ig0033 with their YT counterparts
(#yt0081/#yt0083) since they share the same pipeline item.

## Root Cause
TBD — audit in progress

## Resolution
[ ] PENDING
