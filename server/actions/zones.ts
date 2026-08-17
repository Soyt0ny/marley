'use server'

import { eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  fonts,
  ornamentOptions,
  templates,
  zoneFontOptions,
  zoneOrnamentOptions,
  zones,
} from '@/db/schema'
import { requireAdmin } from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  zoneDefinitionSchemaFor,
  type ArtworkBounds,
  type TextZoneGeometry,
  type ZoneDefinition,
} from '@/lib/schema/zone'

import { toFieldErrors, type FormState } from './types'

/** Empty inputs become `undefined` so the shared schema reports them as missing, not as NaN. */
function numberField(formData: FormData, name: string): number | undefined {
  const raw = formData.get(name)
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function stringField(formData: FormData, name: string): string {
  const raw = formData.get(name)
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * Assembles the flat form fields into the nested shape `zoneDefinitionSchema` describes. It
 * deliberately does no validating of its own — every rule stays in `lib/schema/zone.ts`.
 */
function readZoneForm(formData: FormData): unknown {
  const zoneType = stringField(formData, 'zoneType')
  const base = {
    zoneType,
    label: stringField(formData, 'label'),
    sortOrder: numberField(formData, 'sortOrder') ?? 0,
    isRequired: formData.get('isRequired') === 'on',
  }
  const box = {
    x: numberField(formData, 'x'),
    y: numberField(formData, 'y'),
    width: numberField(formData, 'width'),
    height: numberField(formData, 'height'),
    rotation: numberField(formData, 'rotation') ?? 0,
  }

  switch (zoneType) {
    case 'top_text':
    case 'bottom_text':
      return {
        ...base,
        geometry: {
          ...box,
          kind: stringField(formData, 'kind'),
          align: stringField(formData, 'align') || 'center',
          curveRadius: numberField(formData, 'curveRadius') ?? null,
        },
        constraints: {
          maxChars: numberField(formData, 'maxChars'),
          minFontSizePx: numberField(formData, 'minFontSizePx'),
          maxFontSizePx: numberField(formData, 'maxFontSizePx'),
          defaultFontSizePx: numberField(formData, 'defaultFontSizePx'),
          uppercaseOnly: formData.get('uppercaseOnly') === 'on',
          priceModifierCents: numberField(formData, 'priceModifierCents') ?? 0,
        },
      }
    case 'center_image':
      return {
        ...base,
        geometry: { ...box, clip: stringField(formData, 'clip') || 'none' },
        constraints: {
          promptHint: stringField(formData, 'promptHint') || null,
          priceModifierCents: numberField(formData, 'priceModifierCents') ?? 0,
        },
      }
    case 'corner_ornament':
      return {
        ...base,
        geometry: { ...box, corner: stringField(formData, 'corner') },
        constraints: {
          priceModifierCents: numberField(formData, 'priceModifierCents') ?? 0,
        },
      }
    default:
      return base
  }
}

async function artworkBoundsFor(templateId: string): Promise<ArtworkBounds | null> {
  const [template] = await db
    .select({
      width: templates.baseArtworkWidth,
      height: templates.baseArtworkHeight,
    })
    .from(templates)
    .where(eq(templates.id, templateId))
    .limit(1)
  return template ?? null
}

function validateZone(
  input: unknown,
  artwork: ArtworkBounds,
): { ok: true; zone: ZoneDefinition } | { ok: false; state: FormState } {
  const result = zoneDefinitionSchemaFor(artwork).safeParse(input)
  if (!result.success) return { ok: false, state: toFieldErrors(result.error) }
  return { ok: true, zone: result.data }
}

export async function createZoneAction(
  templateId: string,
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const artwork = await artworkBoundsFor(templateId)
  if (!artwork) return { error: 'That model no longer exists.' }

  const validated = validateZone(readZoneForm(formData), artwork)
  if (!validated.ok) return validated.state

  const { zone } = validated
  await db.insert(zones).values({
    templateId,
    zoneType: zone.zoneType,
    label: zone.label,
    sortOrder: zone.sortOrder,
    isRequired: zone.isRequired,
    geometry: zone.geometry,
    constraints: zone.constraints,
  })

  revalidatePath(`/admin/templates/${templateId}`)
  return { success: `Added ${zone.label}.` }
}

export async function updateZoneAction(
  zoneId: string,
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const [existing] = await db
    .select({ templateId: zones.templateId, zoneType: zones.zoneType })
    .from(zones)
    .where(eq(zones.id, zoneId))
    .limit(1)
  if (!existing) return { error: 'That zone no longer exists.' }

  const artwork = await artworkBoundsFor(existing.templateId)
  if (!artwork) return { error: 'That model no longer exists.' }

  const input = readZoneForm(formData)
  // The zone type decides which option tables apply, so it is fixed once created.
  if ((input as { zoneType?: string }).zoneType !== existing.zoneType) {
    return { error: 'A zone cannot change type. Delete it and add a new one instead.' }
  }

  const validated = validateZone(input, artwork)
  if (!validated.ok) return validated.state

  const { zone } = validated
  await db
    .update(zones)
    .set({
      label: zone.label,
      sortOrder: zone.sortOrder,
      isRequired: zone.isRequired,
      geometry: zone.geometry,
      constraints: zone.constraints,
      updatedAt: new Date(),
    })
    .where(eq(zones.id, zoneId))

  revalidatePath(`/admin/templates/${existing.templateId}`)
  return { success: 'Zone saved.' }
}

export async function deleteZoneAction(zoneId: string): Promise<FormState> {
  await requireAdmin()

  const [existing] = await db
    .select({ templateId: zones.templateId })
    .from(zones)
    .where(eq(zones.id, zoneId))
    .limit(1)
  if (!existing) return { error: 'That zone no longer exists.' }

  try {
    await db.delete(zones).where(eq(zones.id, zoneId))
  } catch {
    return { error: 'A customer design already uses this zone, so it cannot be deleted.' }
  }

  revalidatePath(`/admin/templates/${existing.templateId}`)
  return { success: 'Zone removed.' }
}

/** Replaces the whole set of fonts a text zone offers. */
export async function setZoneFontsAction(
  zoneId: string,
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const [zone] = await db
    .select({
      templateId: zones.templateId,
      zoneType: zones.zoneType,
      geometry: zones.geometry,
    })
    .from(zones)
    .where(eq(zones.id, zoneId))
    .limit(1)
  if (!zone) return { error: 'That zone no longer exists.' }
  if (zone.zoneType !== 'top_text' && zone.zoneType !== 'bottom_text') {
    return { error: 'Only text zones use fonts.' }
  }

  const selected = z
    .array(z.uuid())
    .safeParse(formData.getAll('fontIds').filter((value) => typeof value === 'string'))
  if (!selected.success) return { error: 'That font selection is not valid.' }

  if (selected.data.length > 0) {
    const chosen = await db
      .select({ id: fonts.id, name: fonts.name, supportsCurve: fonts.supportsCurve })
      .from(fonts)
      .where(inArray(fonts.id, selected.data))

    if (chosen.length !== selected.data.length) {
      return { error: 'One of those fonts no longer exists.' }
    }

    // A face that distorts on a curve must not be offered on a curved line.
    if ((zone.geometry as TextZoneGeometry).kind === 'arc') {
      const unusable = chosen.filter((font) => !font.supportsCurve)
      if (unusable.length > 0) {
        return {
          error: `${unusable
            .map((font) => font.name)
            .join(', ')} cannot be used on a curved line. Mark the zone straight, or pick another font.`,
        }
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(zoneFontOptions).where(eq(zoneFontOptions.zoneId, zoneId))
    if (selected.data.length > 0) {
      await tx
        .insert(zoneFontOptions)
        .values(selected.data.map((fontId) => ({ zoneId, fontId })))
    }
  })

  revalidatePath(`/admin/templates/${zone.templateId}`)
  return { success: 'Fonts updated.' }
}

/** Replaces the whole set of ornaments a corner zone offers. */
export async function setZoneOrnamentsAction(
  zoneId: string,
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const [zone] = await db
    .select({ templateId: zones.templateId, zoneType: zones.zoneType })
    .from(zones)
    .where(eq(zones.id, zoneId))
    .limit(1)
  if (!zone) return { error: 'That zone no longer exists.' }
  if (zone.zoneType !== 'corner_ornament') {
    return { error: 'Only corner zones use ornaments.' }
  }

  const selected = z
    .array(z.uuid())
    .safeParse(
      formData.getAll('ornamentOptionIds').filter((value) => typeof value === 'string'),
    )
  if (!selected.success) return { error: 'That ornament selection is not valid.' }

  if (selected.data.length > 0) {
    const found = await db
      .select({ id: ornamentOptions.id })
      .from(ornamentOptions)
      .where(inArray(ornamentOptions.id, selected.data))
    if (found.length !== selected.data.length) {
      return { error: 'One of those ornaments no longer exists.' }
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(zoneOrnamentOptions).where(eq(zoneOrnamentOptions.zoneId, zoneId))
    if (selected.data.length > 0) {
      await tx
        .insert(zoneOrnamentOptions)
        .values(selected.data.map((ornamentOptionId) => ({ zoneId, ornamentOptionId })))
    }
  })

  revalidatePath(`/admin/templates/${zone.templateId}`)
  return { success: 'Ornaments updated.' }
}
