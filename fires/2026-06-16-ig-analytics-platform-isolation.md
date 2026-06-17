# FIRE: IG Analytics Platform Isolation
**Date:** June 16, 2026
**Severity:** HIGH
**Status:** IN PROGRESS

## What Happened
When IG pill is active on Analytics tab:
- Posts with both YT and IG analytics rows appear twice
- KPI cards show YT metrics instead of IG metrics
- Posts with no post_analytics rows still appear
- Some IG post titles show YouTube captions

## Confirmed Data State
- #ig0037 has yt/live, yt/w24, and ig/live rows
- #ig0033 has 0 post_analytics rows
- Only 1 ig/live row exists total vs 85 yt/live rows
- Data structure is correct — bug is in query/display layer

## Root Cause
TBD — audit in progress

## What Was Done
TBD

## Prevention
TBD

## Resolution
[ ] PENDING
