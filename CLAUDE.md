@AGENTS.md

# Drop Clix — App

Next.js 16.2.6 + Supabase SSR + Tailwind 4. Source under `src/`. Path alias `@/*` → `src/*`.

## Sessions

### Session 1 — Project scaffold
- Created `dropclix-app` with Next.js 16, Supabase SSR, Tailwind 4
- Wrote `supabase/schema.sql` (all tables) and `supabase/rls.sql` (all RLS policies)
- Status: **complete**

### Session 2 — Auth layer ✅
- Created `src/lib/supabase/client.ts` — browser singleton via `createBrowserClient`
- Created `src/lib/supabase/server.ts` — async server client; `cookies()` must be awaited (Next.js 16)
- Created `src/proxy.ts` — Next.js 16 renamed `middleware.ts` → `proxy.ts`; export must be named `proxy` not `middleware`
- Created `src/app/(auth)/login/page.tsx` — client component login form
- Created `src/app/(dashboard)/layout.tsx` — server component dashboard shell with role badge
- Created `src/app/admin/page.tsx` — admin-only page (middleware + server-side double-check)
- Dev server confirmed running; login page renders at localhost:3002/login
- Status: **complete**

## Key decisions / gotchas

- **Next.js 16 proxy**: `middleware.ts` is deprecated. Use `src/proxy.ts` with `export function proxy()`.
- **cookies() is async**: Always `const cookieStore = await cookies()` in server components.
- **Env var names**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY), `SUPABASE_SECRET_KEY` (not SERVICE_ROLE_KEY).
- **Role check in proxy AND page**: Proxy handles redirect; page re-checks to be safe.
- **Login redirect**: After sign-in, goes to `/admin`. Clients will redirect to `/` (home).
- **Port**: 3000 may be in use; dev server falls back to 3002.

## Next sessions
- Session 3: Dashboard layout, client portal pages, pipeline view
