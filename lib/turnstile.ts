import 'server-only'

/**
 * Cloudflare Turnstile verification.
 *
 * Guards the one endpoint that costs real money per press. Unconfigured (no secret set) the
 * check is skipped, so local development and tests do not need Cloudflare — but a missing
 * secret in production means the door is open, which `turnstileConfigured()` lets callers warn
 * about.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim())
}

export async function verifyTurnstile(token: string | null, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return true
  if (!token) return false

  const body = new FormData()
  body.append('secret', secret)
  body.append('response', token)
  if (ip) body.append('remoteip', ip)

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    })
    const result = (await response.json()) as { success?: boolean }
    return result.success === true
  } catch {
    // Fail closed: an unreachable verifier must not become a free pass to the paid endpoint.
    return false
  }
}
