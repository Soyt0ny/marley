'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { fonts, ornamentOptions } from '@/db/schema'
import { requireAdmin } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { optionalAssetUrlSchema as optionalUrl } from '@/lib/schema/asset'

import { toFieldErrors, type FormState } from './types'

const fontSchema = z.object({
  name: z.string().trim().min(1, { error: 'Give the font a name.' }).max(80),
  cssFamily: z
    .string()
    .trim()
    .min(1, { error: 'Enter the CSS font-family the canvas should draw with.' })
    .max(200),
  fileUrl: optionalUrl,
  supportsCurve: z.boolean(),
})

const ornamentSchema = z.object({
  name: z.string().trim().min(1, { error: 'Give the ornament a name.' }).max(80),
  assetUrl: optionalUrl,
  thumbnailUrl: optionalUrl,
})

export async function createFontAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const parsed = fontSchema.safeParse({
    name: formData.get('name') ?? '',
    cssFamily: formData.get('cssFamily') ?? '',
    fileUrl: formData.get('fileUrl') ?? '',
    supportsCurve: formData.get('supportsCurve') === 'on',
  })
  if (!parsed.success) return toFieldErrors(parsed.error)

  await db.insert(fonts).values(parsed.data)
  revalidatePath('/admin/fonts')
  return { success: `Added ${parsed.data.name}.` }
}

/**
 * Fonts are deactivated rather than deleted: a zone or a placed order may still reference one,
 * and losing it would make an existing design unrenderable.
 */
export async function setFontActiveAction(
  fontId: string,
  isActive: boolean,
): Promise<FormState> {
  await requireAdmin()

  await db
    .update(fonts)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(fonts.id, fontId))

  revalidatePath('/admin/fonts')
  return { success: isActive ? 'Font re-enabled.' : 'Font retired.' }
}

export async function createOrnamentAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin()

  const parsed = ornamentSchema.safeParse({
    name: formData.get('name') ?? '',
    assetUrl: formData.get('assetUrl') ?? '',
    thumbnailUrl: formData.get('thumbnailUrl') ?? '',
  })
  if (!parsed.success) return toFieldErrors(parsed.error)

  await db.insert(ornamentOptions).values(parsed.data)
  revalidatePath('/admin/ornaments')
  return { success: `Added ${parsed.data.name}.` }
}

export async function setOrnamentActiveAction(
  ornamentId: string,
  isActive: boolean,
): Promise<FormState> {
  await requireAdmin()

  await db
    .update(ornamentOptions)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(ornamentOptions.id, ornamentId))

  revalidatePath('/admin/ornaments')
  return { success: isActive ? 'Ornament re-enabled.' : 'Ornament retired.' }
}
