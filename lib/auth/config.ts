import type { NextAuthConfig } from 'next-auth'

/**
 * Auth configuration shared between `proxy.ts` and the full Auth.js instance in `auth.ts`.
 *
 * The Credentials provider lives in `auth.ts`, not here, so the proxy — which runs on every
 * matched request and only needs to read the session cookie — never pulls the database or
 * bcrypt into its module graph.
 */
export const authConfig = {
  pages: { signIn: '/admin/login' },
  session: {
    strategy: 'jwt',
    // Marley reviews orders regularly; a month-long session avoids constant re-logins.
    maxAge: 60 * 60 * 24 * 30,
  },
  providers: [],
} satisfies NextAuthConfig
