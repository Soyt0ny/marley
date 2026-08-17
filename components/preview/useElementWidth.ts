'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Reports the live pixel width of an element.
 *
 * The Konva stage needs a concrete pixel width rather than a CSS one, so every screen that hosts
 * a preview measures its container and re-renders when it changes.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)

    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
