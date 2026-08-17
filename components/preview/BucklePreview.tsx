'use client'

import dynamic from 'next/dynamic'

import type { BuckleCanvasProps } from './BuckleCanvas'

/**
 * Browser-only entry point for the renderer. Konva needs a real canvas, so the component is
 * loaded with SSR disabled; everything that wants a preview imports this rather than
 * `BuckleCanvas` directly.
 */
const BuckleCanvas = dynamic(() => import('./BuckleCanvas'), {
  ssr: false,
  loading: () => (
    <div
      className="flex aspect-4/3 w-full items-center justify-center rounded-lg bg-stone-100 text-sm text-stone-400"
      role="status"
    >
      Loading preview...
    </div>
  ),
})

export type {
  BuckleCanvasProps,
  BuckleRenderMode,
  RenderZone,
  ZoneRenderValue,
  ZoneRenderValues,
} from './BuckleCanvas'

export function BucklePreview(props: BuckleCanvasProps) {
  return <BuckleCanvas {...props} />
}
