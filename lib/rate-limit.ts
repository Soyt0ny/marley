import 'server-only'

/**
 * Fixed-window rate limiting, held in memory.
 *
 * Backs the paid generation endpoint so one visitor cannot run up a bill. The counters live in
 * the process, which is right for a single container on a VPS; running more than one replica
 * would need a shared store (Redis, or a Postgres table) to be exact.
 */

type Window = { count: number; resetAt: number }

const windows = new Map<string, Window>()
/** Bound the map so a flood of unique keys cannot grow it without limit. */
const MAX_TRACKED_KEYS = 10_000

function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  /** Seconds until the window resets, for telling the visitor when to retry. */
  retryAfterSeconds: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) sweep(now)
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  existing.count += 1
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds }
}

/** Best-effort client address, trusting Cloudflare's header ahead of the proxy chain. */
export function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  )
}
