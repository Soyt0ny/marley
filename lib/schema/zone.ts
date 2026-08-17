/**
 * Single source of truth for what a buckle zone is and what a customer may do with it.
 *
 * Three consumers import from this file and MUST NOT re-implement its rules:
 *   1. The admin template editor  — decides which fields to show Marley, validates her input.
 *   2. The storefront customizer  — decides which inputs to show the customer, enforces limits.
 *   3. The renderer (BuckleCanvas) — draws a zone from its geometry, client-side and server-side.
 *
 * All geometry is expressed in the pixel coordinate space of the template's base artwork
 * (`templates.baseArtworkWidth` x `baseArtworkHeight`). The renderer scales that space to fit
 * whatever viewport it is drawing into, so zone coordinates never depend on screen size.
 *
 * Which fonts / ornaments a zone allows is NOT stored here — that lives in the
 * `zoneFontOptions` / `zoneOrnamentOptions` join tables, so there is exactly one place
 * to look up "what may this zone use". Constraints below hold only scalar limits.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/** Zone kinds. A template composes these; it does not have to use all of them. */
export const ZONE_TYPES = [
  'top_text',
  'bottom_text',
  'center_image',
  'corner_ornament',
] as const
export type ZoneType = (typeof ZONE_TYPES)[number]

/** Text-bearing zones, which share geometry and constraint shapes. */
export const TEXT_ZONE_TYPES = ['top_text', 'bottom_text'] as const
export type TextZoneType = (typeof TEXT_ZONE_TYPES)[number]

/**
 * Physical buckle silhouettes Marley can actually have fabricated. Adding a shape here is a
 * production decision, not a UI one — the list stays closed on purpose.
 */
export const BUCKLE_SHAPES = [
  'rect_cut_corners',
  'rect_rounded',
  'contoured_rect',
  'oval',
  'round',
  'shield',
] as const
export type BuckleShape = (typeof BUCKLE_SHAPES)[number]

export const CORNERS = ['TL', 'TR', 'BL', 'BR'] as const
export type Corner = (typeof CORNERS)[number]

// ---------------------------------------------------------------------------
// Fabrication limits
//
// These are deliberately conservative. They are the outer bound of what the admin editor
// will accept, not a suggestion — a value outside these ranges is rejected server-side.
// ---------------------------------------------------------------------------

export const LIMITS = {
  /** A single engraved line. Beyond this, letters get too small to strike cleanly. */
  maxCharsCeiling: 40,
  fontSize: { min: 6, max: 240 },
  /** Below this radius an arc is tighter than a letter can follow without distorting. */
  minCurveRadius: 40,
  /** Smallest zone that is still meaningful to engrave, in artwork px. */
  minZoneSize: 4,
  rotation: { min: -180, max: 180 },
} as const

/**
 * Characters an engraver can reproduce. Excludes emoji, control characters and symbols that
 * have no engraved equivalent. Accented letters are allowed (\p{L} covers ñ, á, ü...).
 */
export const ENGRAVABLE_TEXT = /^[\p{L}\p{N} .,'&\-:#/()!?"]*$/u

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const coordinate = z.number().finite()
const size = z.number().finite().min(LIMITS.minZoneSize)
const rotation = z.number().finite().min(LIMITS.rotation.min).max(LIMITS.rotation.max)

/** Axis-aligned box before rotation, anchored at its top-left corner. */
const boxShape = {
  x: coordinate,
  y: coordinate,
  width: size,
  height: size,
  rotation: rotation.default(0),
}

export const textZoneGeometrySchema = z
  .object({
    ...boxShape,
    /** `straight` draws on a flat baseline; `arc` follows a circular baseline. */
    kind: z.enum(['straight', 'arc']),
    align: z.enum(['left', 'center', 'right']).default('center'),
    /**
     * Signed radius of the text baseline, in artwork px. Required when `kind` is `arc`.
     * Positive bulges the text upward (a rainbow, as on a top banner); negative bulges it
     * downward (as on a bottom banner). Larger magnitude = flatter curve.
     */
    curveRadius: z.number().finite().nullable().default(null),
  })
  .refine((g) => g.kind !== 'arc' || g.curveRadius !== null, {
    error: 'An arc text zone needs a curveRadius.',
    path: ['curveRadius'],
  })
  .refine(
    (g) =>
      g.kind !== 'arc' ||
      g.curveRadius === null ||
      Math.abs(g.curveRadius) >= LIMITS.minCurveRadius,
    {
      error: `A curve radius tighter than ${LIMITS.minCurveRadius}px cannot be engraved cleanly.`,
      path: ['curveRadius'],
    },
  )

export const centerImageZoneGeometrySchema = z.object({
  ...boxShape,
  /** How the chosen artwork is masked inside the box. */
  clip: z.enum(['none', 'rect', 'ellipse']).default('none'),
})

export const cornerOrnamentZoneGeometrySchema = z.object({
  ...boxShape,
  corner: z.enum(CORNERS),
})

export type TextZoneGeometry = z.infer<typeof textZoneGeometrySchema>
export type CenterImageZoneGeometry = z.infer<typeof centerImageZoneGeometrySchema>
export type CornerOrnamentZoneGeometry = z.infer<typeof cornerOrnamentZoneGeometrySchema>
export type ZoneGeometry =
  | TextZoneGeometry
  | CenterImageZoneGeometry
  | CornerOrnamentZoneGeometry

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

/** Price deltas are stored in cents to avoid float drift, and may be negative (a discount). */
const priceModifierCents = z.number().int().default(0)

export const textZoneConstraintsSchema = z
  .object({
    maxChars: z.number().int().min(1).max(LIMITS.maxCharsCeiling),
    minFontSizePx: z.number().finite().min(LIMITS.fontSize.min).max(LIMITS.fontSize.max),
    maxFontSizePx: z.number().finite().min(LIMITS.fontSize.min).max(LIMITS.fontSize.max),
    defaultFontSizePx: z.number().finite().min(LIMITS.fontSize.min).max(LIMITS.fontSize.max),
    /** Marley forces uppercase on models whose die set has no lowercase punches. */
    uppercaseOnly: z.boolean().default(false),
    priceModifierCents,
  })
  .refine((c) => c.minFontSizePx <= c.maxFontSizePx, {
    error: 'Minimum font size cannot exceed the maximum.',
    path: ['minFontSizePx'],
  })
  .refine(
    (c) => c.defaultFontSizePx >= c.minFontSizePx && c.defaultFontSizePx <= c.maxFontSizePx,
    {
      error: 'Default font size must sit between the minimum and maximum.',
      path: ['defaultFontSizePx'],
    },
  )

export const centerImageZoneConstraintsSchema = z.object({
  /** Shown to the customer above the description box, e.g. "a longhorn skull, a brand...". */
  promptHint: z.string().max(200).nullable().default(null),
  priceModifierCents,
})

export const cornerOrnamentZoneConstraintsSchema = z.object({
  priceModifierCents,
})

export type TextZoneConstraints = z.infer<typeof textZoneConstraintsSchema>
export type CenterImageZoneConstraints = z.infer<typeof centerImageZoneConstraintsSchema>
export type CornerOrnamentZoneConstraints = z.infer<typeof cornerOrnamentZoneConstraintsSchema>
export type ZoneConstraints =
  | TextZoneConstraints
  | CenterImageZoneConstraints
  | CornerOrnamentZoneConstraints

// ---------------------------------------------------------------------------
// Zone definition — the shape the admin editor saves and the renderer reads
// ---------------------------------------------------------------------------

const zoneBase = {
  label: z.string().min(1).max(60),
  sortOrder: z.number().int().min(0).default(0),
  /** A required zone must be filled before the customer can submit the design. */
  isRequired: z.boolean().default(false),
}

export const zoneDefinitionSchema = z.discriminatedUnion('zoneType', [
  z.object({
    ...zoneBase,
    zoneType: z.literal('top_text'),
    geometry: textZoneGeometrySchema,
    constraints: textZoneConstraintsSchema,
  }),
  z.object({
    ...zoneBase,
    zoneType: z.literal('bottom_text'),
    geometry: textZoneGeometrySchema,
    constraints: textZoneConstraintsSchema,
  }),
  z.object({
    ...zoneBase,
    zoneType: z.literal('center_image'),
    geometry: centerImageZoneGeometrySchema,
    constraints: centerImageZoneConstraintsSchema,
  }),
  z.object({
    ...zoneBase,
    zoneType: z.literal('corner_ornament'),
    geometry: cornerOrnamentZoneGeometrySchema,
    constraints: cornerOrnamentZoneConstraintsSchema,
  }),
])

export type ZoneDefinition = z.infer<typeof zoneDefinitionSchema>
export type TextZoneDefinition = Extract<ZoneDefinition, { zoneType: TextZoneType }>
export type CenterImageZoneDefinition = Extract<ZoneDefinition, { zoneType: 'center_image' }>
export type CornerOrnamentZoneDefinition = Extract<
  ZoneDefinition,
  { zoneType: 'corner_ornament' }
>

export function isTextZone(zone: { zoneType: ZoneType }): boolean {
  return zone.zoneType === 'top_text' || zone.zoneType === 'bottom_text'
}

// ---------------------------------------------------------------------------
// Artwork bounds
//
// A zone is only valid relative to the artwork it sits on, which the schema above cannot know.
// Callers that have the artwork dimensions use the factory below so a zone dragged off the
// edge of the buckle is rejected at save time rather than silently rendering out of frame.
// ---------------------------------------------------------------------------

export type ArtworkBounds = { width: number; height: number }

/** Rotation is ignored here: the unrotated box must fit, which is the stricter check. */
export function zoneFitsArtwork(
  geometry: { x: number; y: number; width: number; height: number },
  artwork: ArtworkBounds,
): boolean {
  return (
    geometry.x >= 0 &&
    geometry.y >= 0 &&
    geometry.x + geometry.width <= artwork.width &&
    geometry.y + geometry.height <= artwork.height
  )
}

/** Zone schema bound to a specific template's artwork, rejecting out-of-bounds geometry. */
export function zoneDefinitionSchemaFor(artwork: ArtworkBounds) {
  return zoneDefinitionSchema.check((ctx) => {
    if (!zoneFitsArtwork(ctx.value.geometry, artwork)) {
      ctx.issues.push({
        code: 'custom',
        input: ctx.value,
        // Reported at the root rather than on one field: it is the combination of position and
        // size that overflows, so the form shows it as a whole-zone problem.
        path: [],
        message: `This zone falls outside the ${artwork.width}x${artwork.height}px artwork.`,
      })
    }
  })
}

// ---------------------------------------------------------------------------
// Customer input
//
// A zone definition says what is allowed; these schemas validate what the customer actually
// chose. Allowed fonts/ornaments come from the join tables and are passed in, keeping this
// file free of database concerns while still being the only place the rules are expressed.
// ---------------------------------------------------------------------------

/** A zone plus the option ids resolved from its join tables. */
export type ResolvedZone = {
  id: string
  zoneType: ZoneType
  label: string
  isRequired: boolean
  geometry: ZoneGeometry
  constraints: ZoneConstraints
  allowedFontIds: string[]
  allowedOrnamentOptionIds: string[]
}

export const textZoneValueSchema = z.object({
  text: z.string(),
  fontId: z.uuid(),
  fontSizePx: z.number().finite(),
})

export const centerImageZoneValueSchema = z.object({ proposalId: z.uuid() })
export const cornerOrnamentZoneValueSchema = z.object({ ornamentOptionId: z.uuid() })

export type TextZoneValue = z.infer<typeof textZoneValueSchema>
export type CenterImageZoneValue = z.infer<typeof centerImageZoneValueSchema>
export type CornerOrnamentZoneValue = z.infer<typeof cornerOrnamentZoneValueSchema>
export type ZoneValue = TextZoneValue | CenterImageZoneValue | CornerOrnamentZoneValue

/**
 * Build the validator for one zone's customer input.
 *
 * This is the guardrail the whole product rests on: it is what stops a customer submitting a
 * 60-character line, a font Marley never enabled, or an ornament this model cannot take. The
 * storefront also applies these limits in the inputs for immediate feedback, but this runs
 * server-side on submit and is the authority.
 */
export function zoneValueSchemaFor(zone: ResolvedZone) {
  switch (zone.zoneType) {
    case 'top_text':
    case 'bottom_text': {
      const constraints = zone.constraints as TextZoneConstraints
      return textZoneValueSchema
        .extend({
          text: z
            .string()
            .max(constraints.maxChars, {
              error: `Up to ${constraints.maxChars} characters fit on this line.`,
            })
            .refine((value) => ENGRAVABLE_TEXT.test(value), {
              error: 'This text contains characters that cannot be engraved.',
            })
            .transform((value) =>
              constraints.uppercaseOnly ? value.toUpperCase() : value,
            ),
          fontId: z.uuid().refine((id) => zone.allowedFontIds.includes(id), {
            error: 'That font is not available for this zone.',
          }),
          fontSizePx: z
            .number()
            .finite()
            .min(constraints.minFontSizePx)
            .max(constraints.maxFontSizePx),
        })
        .refine((value) => !zone.isRequired || value.text.trim().length > 0, {
          error: `${zone.label} is required.`,
          path: ['text'],
        })
    }
    case 'center_image':
      return centerImageZoneValueSchema
    case 'corner_ornament':
      return cornerOrnamentZoneValueSchema.extend({
        ornamentOptionId: z
          .uuid()
          .refine((id) => zone.allowedOrnamentOptionIds.includes(id), {
            error: 'That ornament is not available for this zone.',
          }),
      })
  }
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Quote a design from its template base price plus the modifier of every zone the customer
 * filled. Marley can still override the total during review; this is the figure the customer
 * is shown and authorized at checkout.
 */
export function quoteDesignCents(
  basePriceCents: number,
  filledZones: Array<{ constraints: ZoneConstraints }>,
): number {
  return filledZones.reduce(
    (total, zone) => total + (zone.constraints.priceModifierCents ?? 0),
    basePriceCents,
  )
}
