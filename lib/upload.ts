import 'server-only'

/**
 * Validation for customer photo uploads.
 *
 * The uploaded bytes are sent straight to an image API and re-hosted, so the type is checked
 * against the file's own magic numbers rather than the client-supplied MIME type, which is
 * trivially spoofed.
 */

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

const SIGNATURES: Array<{ contentType: string; extension: string; matches: (b: Buffer) => boolean }> =
  [
    {
      contentType: 'image/png',
      extension: '.png',
      matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    },
    {
      contentType: 'image/jpeg',
      extension: '.jpg',
      matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    },
    {
      contentType: 'image/webp',
      extension: '.webp',
      matches: (b) =>
        b.subarray(0, 4).toString('ascii') === 'RIFF' &&
        b.subarray(8, 12).toString('ascii') === 'WEBP',
    },
  ]

export type InspectedUpload =
  | { ok: true; contentType: string; extension: string }
  | { ok: false; reason: string }

export function inspectUpload(data: Buffer): InspectedUpload {
  if (data.length === 0) return { ok: false, reason: 'That file is empty.' }
  if (data.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `Photos must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
    }
  }

  const match = SIGNATURES.find((signature) => signature.matches(data))
  if (!match) {
    return { ok: false, reason: 'Please upload a JPEG, PNG or WebP photo.' }
  }

  return { ok: true, contentType: match.contentType, extension: match.extension }
}
