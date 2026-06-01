---
name: html-portal-audit
description: Full gap analysis between the original HTML portal (portal-nick-updated.html) and the current Next.js app — UI, interactions, data, and missing features
metadata:
  type: project
---

Completed 2026-05-31. Original HTML file at `/Users/chaseevans/Downloads/portal-nick-updated.html`.

**Why:** The Next.js app was built session-by-session from scratch. Many features from the HTML portal were deprioritized or missed. This audit documents every gap so Session 12+ can close them.

**How to apply:** Use this as the canonical feature checklist for future sessions. Do not start building features from memory — reference this file.

---

## METRIC NAMING: "Reach" vs "Views"

The HTML portal uses `reach` as its primary content metric (Instagram's "Unique Accounts Reached"). The migration script imported this as `views` in `post_analytics`. These are the **same data point** — the column was renamed during migration. The Next.js app displays it as "Views" but the real metric is Reach/unique accounts. This affects all labels across Analytics, Dashboard, Angles, and Report Card.

---

## DASHBOARD — Gaps

1. **Dual filter strip** — HTML has two tab rows: date scope (All Time / Feb / Mar / Apr / May / This Week) AND window (7-Day / 3-Day / 24hr). Next.js dashboard has neither — it shows fixed EOM window with no date filter.

2. **KPI card set is different** — HTML shows: Followers (latest end value), Videos (filtered count), Avg ER%, Total Reach, Followers Gained. Next.js shows pipeline-focused KPIs (active items, pipeline breakdown). The content performance KPIs are missing from the Next.js dashboard.

3. **No charts at all** — HTML has 4 Chart.js charts:
   - Follower growth by month (bar)
   - Monthly views by month (line)
   - Posts volume vs growth % (dual-axis bar+line)
   - Avg ER by content pillar (horizontal bar with click-to-expand)
   Next.js has zero charts anywhere in the app.

4. **Clickable pillar bars** — The "Avg ER by content pillar" section in HTML is interactive: click any pillar bar → expands a grid of all videos in that pillar (sorted by ER, each card showing title, date, reach, ER%, tier badge). Clicking a video card opens the Update Modal.

5. **AI Suggestions section** — 6 dynamic data-driven suggestions generated from the post data:
   - Best video to replicate (name, ER%, hook, format)
   - Best vs worst pillar with action guidance
   - High watch-rate videos as hook templates
   - Kill-tier analysis with hook pattern identification
   - Shares-drive-reach insight
   - Weekly posting cadence check
   Next.js has no AI suggestion section.

6. **30-Day Projection section** — 3 KPI cards (projected follower gain, projected reach, projected avg ER) based on last 10 video averages, with an expandable "Why These Numbers" detail panel showing a mini-table of the last 10 videos. Next.js has no projection section.

---

## ANALYTICS — Gaps

7. **"All" platform tab** — HTML has All / Instagram / TikTok / YouTube. Next.js starts on IG with no "All" option.

8. **No EOM window** — HTML has only 3 windows: 7-Day, 3-Day, 24hr. Next.js added EOM as a 4th. The HTML's 7-Day = what Next.js calls "7 Day". EOM was added in the Next.js migration. Not a gap, just a difference — but EOM is a Next.js-only addition.

9. **Tier legend shown inline** — HTML shows the color legend (Elite ≥12%, Strong 7-12%, etc.) directly in the filter row alongside the tab buttons, not at the bottom of the page.

10. **5 Analytics charts — all missing from Next.js**:
    - Reach by post (bar, with Top / Lowest / Last 10 / All sub-toggle)
    - ER % over time (line chart with points colored by tier)
    - Hook type avg ER (bar)
    - Format avg ER (doughnut)
    - Watch % vs ER scatter plot (each video is a dot)

11. **Performance table sub-tabs** — HTML has: Top 10 / This Week / This Month / All Posts. Next.js shows all posts (equivalent to "All Posts") with no sub-tab switching.

12. **Tier filter on table** — HTML has All / Elite / Strong / Average / Kill filter buttons above the table. Next.js has pillar filter but no tier filter.

13. **`er-bar` inline visualization** — HTML renders a small colored bar next to each ER% value in the table rows (50px wide, fills proportionally). Next.js shows only the number + badge.

14. **"Reach" as the column label** — HTML table shows: Reach (not Views), Likes, Comments, Shares, Saves, Followers. Next.js shows: Views, Likes, Comments, Saves, Shares (different order, "Views" label).

15. **Followers column in table** — HTML analytics table shows `followers` gained per post. Next.js table does not show a followers column.

16. **Row click opens Update Modal, not inline edit** — HTML: clicking any row opens a full modal showing:
    - Video title + ID
    - 3-column window summary (24hr / 3-Day / 7-Day) each showing ER% + reach + followers
    - Window tab switcher (24hr / 3-Day / 7-Day)
    - Input fields for all 7 metrics in the selected window: reach, likes, comments, shares, saves, followers, watch
    - Decision dropdown
    - Delete button
    Next.js: click cell → inline edit of that single cell only. The full cross-window update modal is missing.

---

## ANGLES — Gaps

17. **Pillar expand accordions** — In HTML, each pillar in the Angles tab is a clickable accordion card. Clicking it expands to show a grid of all videos in that pillar, sorted by ER, each card showing ID, truncated title, reach, ER%, tier badge. Clicking a card opens the Update Modal. Next.js shows breakdown bars but no per-pillar video grids and no way to drill into individual posts from Angles.

18. **Overused / Opportunity tags** — HTML auto-tags pillars and hooks/formats:
    - Overused: count > 55% of max AND avg ER below average → red "Overused" badge
    - Opportunity: count < 30% of max AND avg ER above average → amber "Opportunity" badge
    Next.js shows neither of these tags.

19. **Hook and Format cards show count, not just ER** — HTML's hook/format cards show: label, count (large), avg ER, usage bar, Overused/Opportunity tag. Next.js shows similar data but without the Opportunity/Overused tags.

---

## PIPELINE — Gaps

20. **HTML pipeline is read-only** — The original HTML pipeline is a static display table: no status dropdown, no inline editing, no script view. This is actually a case where Next.js is MORE advanced (it has inline editing, which the HTML never had). But the HTML's status names differ: POSTED, NEEDS REVISION, FILMED, PLANNED — mapped to Next.js names during migration.

21. **No platform/pillar/phase filter** in HTML — Next.js phase cards and pillar chips are Next.js additions. HTML was just a flat table.

---

## GOALS — Gaps

22. **Goals are user-input forms in HTML** — HTML has two cards: "Set Weekly Goals" and "Set Monthly Goals". Each is a form with labeled inputs for all 6 metrics + a Save button. Targets are persisted by the user. Next.js uses seeded default targets with inline target editing (added in Session 11). The HTML UX is a form with explicit Save; Next.js is auto-save. Both work, but the HTML's 6 metrics differ from Next.js's 4.

23. **HTML has 6 goal metrics** — Posts, Followers Gained, **Total Reach**, **Avg ER%**, **Elite Videos**, **Watch% Avg**. Next.js has 4: Posts, Total Views (≈Reach), Followers Gained, Avg ER%. Missing from Next.js: Elite Videos target, Watch% Avg target.

24. **Goals progress uses horizontal bars** — HTML shows a `goal-row` pattern: label | progress bar | actual/goal numbers. Next.js shows KPI-style goal cards with vertical layout. HTML style is more compact for 6 metrics.

25. **Weekly goals progress shows THIS WEEK'S actuals** — HTML computes weekly actuals from last 7 days of video data. Next.js doesn't have a "this week" computation for goals (it uses the full month).

---

## REPORT CARD — Gaps

26. **HTML Report Card scores 7 criteria, Next.js scores 4** — HTML criteria:
    - Engagement Rate (30 pts max)
    - Post Volume (20 pts)
    - Avg Watch Rate (20 pts)
    - **Reach Generated** (10 pts)
    - **Followers Gained** (10 pts)
    - **Elite Videos** (5 pts)
    - **Shares Driven** (5 pts)
    Next.js computes 4 components (Posts, Views/Reach, Avg ER%, Elite Videos) but different weights.

27. **HTML Report Card is current-week only** — HTML shows only the current 7-day rolling window. Next.js added monthly history table and a weekly/monthly period selector. This is a Next.js enhancement, not a gap.

28. **Target shown in score rows** — HTML shows: `"value unit · target description"` in small text next to each score bar. Example: `"5.2% · ≥12% = full marks"`. Next.js shows bars but not the target threshold text inline.

29. **Next Week Recommendations** — HTML has a "Next Week Recommendations" card (5 AI-generated action items based on best video, pillar performance, kill count, posting cadence advice). Next.js has "Next Period Focus" bullets in the monthly view.

30. **Week's posts list is clickable** — HTML's "This Week's Posts" card: each video row is clickable to open the Update Modal. Next.js shows a top posts table but clicking does nothing (no action).

---

## ADS — Gaps (Major)

31. **No charts in Next.js Ads tab** — HTML has:
    - Spend vs Leads over time (dual-axis bar + line)
    - CPL trend (line chart)
    - Creative: Hook Rate by Creative (bar)
    - Creative: Hold Rate by Creative (bar)
    - Audience: CPL by Audience (bar)
    - Audience: Leads by Audience (bar)
    Next.js has none.

32. **No sub-view tabs** — HTML has Overview / Creative Performance / Audience Breakdown / Monthly Summary as tab buttons. Next.js shows everything in one flat layout with Campaign Details at bottom.

33. **Auto Suggestion Banner** — HTML generates and shows 2-4 insight lines at the top of the Ads tab based on CPL comparison, creative testing status, active ad count, and zero-leads alert. Next.js has no suggestion system.

34. **No "+ Add Campaign" button/modal** — HTML has a full modal form to log new ad campaigns with auto-calculated CPM, CPC, CTR, CPL, CPhire, ROAS. Next.js has no way to add campaigns from the UI.

35. **Audience Breakdown tab — entirely missing from Next.js** — HTML tracks:
    - Audience name, location, interest targeting, daily budget
    - Spend, leads, CPL, hires, CPhire, status, notes
    - Best audience card (auto-selected by lowest CPhire)
    - 2 charts (CPL by audience, Leads by audience)
    - "+ Add Audience" modal with auto-calc CPL/CPhire
    There are 4 audience records seeded (`SEED_AUDIENCES`) that exist in the Next.js DB but are never displayed.

36. **Monthly Summary tab — missing from Next.js** — Shows last 2 months as cards with MoM trend arrows (↑/↓ % change in spend, lead count), plus a full historical table with MoM% columns.

37. **Creative table has more fields** — HTML creative table shows: Hook Rate, Hold Rate, Avg Play (sec), Video Plays — none of which are shown in Next.js. The DB schema has `watch_pct` but not hook_rate/hold_rate for creatives.

38. **Campaign table shows CTR%, CPM, CPC inline** — HTML shows all 16 columns in one table. Next.js shows them in a separate "Campaign Details" card grid below.

39. **HTML KPI cards differ** — HTML: Total Spend, Total Leads, Avg CPL, Hires, Cost per Hire. Next.js: Total Spend, Estimated Revenue, Portfolio ROAS, Total Hires. Revenue/ROAS tracking is a Next.js-only addition. Leads and Avg CPL KPI cards are missing from Next.js.

---

## STUDIO — Gaps (Architectural)

40. **Next.js Studio ≠ HTML Studio** — These are fundamentally different:
    - HTML Studio = data entry hub (log new videos, update monthly totals, access speed tips)
    - Next.js Studio = pipeline content queue (SCRIPTED/FILMING items, script viewer)
    The HTML Studio functionality (video logging, monthly total entry) has no equivalent in Next.js.

41. **Video logging form** — HTML Studio has a complete form to log a new video post: Post ID, Title, Platform, Date, Pillar, Hook Type, Format, CTA, 24-hour metrics (reach, likes, comments, shares, saves, followers, watch%), auto-calculated ER%, Notes, Decision. This entire flow is missing from Next.js.

42. **Monthly totals entry** — HTML Studio right card lets you set Month, Year, Reels Posted, Total Views, Start/End Followers — and shows a list of saved months with delete buttons. Next.js has no monthly totals management UI.

43. **Update Modal (global)** — The HTML's most-used interaction is the Update Modal, triggered by clicking any video row in Analytics, Angles, or Report Card. It shows all windows (24hr/3-Day/7-Day) and lets you update metrics for any window + set Decision. Next.js replaced this with per-cell inline editing (blur-to-save) — different UX pattern that doesn't give the cross-window summary view.

---

## VISUAL / UX DESIGN — Gaps

44. **Border radius** — HTML cards use `border-radius: 4-8px`. Next.js uses square corners throughout. Minor but affects polish.

45. **Global save indicator** — HTML has a `save-pill` in the navbar that shows "Saved" (green) or "Error" (red) after any persist operation, then fades back to neutral "Saved". Next.js has per-field save dots (Session 11) but no global indicator.

46. **Inline ER bar** — HTML renders a 50px mini bar next to each ER% value in all tables (filled proportionally, colored by tier). Not in Next.js.

47. **Charts throughout** — The HTML portal is highly visual with Chart.js charts on Dashboard (4), Analytics (5), and Ads (6). Next.js has zero charts. This is the biggest visual gap.

48. **Modal interaction pattern** — HTML uses centered modal overlays for all edit operations. Next.js Session 11 added inline row expansion. These are different patterns — HTML modals show more context (all windows at once); Next.js inline panels are less intrusive.

49. **Background click to close** — HTML modals close on backdrop click. Next.js edit panels close via a "Close" button only.

50. **"All" platform option in Analytics** — Not available in Next.js (starts on IG).
