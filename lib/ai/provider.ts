/**
 * Image generation, behind an interface.
 *
 * The rest of the app only knows this shape, so swapping OpenAI for Recraft, Ideogram or a
 * self-hosted model later means adding one file — no changes to routes, storage or UI. The
 * provider name is recorded on every proposal so old designs stay traceable to what made them.
 */

export type ImageQuality = 'low' | 'medium' | 'high'

export type GenerateRequest = {
  /** Already wrapped by `buildEngravingPrompt`; providers must not re-style it. */
  prompt: string
  count: number
  quality: ImageQuality
  /** Square by default: the centre zone of a buckle is close enough to square. */
  size?: string
}

export type GeneratedImage = {
  /** Raw PNG bytes. Callers re-host these; provider URLs expire. */
  data: Buffer
  contentType: string
}

export type EditRequest = GenerateRequest & {
  /** The customer's photograph, to be redrawn as engravable line art. */
  source: { data: Buffer; contentType: string; filename: string }
}

export interface ImageGenerationProvider {
  /** Stable identifier stored on each proposal, e.g. `openai:gpt-image-2`. */
  readonly id: string
  generate(request: GenerateRequest): Promise<GeneratedImage[]>
  /** Redraws a supplied image. Providers without this capability may omit it. */
  editFromImage?(request: EditRequest): Promise<GeneratedImage[]>
}

/** Raised for problems worth showing a customer, as opposed to internal faults. */
export class ImageGenerationError extends Error {
  constructor(
    message: string,
    readonly customerFacing: string,
  ) {
    super(message)
    this.name = 'ImageGenerationError'
  }
}
