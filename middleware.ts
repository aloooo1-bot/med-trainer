import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const isAdminPath = request.nextUrl.pathname.startsWith('/admin')

  if (isAdminPath) {
    // Admin paths: verify JWT with Auth server (network call) to prevent spoofed tokens.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirectTo', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }
    const adminList = (process.env.ADMIN_EMAILS ?? 'jorellana9100@gmail.com')
      .split(',').map(s => s.trim()).filter(Boolean)
    if (!user.email || !adminList.includes(user.email)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  } else {
    // Non-admin paths: read session from cookie (no network) to refresh tokens in the response.
    await supabase.auth.getSession()
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
