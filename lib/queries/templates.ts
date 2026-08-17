import 'server-only'

import { asc, eq } from 'drizzle-orm'

import { designs, templates, zones } from '@/db/schema'
import { db } from '@/lib/db'
import type { ResolvedZone, ZoneConstraints, ZoneGeometry, ZoneType } from '@/lib/schema/zone'

/**
 * Loads a template together with everything a zone is allowed to offer.
 *
 * Both the customizer and the order-review proof read through here, so "what may this zone use"
 * is answered by one query shape rather than each screen assembling its own idea of the rules.
 */

export type FontOption = {
  id: string
  name: string
  cssFamily: string
  supportsCurve: boolean
}

export type OrnamentOption = {
  id: string
  name: string
  thumbnailUrl: string | null
  assetUrl: string | null
}

export type CustomizableZone = {
  id: string
  zoneType: ZoneType
  label: string
  sortOrder: number
  isRequired: boolean
  geometry: ZoneGeometry
  constraints: ZoneConstraints
  fonts: FontOption[]
  ornaments: OrnamentOption[]
}

export type CustomizableTemplate = {
  id: string
  slug: string
  name: string
  description: string | null
  shapeType: (typeof templates.$inferSelect)['shapeType']
  baseArtworkUrl: string | null
  lineArtUrl: string | null
  baseArtworkWidth: number
  baseArtworkHeight: number
  basePriceCents: number
  status: (typeof templates.$inferSelect)['status']
  zones: CustomizableZone[]
}

async function loadZones(templateId: string): Promise<CustomizableZone[]> {
  const rows = await db.query.zones.findMany({
    where: eq(zones.templateId, templateId),
    orderBy: [asc(zones.sortOrder)],
    with: {
      fontOptions: { with: { font: true } },
      ornamentOptions: { with: { ornamentOption: true } },
    },
  })

  return rows.map((zone) => ({
    id: zone.id,
    zoneType: zone.zoneType,
    label: zone.label,
    sortOrder: zone.sortOrder,
    isRequired: zone.isRequired,
    geometry: zone.geometry,
    constraints: zone.constraints,
    fonts: zone.fontOptions
      // A retired font stays attached to old designs but is no longer offered on new ones.
      .filter((option) => option.font.isActive)
      .map((option) => ({
        id: option.font.id,
        name: option.font.name,
        cssFamily: option.font.cssFamily,
        supportsCurve: option.font.supportsCurve,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    ornaments: zone.ornamentOptions
      .filter((option) => option.ornamentOption.isActive)
      .map((option) => ({
        id: option.ornamentOption.id,
        name: option.ornamentOption.name,
        thumbnailUrl: option.ornamentOption.thumbnailUrl,
        assetUrl: option.ornamentOption.assetUrl,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

function toTemplate(
  row: typeof templates.$inferSelect,
  zoneList: CustomizableZone[],
): CustomizableTemplate {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    shapeType: row.shapeType,
    baseArtworkUrl: row.baseArtworkUrl,
    lineArtUrl: row.lineArtUrl,
    baseArtworkWidth: row.baseArtworkWidth,
    baseArtworkHeight: row.baseArtworkHeight,
    basePriceCents: row.basePriceCents,
    status: row.status,
    zones: zoneList,
  }
}

export async function loadTemplateBySlug(slug: string): Promise<CustomizableTemplate | null> {
  const [row] = await db.select().from(templates).where(eq(templates.slug, slug)).limit(1)
  if (!row) return null
  return toTemplate(row, await loadZones(row.id))
}

export async function loadTemplateById(id: string): Promise<CustomizableTemplate | null> {
  const [row] = await db.select().from(templates).where(eq(templates.id, id)).limit(1)
  if (!row) return null
  return toTemplate(row, await loadZones(row.id))
}

export async function loadPublishedTemplates() {
  return db
    .select({
      id: templates.id,
      slug: templates.slug,
      name: templates.name,
      description: templates.description,
      shapeType: templates.shapeType,
      baseArtworkUrl: templates.baseArtworkUrl,
      lineArtUrl: templates.lineArtUrl,
      baseArtworkWidth: templates.baseArtworkWidth,
      baseArtworkHeight: templates.baseArtworkHeight,
      basePriceCents: templates.basePriceCents,
    })
    .from(templates)
    .where(eq(templates.status, 'published'))
    .orderBy(asc(templates.name))
}

/** The design plus the template it was started from, with all its option rules resolved. */
export async function loadDesign(designId: string) {
  const design = await db.query.designs.findFirst({
    where: eq(designs.id, designId),
    with: { zoneValues: true },
  })
  if (!design) return null

  const template = await loadTemplateById(design.templateId)
  if (!template) return null

  return { design, template }
}

/** Shape `zoneValueSchemaFor` expects, for validating a customer's choices server-side. */
export function toResolvedZone(zone: CustomizableZone): ResolvedZone {
  return {
    id: zone.id,
    zoneType: zone.zoneType,
    label: zone.label,
    isRequired: zone.isRequired,
    geometry: zone.geometry,
    constraints: zone.constraints,
    allowedFontIds: zone.fonts.map((font) => font.id),
    allowedOrnamentOptionIds: zone.ornaments.map((ornament) => ornament.id),
  }
}
