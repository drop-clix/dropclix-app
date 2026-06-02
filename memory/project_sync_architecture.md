---
name: project-sync-architecture
description: How pipeline_items ↔ calendar_events bidirectional sync works; draggable calendar; posted_at field
metadata:
  type: project
---

## Bidirectional sync (Session 16)

**Pipeline → Calendar** (`syncToCalendar` in `edit-actions.ts`):
- Triggered when `updatePipelineItem` changes `title`, `platform`, `posted_at`, or `scheduled_date`
- Finds matching calendar_event via: `.ilike('notes', '%"post_id":"${postId}"%')` (notes column is text, not jsonb)
- Maps: `title→title`, `platform[0]→platform`, `posted_at.slice(0,10)→event_date`, `scheduled_date→event_date`
- Requires extra `pipeline_items` read to get `post_id` from the item UUID

**Calendar → Pipeline** (`syncToPipeline` in `edit-actions.ts`):
- Triggered when `updateCalendarEvent` changes `title`, `event_date`, or `platform`
- Finds `post_id` from calendar event's notes JSON (read already happens for note field updates)
- Maps: `title→title`, `event_date→scheduled_date`, `platform→[platform]` (array)
- Matches via `.eq('post_id', postId).eq('client_id', cid)`

Both helpers use `c.admin` directly (bypasses RLS, scoped by `client_id`).
Both call `revalidatePath('/pipeline')` and `revalidatePath('/calendar')`.

## posted_at field

`pipeline_items.posted_at timestamptz` — added in `supabase/migrations/add_posted_at.sql`.
- Set via the "Posted On / Scheduled For" datetime picker in the edit panel (shows when status = POSTED or SCHEDULED)
- Auto-flips status: future datetime → SCHEDULED, past datetime → POSTED
- Syncs date portion to `calendar_event.event_date` via `syncToCalendar`
- Displayed below status badge in pipeline table row

## Draggable calendar

- HTML5 drag API (desktop): `EventPill` is `draggable`, cells have `onDragOver`/`onDrop`
- Touch (mobile): document-level listeners added once on mount with `{ passive: false }`, 8px movement threshold, floating ghost at finger position
- Cells use `data-caldate` attribute for touch hit-test via `document.elementFromPoint`
- Drop: optimistic React state update → `updateCalendarEvent({ event_date })` → bidirectional sync handles pipeline → revert on error
- Drop animation: `droppedDate` state triggers brief green (`rgba(57,255,136,.08)`) background flash (700ms)

**Why:** [[project-dropclix]]
