import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Where generated and uploaded images live.
 *
 * Disk-backed, served through `/api/assets`. On the VPS that is a mounted Docker volume, which
 * is a perfectly good home for a shop this size. Swapping in Cloudflare R2 later means adding
 * one implementation of this interface — nothing else in the app knows where bytes are kept.
 */

export interface ImageStorage {
  /** Stores bytes and returns the URL the app should serve them from. */
  put(key: string, data: Buffer, contentType: string): Promise<string>
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>
}

const STORAGE_ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve(process.cwd(), '.storage')

/** Keys are app-generated, but resolve and re-check anyway so `..` can never escape the root. */
function resolveWithinRoot(key: string): string | null {
  const target = path.resolve(STORAGE_ROOT, key)
  const root = STORAGE_ROOT.endsWith(path.sep) ? STORAGE_ROOT : STORAGE_ROOT + path.sep
  return target === STORAGE_ROOT || target.startsWith(root) ? target : null
}

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

export const diskStorage: ImageStorage = {
  // The content type is carried in the key's extension, so the disk backend does not need it;
  // an object-store backend would send it as metadata.
  async put(key, data) {
    const target = resolveWithinRoot(key)
    if (!target) throw new Error(`Refusing to write outside the storage root: ${key}`)

    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, data)
    return `/api/assets/${key.split(path.sep).join('/')}`
  },

  async get(key) {
    const target = resolveWithinRoot(key)
    if (!target) return null

    try {
      const data = await readFile(target)
      const contentType = CONTENT_TYPES[path.extname(target).toLowerCase()]
      return { data, contentType: contentType ?? 'application/octet-stream' }
    } catch {
      return null
    }
  },
}

export function getImageStorage(): ImageStorage {
  return diskStorage
}

/**
 * Key for one generated proposal. Grouped by design so everything for an order can be found,
 * and suffixed with a content hash so identical bytes never collide across designs.
 */
export function proposalKey(designId: string, contentType: string, data: Buffer): string {
  const extension = EXTENSIONS[contentType] ?? '.bin'
  const digest = createHash('sha256').update(data).digest('hex').slice(0, 12)
  return `designs/${designId}/${randomUUID()}-${digest}${extension}`
}
