# FIRE: Pipeline Titles Overwritten by YouTube API
**Date:** June 15, 2026
**Severity:** HIGH
**Status:** RESOLVED

## What Happened
pipeline_items.title was being overwritten with raw YouTube
captions (full hashtag strings) on every cron poll, every YT
link save, and every ensureYTPostsRow call. All pipeline titles
for linked YT videos showed YouTube captions instead of the
clean titles entered by the admin.

## Root Cause
Three separate code paths all wrote { title: video.title } to
pipeline_items on every execution:
1. video-polling.ts updateVideoMetadata()
2. edit-actions.ts linkYouTubeVideo()
3. edit-actions.ts ensureYTPostsRow()

analytics/page.tsx also never fetched pipeline_items.title —
it only had posts.title (the YT caption) to display.

## What Was Done
- Split metadata updates into two objects: pipelineUpdate
  (thumbnail_url only) and postMetadataUpdate (title +
  thumbnail → posts table only)
- Removed all writes to pipeline_items.title from sync paths
- analytics/page.tsx now fetches pipeline_items.title and
  builds a pipelineTitleByPostId map

## Prevention
- LOCKED RULE added to CLAUDE.md: pipeline_items.title is the
  ONLY display title source. No API sync may ever write to
  pipeline_items.title.
- posts.title stores API metadata only and is never rendered
  in the UI

## Resolution
[x] COMPLETE — S45 deployed June 15, 2026
