import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — must run before any redirect logic
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // API routes handle their own auth — never redirect them
  if (pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  // Already authenticated → skip login page
  if (pathname.startsWith('/login')) {
    if (user) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return supabaseResponse
  }

  // Auth utility pages (reset-password) — always let through; token is in the hash (client-only)
  if (pathname.startsWith('/auth/')) {
    return supabaseResponse
  }

  // Unauthenticated → redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // /admin requires admin role
  // Check app_metadata first (set by setup-admin script, comes from JWT — no DB needed).
  // Fall back to users table in case app_metadata isn't set yet.
  if (pathname.startsWith('/admin')) {
    const metaRole = (user.app_metadata as Record<string, string> | null)?.role
    if (metaRole !== 'admin') {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
