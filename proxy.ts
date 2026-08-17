import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/lib/auth/config'

const { auth } = NextAuth(authConfig)

/**
 * Optimistic auth gate for the admin area (Next 16 renamed `middleware` to `proxy`).
 *
 * This only reads the session cookie so it stays fast on every request — it is a redirect for
 * the sake of UX, NOT the security boundary. Each admin page and every admin Server Action
 * calls `requireAdmin()` from `lib/auth/session.ts`, which is the actual authority; Server
 * Actions in particular are reachable by direct POST and can bypass this matcher entirely.
 */
export default auth((request) => {
  const { pathname } = request.nextUrl
  const isSignedIn = Boolean(request.auth?.user)
  const isLoginPage = pathname === '/admin/login'

  if (isLoginPage) {
    if (isSignedIn) {
      return NextResponse.redirect(new URL('/admin', request.nextUrl))
    }
    return NextResponse.next()
  }

  if (!isSignedIn) {
    const loginUrl = new URL('/admin/login', request.nextUrl)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*'],
}
