/**
 * Development seed: an admin login, the font and ornament libraries, and one worked example
 * template modelled on the reference buckles (top banner text, engraved centre, name across
 * the bottom, four corner ornaments).
 *
 *   npm run db:seed
 *
 * Safe to re-run: existing rows are left alone rather than duplicated.
 */

import { existsSync } from 'node:fs'

import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

import type {
  CenterImageZoneDefinition,
  CornerOrnamentZoneDefinition,
  TextZoneDefinition,
} from '../lib/schema/zone'
import { zoneDefinitionSchemaFor } from '../lib/schema/zone'

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file)
    break
  }
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
}

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'marley@local.test').toLowerCase()
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'marley1234'
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Marley'

/** Coordinate space of the example template's artwork. Every zone below is in these pixels. */
const ARTWORK = { width: 1000, height: 780 }

const EXAMPLE_ZONES: Array<
  TextZoneDefinition | CenterImageZoneDefinition | CornerOrnamentZoneDefinition
> = [
  {
    zoneType: 'top_text',
    label: 'Top banner',
    sortOrder: 10,
    isRequired: false,
    geometry: {
      kind: 'arc',
      // Narrower than the buckle so the corner ornaments (x 120-216 and 784-880) have room
      // beside it; overlapping zones draw on top of each other and clip the text.
      x: 250,
      y: 70,
      width: 500,
      height: 90,
      rotation: 0,
      align: 'center',
      // Gently bows upward to follow the top edge of the buckle.
      curveRadius: 900,
    },
    constraints: {
      maxChars: 22,
      minFontSizePx: 18,
      maxFontSizePx: 64,
      defaultFontSizePx: 46,
      // Left mixed-case: scripture references like "Matthew 7:21" are common here.
      uppercaseOnly: false,
      priceModifierCents: 0,
    },
  },
  {
    zoneType: 'center_image',
    label: 'Centre design',
    sortOrder: 20,
    isRequired: true,
    geometry: {
      x: 250,
      y: 185,
      width: 500,
      height: 370,
      rotation: 0,
      clip: 'none',
    },
    constraints: {
      promptHint: 'A longhorn skull, a horse, a cattle brand, a fire department badge...',
      priceModifierCents: 0,
    },
  },
  {
    zoneType: 'bottom_text',
    label: 'Bottom name',
    sortOrder: 30,
    isRequired: false,
    geometry: {
      kind: 'arc',
      x: 250,
      y: 610,
      width: 500,
      height: 95,
      rotation: 0,
      align: 'center',
      // Negative radius bows the text downward along the bottom edge.
      curveRadius: -900,
    },
    constraints: {
      maxChars: 16,
      minFontSizePx: 20,
      maxFontSizePx: 72,
      defaultFontSizePx: 54,
      // Surnames on these buckles are struck in capitals.
      uppercaseOnly: true,
      priceModifierCents: 0,
    },
  },
  ...(
    [
      ['TL', 120, 120],
      ['TR', 784, 120],
      ['BL', 120, 564],
      ['BR', 784, 564],
    ] as const
  ).map(([corner, x, y], index): CornerOrnamentZoneDefinition => ({
    zoneType: 'corner_ornament',
    label: `Corner ${corner}`,
    sortOrder: 40 + index,
    isRequired: false,
    geometry: { corner, x, y, width: 96, height: 96, rotation: 0 },
    constraints: { priceModifierCents: 1500 },
  })),
]

const FONTS = [
  {
    name: 'Western Slab',
    cssFamily: "Georgia, 'Times New Roman', serif",
    supportsCurve: true,
  },
  {
    name: 'Block Sans',
    cssFamily: "'Arial Black', Impact, sans-serif",
    supportsCurve: true,
  },
  {
    name: 'Roman Serif',
    cssFamily: "'Palatino Linotype', Palatino, serif",
    supportsCurve: true,
  },
  {
    // Script faces smear badly on a tight arc, so they are flagged straight-line only.
    name: 'Ranch Script',
    cssFamily: "'Brush Script MT', cursive",
    supportsCurve: false,
  },
]

const ORNAMENTS = [
  { name: 'Flower rosette' },
  { name: 'Ruby stone' },
  { name: 'Silver rivet' },
  { name: 'Rope twist' },
]

async function main() {
  const pool = postgres(databaseUrl!, { max: 1 })
  const db = drizzle(pool, { schema })

  try {
    // --- Admin login ------------------------------------------------------
    const [existingAdmin] = await db
      .select({ id: schema.adminUsers.id })
      .from(schema.adminUsers)
      .where(eq(schema.adminUsers.email, ADMIN_EMAIL))
      .limit(1)

    if (existingAdmin) {
      console.log(`- admin ${ADMIN_EMAIL} already exists`)
    } else {
      await db.insert(schema.adminUsers).values({
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      })
      console.log(`+ admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
    }

    // --- Font library -----------------------------------------------------
    const fontIds = new Map<string, string>()
    for (const font of FONTS) {
      const [existing] = await db
        .select({ id: schema.fonts.id })
        .from(schema.fonts)
        .where(eq(schema.fonts.name, font.name))
        .limit(1)

      if (existing) {
        fontIds.set(font.name, existing.id)
        continue
      }
      const [created] = await db
        .insert(schema.fonts)
        .values(font)
        .returning({ id: schema.fonts.id })
      fontIds.set(font.name, created.id)
      console.log(`+ font ${font.name}`)
    }

    // --- Ornament library -------------------------------------------------
    const ornamentIds: string[] = []
    for (const ornament of ORNAMENTS) {
      const [existing] = await db
        .select({ id: schema.ornamentOptions.id })
        .from(schema.ornamentOptions)
        .where(eq(schema.ornamentOptions.name, ornament.name))
        .limit(1)

      if (existing) {
        ornamentIds.push(existing.id)
        continue
      }
      const [created] = await db
        .insert(schema.ornamentOptions)
        .values(ornament)
        .returning({ id: schema.ornamentOptions.id })
      ornamentIds.push(created.id)
      console.log(`+ ornament ${ornament.name}`)
    }

    // --- Example template -------------------------------------------------
    const slug = 'classic-rope-border'
    const [existingTemplate] = await db
      .select({ id: schema.templates.id })
      .from(schema.templates)
      .where(eq(schema.templates.slug, slug))
      .limit(1)

    if (existingTemplate) {
      console.log(`- template ${slug} already exists`)
      return
    }

    // Validate the example against the shared schema, so a bad seed fails loudly here rather
    // than producing a template the customizer cannot render.
    const zoneSchema = zoneDefinitionSchemaFor(ARTWORK)
    const validatedZones = EXAMPLE_ZONES.map((zone) => {
      const result = zoneSchema.safeParse(zone)
      if (!result.success) {
        throw new Error(
          `Seed zone "${zone.label}" is invalid: ${JSON.stringify(result.error.issues)}`,
        )
      }
      return result.data
    })

    await db.transaction(async (tx) => {
      const [template] = await tx
        .insert(schema.templates)
        .values({
          slug,
          name: 'Classic Rope Border',
          description:
            'Rectangular buckle with cut corners and a rope border. Top banner, engraved centre, name across the bottom, and four corner ornaments.',
          shapeType: 'rect_cut_corners',
          // Stand-in blank so the shop can be demonstrated before real photography exists.
          baseArtworkUrl: '/buckle-artwork/classic-rope-border.svg',
          lineArtUrl: '/buckle-artwork/classic-rope-border-lineart.svg',
          baseArtworkWidth: ARTWORK.width,
          baseArtworkHeight: ARTWORK.height,
          basePriceCents: 18_000,
          status: 'published',
        })
        .returning({ id: schema.templates.id })

      for (const zone of validatedZones) {
        const [created] = await tx
          .insert(schema.zones)
          .values({
            templateId: template.id,
            zoneType: zone.zoneType,
            label: zone.label,
            sortOrder: zone.sortOrder,
            isRequired: zone.isRequired,
            geometry: zone.geometry,
            constraints: zone.constraints,
          })
          .returning({ id: schema.zones.id })

        if (zone.zoneType === 'top_text' || zone.zoneType === 'bottom_text') {
          // Curved zones only offer faces that survive being bent.
          const usable = FONTS.filter(
            (font) => font.supportsCurve || zone.geometry.kind === 'straight',
          )
          await tx.insert(schema.zoneFontOptions).values(
            usable.map((font) => ({
              zoneId: created.id,
              fontId: fontIds.get(font.name)!,
            })),
          )
        }

        if (zone.zoneType === 'corner_ornament') {
          await tx.insert(schema.zoneOrnamentOptions).values(
            ornamentIds.map((ornamentOptionId) => ({
              zoneId: created.id,
              ornamentOptionId,
            })),
          )
        }
      }

      console.log(`+ template ${slug} with ${validatedZones.length} zones`)
    })
  } finally {
    await pool.end()
  }
}

main()
  .then(() => console.log('Seed complete.'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
