import type { Corner, ZoneType } from '@/lib/schema/zone'

/**
 * Flat field shape of the zone editor form, shared by the client form component and the server
 * pages that build its initial values. Kept out of the `'use client'` module so server
 * components can call `zoneFormDefaults()` directly.
 */
export type ZoneFormValues = {
  zoneType: ZoneType
  label: string
  sortOrder: number
  isRequired: boolean
  x: number
  y: number
  width: number
  height: number
  rotation: number
  // Text zones
  kind?: 'straight' | 'arc'
  align?: 'left' | 'center' | 'right'
  curveRadius?: number | null
  maxChars?: number
  minFontSizePx?: number
  maxFontSizePx?: number
  defaultFontSizePx?: number
  uppercaseOnly?: boolean
  // Centre image zone
  clip?: 'none' | 'rect' | 'ellipse'
  promptHint?: string | null
  // Corner zone
  corner?: Corner
  priceModifierCents: number
}

/**
 * Starting points that match the reference buckles, so adding a zone lands somewhere sensible
 * instead of at 0,0. Marley adjusts from there.
 */
const DEFAULTS: Record<ZoneType, Partial<ZoneFormValues>> = {
  top_text: {
    label: 'Top text',
    x: 200,
    y: 70,
    width: 600,
    height: 90,
    kind: 'arc',
    align: 'center',
    curveRadius: 900,
    maxChars: 22,
    minFontSizePx: 18,
    maxFontSizePx: 64,
    defaultFontSizePx: 46,
  },
  bottom_text: {
    label: 'Bottom text',
    x: 200,
    y: 610,
    width: 600,
    height: 95,
    kind: 'arc',
    align: 'center',
    curveRadius: -900,
    maxChars: 16,
    minFontSizePx: 20,
    maxFontSizePx: 72,
    defaultFontSizePx: 54,
    uppercaseOnly: true,
  },
  center_image: {
    label: 'Centre design',
    x: 250,
    y: 190,
    width: 500,
    height: 380,
    clip: 'none',
    isRequired: true,
  },
  corner_ornament: {
    label: 'Corner',
    x: 120,
    y: 120,
    width: 96,
    height: 96,
    corner: 'TL',
  },
}

export function zoneFormDefaults(zoneType: ZoneType): ZoneFormValues {
  return {
    zoneType,
    label: '',
    sortOrder: 0,
    isRequired: false,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    priceModifierCents: 0,
    ...DEFAULTS[zoneType],
  }
}
