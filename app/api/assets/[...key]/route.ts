import { getImageStorage } from '@/lib/storage'

/**
 * Serves stored images (AI proposals, uploaded artwork).
 *
 * Kept behind a route rather than written into `public/` because that directory is baked at
 * build time and is not writable in a standalone deployment. When storage moves to R2 these
 * URLs can be swapped for the bucket's public host without touching anything that links to them.
 */
export async function GET(_request: Request, context: RouteContext<'/api/assets/[...key]'>) {
  const { key } = await context.params
  const stored = await getImageStorage().get(key.join('/'))

  if (!stored) {
    return new Response('Not found', { status: 404 })
  }

  return new Response(new Uint8Array(stored.data), {
    headers: {
      'Content-Type': stored.contentType,
      // Content is addressed by a unique key and never rewritten, so it can be cached hard.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
