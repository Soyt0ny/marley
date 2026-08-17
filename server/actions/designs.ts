'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { designZoneValues, designs, templates } from '@/db/schema'
import { db } from '@/lib/db'
import { ownsDesign, rememberDesign } from '@/lib/design-session'
import { loadDesign, toResolvedZone } from '@/lib/queries/templates'
import { quoteDesignCents, zoneValueSchemaFor } from '@/lib/schema/zone'

import type { FormState } from './types'

/** What the customizer sends back. Validated against each zone's real rules below. */
const payloadSchema = z.array(
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('text'),
      zoneId: z.uuid(),
      text: z.string(),
      fontId: z.uuid(),
      fontSizePx: z.number(),
    }),
    z.object({
      kind: z.literal('ornament'),
      zoneId: z.uuid(),
      ornamentOptionId: z.uuid(),
    }),
    z.object({
      kind: z.literal('image'),
      zoneId: z.uuid(),
      proposalId: z.uuid(),
    }),
  ]),
)

export async function startDesignAction(templateId: string): Promise<void> {
  const [template] = await db
    .select({ id: templates.id, status: templates.status })
    .from(templates)
    .where(eq(templates.id, templateId))
    .limit(1)

  // Only a published model can be designed against; a draft is not for sale yet.
  if (!template || template.status !== 'published') {
    redirect('/catalog')
  }

  const [design] = await db
    .insert(designs)
    .values({ templateId: template.id })
    .returning({ id: designs.id })

  await rememberDesign(design.id)
  redirect(`/design/${design.id}`)
}

export type SaveDesignState =
  | (NonNullable<FormState> & { priceCents?: number })
  | undefined

/**
 * Persists the customer's choices.
 *
 * The browser already stops out-of-range input, but this is the authority: every value is
 * re-checked against the zone's own limits — character count, allowed font, allowed ornament —
 * because a Server Action is reachable by direct POST.
 */
export async function saveDesignAction(
  designId: string,
  _previousState: SaveDesignState,
  formData: FormData,
): Promise<SaveDesignState> {
  if (!(await ownsDesign(designId))) {
    return { error: 'This design belongs to a different browser session.' }
  }

  const raw = formData.get('values')
  if (typeof raw !== 'string') return { error: 'Nothing to save.' }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return { error: 'Those choices could not be read.' }
  }

  const payload = payloadSchema.safeParse(parsedJson)
  if (!payload.success) return { error: 'Those choices are not in a valid shape.' }

  const loaded = await loadDesign(designId)
  if (!loaded) return { error: 'This design no longer exists.' }
  const { design, template } = loaded

  if (design.status === 'submitted') {
    return { error: 'This design has already been submitted for review.' }
  }

  const zonesById = new Map(template.zones.map((zone) => [zone.id, zone]))
  const rows: (typeof designZoneValues.$inferInsert)[] = []

  for (const entry of payload.data) {
    const zone = zonesById.get(entry.zoneId)
    if (!zone) return { error: 'That design refers to a zone this model does not have.' }

    const schema = zoneValueSchemaFor(toResolvedZone(zone))

    if (entry.kind === 'text') {
      if (zone.zoneType !== 'top_text' && zone.zoneType !== 'bottom_text') {
        return { error: `${zone.label} does not take text.` }
      }
      const result = schema.safeParse({
        text: entry.text,
        fontId: entry.fontId,
        fontSizePx: entry.fontSizePx,
      })
      if (!result.success) {
        return { error: `${zone.label}: ${result.error.issues[0]?.message ?? 'invalid'}` }
      }
      const value = result.data as { text: string; fontId: string; fontSizePx: number }
      // An empty line is simply an unfilled zone.
      if (value.text.trim().length === 0) continue
      rows.push({
        designId,
        zoneId: zone.id,
        textValue: value.text,
        fontId: value.fontId,
        fontSizePx: Math.round(value.fontSizePx),
      })
      continue
    }

    if (entry.kind === 'ornament') {
      if (zone.zoneType !== 'corner_ornament') {
        return { error: `${zone.label} does not take an ornament.` }
      }
      const result = schema.safeParse({ ornamentOptionId: entry.ornamentOptionId })
      if (!result.success) {
        return { error: `${zone.label}: ${result.error.issues[0]?.message ?? 'invalid'}` }
      }
      rows.push({
        designId,
        zoneId: zone.id,
        selectedOrnamentOptionId: entry.ornamentOptionId,
      })
      continue
    }

    if (zone.zoneType !== 'center_image') {
      return { error: `${zone.label} does not take a generated design.` }
    }
    const result = schema.safeParse({ proposalId: entry.proposalId })
    if (!result.success) {
      return { error: `${zone.label}: ${result.error.issues[0]?.message ?? 'invalid'}` }
    }
    rows.push({ designId, zoneId: zone.id, selectedProposalId: entry.proposalId })
  }

  // Replace the whole set: anything the customer cleared is absent from the payload.
  await db.transaction(async (tx) => {
    await tx.delete(designZoneValues).where(eq(designZoneValues.designId, designId))
    if (rows.length > 0) {
      await tx.insert(designZoneValues).values(rows)
    }
    await tx.update(designs).set({ updatedAt: new Date() }).where(eq(designs.id, designId))
  })

  const filledZones = rows
    .map((row) => zonesById.get(row.zoneId!))
    .filter((zone): zone is NonNullable<typeof zone> => Boolean(zone))

  return {
    success: 'Design saved.',
    priceCents: quoteDesignCents(template.basePriceCents, filledZones),
  }
}
