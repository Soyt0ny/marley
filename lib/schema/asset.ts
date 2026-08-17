import { z } from 'zod'

/**
 * Where an image lives: either a full URL (Cloudflare R2, or any external host) or a
 * root-relative path served by the app itself. Both are legitimate — artwork bundled with the
 * app sits under `/public`, while anything uploaded goes to object storage.
 */
export function isUsableAssetUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true
  if (!URL.canParse(value)) return false
  const { protocol } = new URL(value)
  return protocol === 'https:' || protocol === 'http:'
}

/** Trims, treats blank as absent, and rejects anything that is not a usable image location. */
export const optionalAssetUrlSchema = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length === 0 ? null : value))
  .refine((value) => value === null || isUsableAssetUrl(value), {
    error: 'Enter a full https URL or a path starting with /, or leave it blank.',
  })
