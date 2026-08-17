import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { auth } from '@/auth'

export type AdminIdentity = {
  email: string
  name: string
  /** Audit string written to `orderStatusHistory.changedBy`. */
  actor: string
}

/** Deduplicated per request, so several components can ask without re-decoding the cookie. */
const readSession = cache(async () => auth())

/**
 * The authoritative admin check. Call this at the top of every admin page, Server Action and
 * Route Handler — the proxy redirect is only a convenience and must never be relied on alone.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const session = await readSession()
  const email = session?.user?.email

  if (!email) {
    redirect('/admin/login')
  }

  return {
    email,
    name: session?.user?.name ?? email,
    actor: `admin:${email}`,
  }
}

/** Non-redirecting variant, for deciding what to show rather than whether to allow. */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const session = await readSession()
  const email = session?.user?.email
  if (!email) return null
  return { email, name: session?.user?.name ?? email, actor: `admin:${email}` }
}
