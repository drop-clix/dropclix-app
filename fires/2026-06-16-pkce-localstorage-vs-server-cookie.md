# PKCE localStorage vs Server Cookie Mismatch

**Date:** 2026-06-16  
**Severity:** Medium — magic link sign-in non-functional  
**Status:** RESOLVED (S49)  
**Affected:** All users attempting magic link login

---

## What Happened

Magic link sign-in silently failed. User clicked the email link, landed on
`/auth/callback?code=xxx`, and was immediately redirected to
`/login?error=auth_failed`. No session was established.

---

## Root Cause

Supabase PKCE flow for `signInWithOtp`:

1. `signInWithOtp` is called from the **browser** using `createBrowserClient`
2. `createBrowserClient` generates a PKCE code verifier and stores it in **`localStorage`**
3. Supabase emails a link: `https://portal.drop-clix.com/auth/callback?code=xxx`
4. User clicks link → browser hits `/auth/callback`
5. The original implementation used a **server-side Route Handler** (`route.ts`) that created a `createServerClient`, which reads from **cookies**
6. The code verifier is in `localStorage` — inaccessible to the server → `exchangeCodeForSession` fails every time

Secondary issue found along the way: `proxy.ts` was calling `supabase.auth.getUser()` 
**before** the `/auth/` passthrough check. On the PKCE callback URL, `getUser()` ran 
first and may have interfered with the code in the query string. The `/auth/` passthrough
was moved above `getUser()` to prevent this.

---

## Fix

Replaced `src/app/auth/callback/route.ts` (server Route Handler) with
`src/app/auth/callback/page.tsx` (client-side page).

The client page:
- Reads `?code=` from `window.location.search` (avoids `useSearchParams` Suspense)
- Calls `supabase.auth.exchangeCodeForSession(code)` using `createClient()` (browser client)
- Browser client has `localStorage` access → finds the PKCE verifier → exchange succeeds
- Subscribes to `onAuthStateChange(SIGNED_IN)` → fetches role → redirects admin to `/admin`, client to `/`
- 10-second timeout → `/login?error=auth_failed`

---

## Rule for Future Auth Work

> **Never handle PKCE code exchange in a server Route Handler.**  
> `signInWithOtp` (called client-side) stores the PKCE verifier in `localStorage`.  
> `exchangeCodeForSession` must run in the **browser** (client component or client-side code)  
> so it can read the verifier from `localStorage`.  
> Server route handlers use `createServerClient` → reads cookies only → verifier not found → fails.

---

## Timeline

| Time | Event |
|------|-------|
| S48 | Added magic link send flow; assumed server route would handle PKCE |
| S49 iter 1 | Added `route.ts` + fixed `emailRedirectTo` → `/auth/callback` |
| S49 iter 2 | Moved `/auth/` passthrough above `getUser()` in `proxy.ts` |
| S49 iter 3 | Replaced `route.ts` with client-side `page.tsx` — root cause fixed |
