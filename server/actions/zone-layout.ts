'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { templates, zones } from '@/db/schema'
import { requireAdmin } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { zoneDefinitionSchemaFor } from '@/lib/schema/zone'

import type { FormState } from './types'

/**
 * Saves positions from the visual editor.
 *
 * Only the bounding box and rotation are touched — everything else about a zone (its type, text
 * limits, curve radius, allowed options) is edited elsewhere and is merged back in untouched
 * before validation, so dragging a zone can never quietly drop a fabrication rule.
 */
const layoutSchema = z.array(
  z.object({
    zoneId: z.uuid(),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
    rotation: z.number().finite(),
  }),
)

export async function saveZoneLayoutAction(
  templateId: string,
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const raw = formData.get('layout')
  if (typeof raw !== 'string') return { error: 'Nothing to save.' }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return { error: 'That layout could not be read.' }
  }

  const layout = layoutSchema.safeParse(parsedJson)
  if (!layout.success) return { error: 'That layout is not in a valid shape.' }

  const [template] = await db
    .select({
      width: templates.baseArtworkWidth,
      height: templates.baseArtworkHeight,
    })
    .from(templates)
    .where(eq(templates.id, templateId))
    .limit(1)
  if (!template) return { error: 'That model no longer exists.' }

  const existing = await db.select().from(zones).where(eq(zones.templateId, templateId))
  const byId = new Map(existing.map((zone) => [zone.id, zone]))
  const schema = zoneDefinitionSchemaFor(template)

  const updates: Array<{ id: string; geometry: (typeof existing)[number]['geometry'] }> = []

  for (const position of layout.data) {
    const zone = byId.get(position.zoneId)
    if (!zone) return { error: 'That layout refers to a zone this model does not have.' }

    // Round to whole pixels: sub-pixel drag noise is meaningless at fabrication scale.
    const geometry = {
      ...zone.geometry,
      x: Math.round(position.x),
      y: Math.round(position.y),
      width: Math.round(position.width),
      height: Math.round(position.height),
      rotation: Math.round(position.rotation * 10) / 10,
    }

    const result = schema.safeParse({
      zoneType: zone.zoneType,
      label: zone.label,
      sortOrder: zone.sortOrder,
      isRequired: zone.isRequired,
      geometry,
      constraints: zone.constraints,
    })

    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'is not valid'
      return { error: `${zone.label}: ${message}` }
    }

    updates.push({ id: zone.id, geometry: result.data.geometry })
  }

  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx
        .update(zones)
        .set({ geometry: update.geometry, updatedAt: new Date() })
        .where(eq(zones.id, update.id))
    }
  })

  revalidatePath(`/admin/templates/${templateId}`)
  return { success: `Saved ${updates.length} zone position(s).` }
}
