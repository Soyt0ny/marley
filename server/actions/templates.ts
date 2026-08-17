'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { templates, zones } from '@/db/schema'
import { requireAdmin } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { dollarsToCents } from '@/lib/format'
import { optionalAssetUrlSchema } from '@/lib/schema/asset'
import { BUCKLE_SHAPES, zoneFitsArtwork } from '@/lib/schema/zone'

import { toFieldErrors, type FormState } from './types'

const priceDollars = z.string().transform((value, ctx) => {
  const cents = dollarsToCents(value)
  if (cents === null || cents < 0) {
    ctx.addIssue({ code: 'custom', message: 'Enter a price like 180 or 180.50.' })
    return z.NEVER
  }
  return cents
})

const optionalText = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length === 0 ? null : value))

const templateInputSchema = z.object({
  name: z.string().trim().min(1, { error: 'Give the model a name.' }).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      error: 'Use lowercase letters, numbers and single hyphens, e.g. classic-rope-border.',
    }),
  description: optionalText,
  shapeType: z.enum(BUCKLE_SHAPES),
  baseArtworkUrl: optionalAssetUrlSchema,
  lineArtUrl: optionalAssetUrlSchema,
  baseArtworkWidth: z.coerce.number().int().min(200).max(6000),
  baseArtworkHeight: z.coerce.number().int().min(200).max(6000),
  basePriceCents: priceDollars,
})

function readTemplateForm(formData: FormData) {
  return templateInputSchema.safeParse({
    name: formData.get('name') ?? '',
    slug: formData.get('slug') ?? '',
    description: formData.get('description') ?? '',
    shapeType: formData.get('shapeType') ?? '',
    baseArtworkUrl: formData.get('baseArtworkUrl') ?? '',
    lineArtUrl: formData.get('lineArtUrl') ?? '',
    baseArtworkWidth: formData.get('baseArtworkWidth') ?? '',
    baseArtworkHeight: formData.get('baseArtworkHeight') ?? '',
    basePriceCents: formData.get('basePriceCents') ?? '',
  })
}

async function slugTakenBy(slug: string, exceptId?: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.slug, slug))
    .limit(1)
  return Boolean(existing) && existing.id !== exceptId
}

export async function createTemplateAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const parsed = readTemplateForm(formData)
  if (!parsed.success) return toFieldErrors(parsed.error)

  if (await slugTakenBy(parsed.data.slug)) {
    return { fieldErrors: { slug: ['Another model already uses this slug.'] } }
  }

  const [created] = await db
    .insert(templates)
    .values({ ...parsed.data, status: 'draft' })
    .returning({ id: templates.id })

  revalidatePath('/admin/templates')
  redirect(`/admin/templates/${created.id}`)
}

export async function updateTemplateAction(
  templateId: string,
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const parsed = readTemplateForm(formData)
  if (!parsed.success) return toFieldErrors(parsed.error)

  if (await slugTakenBy(parsed.data.slug, templateId)) {
    return { fieldErrors: { slug: ['Another model already uses this slug.'] } }
  }

  /*
   * Shrinking the artwork can push existing zones off the edge. Rather than silently storing a
   * template the customizer cannot render, refuse and name the zones that would break.
   */
  const existingZones = await db
    .select({ label: zones.label, geometry: zones.geometry })
    .from(zones)
    .where(eq(zones.templateId, templateId))

  const artwork = {
    width: parsed.data.baseArtworkWidth,
    height: parsed.data.baseArtworkHeight,
  }
  const orphaned = existingZones.filter((zone) => !zoneFitsArtwork(zone.geometry, artwork))
  if (orphaned.length > 0) {
    return {
      error: `These zones would fall outside a ${artwork.width}x${artwork.height} artwork: ${orphaned
        .map((zone) => zone.label)
        .join(', ')}. Move them first, or keep the current size.`,
    }
  }

  await db
    .update(templates)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(templates.id, templateId))

  revalidatePath('/admin/templates')
  revalidatePath(`/admin/templates/${templateId}`)
  return { success: 'Model saved.' }
}

/**
 * Publishing is what exposes a model to customers, so the prerequisites for a usable design
 * are enforced here rather than discovered by the first shopper.
 */
export async function setTemplateStatusAction(
  templateId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<FormState> {
  await requireAdmin()

  if (status === 'published') {
    const [template] = await db
      .select({ baseArtworkUrl: templates.baseArtworkUrl })
      .from(templates)
      .where(eq(templates.id, templateId))
      .limit(1)

    if (!template) return { error: 'That model no longer exists.' }
    if (!template.baseArtworkUrl) {
      return { error: 'Add the base artwork image before publishing.' }
    }

    const templateZones = await db
      .select({ zoneType: zones.zoneType })
      .from(zones)
      .where(eq(zones.templateId, templateId))

    if (templateZones.length === 0) {
      return { error: 'Add at least one zone before publishing.' }
    }
  }

  await db
    .update(templates)
    .set({ status, updatedAt: new Date() })
    .where(eq(templates.id, templateId))

  revalidatePath('/admin/templates')
  revalidatePath(`/admin/templates/${templateId}`)
  return { success: status === 'published' ? 'Model published.' : `Model set to ${status}.` }
}

export async function deleteTemplateAction(templateId: string): Promise<FormState> {
  await requireAdmin()

  // Designs reference templates with ON DELETE RESTRICT, so Postgres refuses to delete a model
  // a customer has already used. Archiving is the right move in that case.
  try {
    await db.delete(templates).where(eq(templates.id, templateId))
  } catch {
    return {
      error: 'This model has customer designs attached, so it cannot be deleted. Archive it instead.',
    }
  }

  revalidatePath('/admin/templates')
  redirect('/admin/templates')
}
