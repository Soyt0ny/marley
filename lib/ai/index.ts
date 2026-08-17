import 'server-only'

import { createMockProvider } from './mock'
import { createOpenAIProvider } from './openai'
import { ImageGenerationError, type ImageGenerationProvider } from './provider'

export { buildEngravingPrompt, buildPhotoEngravingPrompt, PROMPT_VERSION } from './prompt'
export { ImageGenerationError } from './provider'
export type { GenerateRequest, ImageQuality, ImageGenerationProvider } from './provider'

/**
 * Quality proposals are generated at.
 *
 * Medium, and only medium: image generation is not reproducible, so a "draft cheaply, redo the
 * chosen one better" scheme would hand the customer a different picture from the one they
 * picked. Generating once at the quality that will be made keeps the choice honest, and at
 * roughly $0.05 an image it is a rounding error against a buckle's price.
 */
export const PROPOSAL_QUALITY = 'medium' as const

/** How many images one press of Generate returns. */
export const PROPOSALS_PER_BATCH = 2

/**
 * Images a single design may generate in a rolling 24 hours.
 *
 * Expressed in images rather than batches because that is what costs money, and what a customer
 * understands. At two per press this is four presses a day, or about $0.42 at the very most.
 */
export function maxImagesPerDesignPerDay(): number {
  const configured = Number(process.env.AI_MAX_IMAGES_PER_DESIGN_PER_DAY)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 8
}

/** The same allowance counted in presses of the button, which is what is claimed atomically. */
export function maxBatchesPerDesignPerDay(): number {
  return Math.max(1, Math.floor(maxImagesPerDesignPerDay() / PROPOSALS_PER_BATCH))
}

export function getImageProvider(): ImageGenerationProvider {
  // An explicit mock keeps tests and local UI work off the paid API.
  if (process.env.AI_PROVIDER === 'mock') return createMockProvider()

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new ImageGenerationError(
      'OPENAI_API_KEY is not set.',
      'Design generation is not configured yet.',
    )
  }

  /*
   * A real environment variable always beats .env.local, so an unrelated OPENAI_API_KEY already
   * exported by the shell silently shadows the configured one — which surfaces much later as a
   * confusing "incorrect API key" from OpenAI. Catch the mismatch here instead.
   */
  if (!apiKey.startsWith('sk-')) {
    throw new ImageGenerationError(
      'OPENAI_API_KEY does not look like an OpenAI key (expected an "sk-" prefix). ' +
        'Check whether another OPENAI_API_KEY is exported in the environment and shadowing .env.local.',
      'Design generation is not configured correctly.',
    )
  }

  return createOpenAIProvider(apiKey)
}
