---
name: project-dropclix-overview
description: Drop CLIX portal app — tech stack, auth patterns, session history, and key gotchas
metadata:
  type: project
---

Drop CLIX client portal — Next.js 16 + Supabase SSR + Tailwind 4. Sessions 1–9 complete as of 2026-05-31.

**Why:** Building a white-label client portal for Chase's agency (Drop CLIX LLC). Nick (Sparta Solar) is first client.

**How to apply:** Always check CLAUDE.md for session history and key gotchas before writing any code. Never use middleware.ts — use src/proxy.ts with export function proxy().

## Key auth patterns

- All dashboard pages use `getPortalContext()` from `@/lib/supabase/portal` — returns `{ supabase, clientId, userEmail, isImpersonating }`
- Admin impersonation: cookie `dropclix_impersonate_client_id`, set via `impersonateClient()` server action in `src/app/admin/actions.ts`
- Exit impersonation: `exitImpersonation()` server action clears cookie, redirects to /admin
- Dashboard layout shows "← Exit Portal" form button when admin is impersonating

## Key env vars
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY)
- `SUPABASE_SECRET_KEY` (not SERVICE_ROLE_KEY)

## Test credentials
- Admin: chase's account
- Client test: test@client.com (role=client, Nick's client_id)
- Nick's client_id: `913f1794-1506-4449-b56c-b683809cefc3`
