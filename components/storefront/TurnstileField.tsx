'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

/**
 * Cloudflare Turnstile widget feeding a hidden `turnstileToken` field.
 *
 * Renders nothing when no site key is configured, which is how local development and the test
 * suite run — the server skips verification in exactly the same case.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void },
      ) => string
      remove: (widgetId: string) => void
    }
  }
}

export function TurnstileField() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [token, setToken] = useState('')
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    if (!siteKey || !scriptReady) return
    const container = containerRef.current
    if (!container || !window.turnstile) return

    const widgetId = window.turnstile.render(container, {
      sitekey: siteKey,
      callback: setToken,
    })
    return () => window.turnstile?.remove(widgetId)
  }, [siteKey, scriptReady])

  if (!siteKey) return null

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} />
      <input type="hidden" name="turnstileToken" value={token} />
    </>
  )
}
