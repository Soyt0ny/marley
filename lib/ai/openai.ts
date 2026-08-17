import {
  ImageGenerationError,
  type EditRequest,
  type GenerateRequest,
  type GeneratedImage,
  type ImageGenerationProvider,
} from './provider'

/**
 * OpenAI image generation.
 *
 * Pinned to `gpt-image-2`: `gpt-image-1` and its variants are all scheduled for shutdown
 * (the earliest, gpt-image-1, on 23 Oct 2026) and every one of them migrates here.
 *
 * Called with `fetch` rather than the SDK — this is a single endpoint with a small payload, and
 * it keeps the dependency surface (and the bundle) smaller.
 */

const MODEL = 'gpt-image-2'
const ENDPOINT = 'https://api.openai.com/v1/images/generations'
const EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits'
/** Long enough for a batch of medium-quality images; beyond this something is wrong. */
const TIMEOUT_MS = 120_000

type OpenAIImageResponse = {
  data?: Array<{ b64_json?: string }>
  error?: { message?: string; code?: string }
}

/** Turns a response into images, or into an error worth showing the customer. */
async function readImages(response: Response): Promise<GeneratedImage[]> {
  const body = (await response.json().catch(() => ({}))) as OpenAIImageResponse

  if (!response.ok) {
    const detail = body.error?.message ?? `HTTP ${response.status}`
    // A refusal is about the customer's request, not our fault, so say so plainly.
    const isContentRefusal =
      response.status === 400 && /safety|content|policy|moderation/i.test(detail)

    throw new ImageGenerationError(
      `OpenAI rejected the request: ${detail}`,
      isContentRefusal
        ? 'That could not be turned into a design. Try describing it differently, or use another photo.'
        : 'The design service is unavailable right now. Please try again shortly.',
    )
  }

  const images = (body.data ?? [])
    .map((entry) => entry.b64_json)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => ({ data: Buffer.from(value, 'base64'), contentType: 'image/png' }))

  if (images.length === 0) {
    throw new ImageGenerationError(
      'OpenAI returned no images.',
      'No designs came back. Please try again.',
    )
  }

  return images
}

function unreachable(cause: unknown): never {
  throw new ImageGenerationError(
    `Request to OpenAI failed: ${cause instanceof Error ? cause.message : cause}`,
    'We could not reach the design service. Please try again in a moment.',
  )
}

export function createOpenAIProvider(apiKey: string): ImageGenerationProvider {
  return {
    id: `openai:${MODEL}`,

    async generate({
      prompt,
      count,
      quality,
      size = '1024x1024',
    }: GenerateRequest): Promise<GeneratedImage[]> {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          prompt,
          n: count,
          size,
          quality,
          output_format: 'png',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch(unreachable)

      return readImages(response)
    },

    /**
     * Redraws the customer's own photograph in the engraving style.
     *
     * Uses the edits endpoint with the photo as the reference image, which keeps the pose and
     * recognisable shapes while the prompt strips it back to bold outlines. Sent as multipart,
     * since the image travels as a file rather than JSON.
     */
    async editFromImage({
      prompt,
      count,
      quality,
      size = '1024x1024',
      source,
    }: EditRequest): Promise<GeneratedImage[]> {
      const form = new FormData()
      form.append('model', MODEL)
      form.append('prompt', prompt)
      form.append('n', String(count))
      form.append('size', size)
      form.append('quality', quality)
      form.append(
        'image',
        new Blob([new Uint8Array(source.data)], { type: source.contentType }),
        source.filename,
      )

      const response = await fetch(EDIT_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch(unreachable)

      return readImages(response)
    },
  }
}
