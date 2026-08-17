'use server'

import { and, eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { z } from 'zod'

import { aiImageProposals, designs } from '@/db/schema'
import {
  buildEngravingPrompt,
  buildPhotoEngravingPrompt,
  getImageProvider,
  ImageGenerationError,
  maxBatchesPerDesignPerDay,
  maxImagesPerDesignPerDay,
  PROPOSALS_PER_BATCH,
  PROPOSAL_QUALITY,
} from '@/lib/ai'
import { db } from '@/lib/db'
import { ownsDesign } from '@/lib/design-session'
import { loadDesign } from '@/lib/queries/templates'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { getImageStorage, proposalKey } from '@/lib/storage'
import { verifyTurnstile } from '@/lib/turnstile'
import { inspectUpload } from '@/lib/upload'

export type Proposal = { id: string; url: string }

export type GenerateState =
  | { error: string; proposals?: never }
  | { error?: never; proposals: Proposal[]; remaining: number }
  | undefined

/** Presses of Generate allowed per address per hour, on top of the per-design cap. */
const IP_LIMIT = 12
const IP_WINDOW_MS = 60 * 60 * 1000

const descriptionSchema = z
  .string()
  .trim()
  .min(3, { error: 'Describe the design in a few more words.' })
  .max(400, { error: 'Please keep the description under 400 characters.' })

/**
 * Generates centre-design proposals for a design.
 *
 * This is the only endpoint that spends money per press, so it is gated four ways: the design
 * must belong to this browser, the captcha must pass, the address must be under its hourly
 * limit, and the design must have generation batches left. The per-design counter is claimed
 * with a conditional UPDATE before any API call, so two simultaneous presses cannot both slip
 * past the last remaining batch.
 */
export async function generateProposalsAction(
  designId: string,
  _previousState: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  if (!(await ownsDesign(designId))) {
    return { error: 'This design belongs to a different browser session.' }
  }

  const photo = formData.get('photo')
  const hasPhoto = photo instanceof File && photo.size > 0

  const rawDescription = String(formData.get('description') ?? '')
  // With a photo to work from, a written description is an optional extra steer.
  const description = hasPhoto
    ? z.string().trim().max(400).safeParse(rawDescription)
    : descriptionSchema.safeParse(rawDescription)
  if (!description.success) {
    return { error: description.error.issues[0].message }
  }

  let source: { data: Buffer; contentType: string; filename: string } | null = null
  if (hasPhoto) {
    const bytes = Buffer.from(await photo.arrayBuffer())
    // Checked against the file's own magic numbers, not the browser-declared type.
    const inspected = inspectUpload(bytes)
    if (!inspected.ok) return { error: inspected.reason }
    source = {
      data: bytes,
      contentType: inspected.contentType,
      filename: `photo${inspected.extension}`,
    }
  }

  const requestHeaders = await headers()
  const ip = clientIp(requestHeaders)

  const token = formData.get('turnstileToken')
  const passedCaptcha = await verifyTurnstile(
    typeof token === 'string' ? token : null,
    ip === 'unknown' ? undefined : ip,
  )
  if (!passedCaptcha) {
    return { error: 'We could not verify that you are human. Please reload and try again.' }
  }

  const limit = rateLimit(`generate:${ip}`, IP_LIMIT, IP_WINDOW_MS)
  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60)
    return { error: `That is a lot of designs at once. Please try again in ${minutes} minute(s).` }
  }

  const loaded = await loadDesign(designId)
  if (!loaded) return { error: 'This design no longer exists.' }
  if (loaded.design.status === 'submitted') {
    return { error: 'This design has already been submitted for review.' }
  }

  const centreZone = loaded.template.zones.find((zone) => zone.zoneType === 'center_image')
  if (!centreZone) return { error: 'This model has no centre design to generate.' }

  /*
   * Claim one press of the allowance atomically, rolling the 24-hour window over in the same
   * statement. Doing it as a conditional UPDATE means two simultaneous presses cannot both slip
   * through the last remaining slot, and a design at its cap simply updates no rows.
   */
  const batchCap = maxBatchesPerDesignPerDay()
  const windowExpired = sql`${designs.aiGenerationWindowStartedAt} < now() - interval '1 day'`

  const [claimed] = await db
    .update(designs)
    .set({
      aiGenerationCount: sql`case when ${windowExpired} then 1 else ${designs.aiGenerationCount} + 1 end`,
      aiGenerationWindowStartedAt: sql`case when ${windowExpired} then now() else ${designs.aiGenerationWindowStartedAt} end`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(designs.id, designId),
        sql`(${windowExpired} or ${designs.aiGenerationCount} < ${batchCap})`,
      ),
    )
    .returning({ used: designs.aiGenerationCount })

  if (!claimed) {
    return {
      error: `You have used today's ${maxImagesPerDesignPerDay()} design ideas for this buckle. More become available tomorrow, or contact us and we will help you finish it.`,
    }
  }

  const prompt = source
    ? buildPhotoEngravingPrompt(description.data)
    : buildEngravingPrompt(description.data)
  const provider = getImageProvider()
  const storage = getImageStorage()

  if (source && !provider.editFromImage) {
    return { error: 'Designing from a photo is not available right now.' }
  }

  try {
    const request = {
      prompt,
      count: PROPOSALS_PER_BATCH,
      quality: PROPOSAL_QUALITY,
    }
    const images = source
      ? await provider.editFromImage!({ ...request, source })
      : await provider.generate(request)

    const stored = await Promise.all(
      images.map(async (image) => {
        const key = proposalKey(designId, image.contentType, image.data)
        // Re-hosted immediately: provider URLs expire, and an order must stay reproducible.
        const url = await storage.put(key, image.data, image.contentType)
        return { url }
      }),
    )

    const rows = await db
      .insert(aiImageProposals)
      .values(
        stored.map((entry) => ({
          designId,
          zoneId: centreZone.id,
          promptUserText: source
            ? `[from uploaded photo] ${description.data}`.trim()
            : description.data,
          promptFinalText: prompt,
          provider: provider.id,
          quality: PROPOSAL_QUALITY,
          imageUrl: entry.url,
          status: 'completed' as const,
        })),
      )
      .returning({ id: aiImageProposals.id, url: aiImageProposals.imageUrl })

    return {
      proposals: rows.map((row) => ({ id: row.id, url: row.url! })),
      // Reported in images, matching how the allowance is described to the customer.
      remaining: Math.max(0, (batchCap - claimed.used) * PROPOSALS_PER_BATCH),
    }
  } catch (error) {
    // The batch was already claimed, so record the failure rather than losing the trail.
    await db.insert(aiImageProposals).values({
      designId,
      zoneId: centreZone.id,
      promptUserText: source
        ? `[from uploaded photo] ${description.data}`.trim()
        : description.data,
      promptFinalText: prompt,
      provider: provider.id,
      quality: PROPOSAL_QUALITY,
      status: 'failed',
    })

    if (error instanceof ImageGenerationError) {
      return { error: error.customerFacing }
    }
    console.error('Unexpected failure generating proposals', error)
    return { error: 'Something went wrong generating designs. Please try again.' }
  }
}

/** Proposals already generated for a design, so returning customers keep their options. */
export async function listProposalsAction(designId: string): Promise<Proposal[]> {
  if (!(await ownsDesign(designId))) return []

  const rows = await db
    .select({ id: aiImageProposals.id, url: aiImageProposals.imageUrl })
    .from(aiImageProposals)
    .where(
      and(eq(aiImageProposals.designId, designId), eq(aiImageProposals.status, 'completed')),
    )
    .orderBy(aiImageProposals.createdAt)

  return rows.filter((row) => row.url !== null).map((row) => ({ id: row.id, url: row.url! }))
}
