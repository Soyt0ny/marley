import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'

/**
 * Tracks which in-progress designs belong to this browser.
 *
 * Customers do not sign in, so a design is claimed by a cookie instead. The cookie is HMAC
 * signed with the app secret: without a signature anyone could list arbitrary design ids and
 * edit a stranger's unfinished buckle.
 */

const COOKIE_NAME = 'marley_designs'
/** Enough for a customer working on a few buckles; oldest claims fall off. */
const MAX_TRACKED = 12
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function secret(): string {
  const value = process.env.AUTH_SECRET
  if (!value) throw new Error('AUTH_SECRET is not set; design ownership cannot be signed.')
  return value
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

function verify(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload))
  const received = Buffer.from(signature)
  // Compare lengths first: timingSafeEqual throws on a mismatch.
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function decode(raw: string | undefined): string[] {
  if (!raw) return []
  const separator = raw.lastIndexOf('.')
  if (separator <= 0) return []

  const payload = raw.slice(0, separator)
  if (!verify(payload, raw.slice(separator + 1))) return []

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function encode(ids: string[]): string {
  const payload = Buffer.from(JSON.stringify(ids), 'utf8').toString('base64url')
  return `${payload}.${sign(payload)}`
}

export async function trackedDesignIds(): Promise<string[]> {
  const store = await cookies()
  return decode(store.get(COOKIE_NAME)?.value)
}

/** Claims a design for this browser. Must be called from a Server Action or Route Handler. */
export async function rememberDesign(designId: string): Promise<void> {
  const store = await cookies()
  const existing = decode(store.get(COOKIE_NAME)?.value)
  if (existing.includes(designId)) return

  const next = [designId, ...existing].slice(0, MAX_TRACKED)
  store.set(COOKIE_NAME, encode(next), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function ownsDesign(designId: string): Promise<boolean> {
  return (await trackedDesignIds()).includes(designId)
}
