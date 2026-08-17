import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

import type {
  EditRequest,
  GenerateRequest,
  GeneratedImage,
  ImageGenerationProvider,
} from './provider'

/**
 * Stand-in provider for tests and for working on the flow without spending credits.
 *
 * Draws deterministic black-on-white shapes, so it exercises the same path as the real thing —
 * bytes in, stored PNG out, composited in `multiply` — without a network call. Selected with
 * `AI_PROVIDER=mock`.
 */

const SIZE = 256

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

/** Minimal greyscale PNG encoder — avoids pulling an image library in just for fixtures. */
function encodePng(pixels: Uint8Array, size: number): Buffer {
  const raw = Buffer.alloc((size + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0 // filter type: none
    for (let x = 0; x < size; x++) {
      raw[y * (size + 1) + 1 + x] = pixels[y * size + x]
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 0 // colour type: greyscale

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A different but stable motif per prompt and index, so proposals look distinguishable. */
function drawMotif(seed: number): Buffer {
  const pixels = new Uint8Array(SIZE * SIZE).fill(255)
  const centre = SIZE / 2
  const points = 5 + (seed % 4)
  const outer = SIZE * 0.4
  const inner = outer * (0.4 + ((seed % 3) * 0.1))

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - centre
      const dy = y - centre
      const distance = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      const edge = inner + (outer - inner) * Math.abs(Math.cos((angle * points) / 2))
      // Stroke the star outline rather than filling it, mimicking engraved linework.
      if (Math.abs(distance - edge) < 4) pixels[y * SIZE + x] = 0
      if (Math.abs(distance - outer * 1.12) < 2) pixels[y * SIZE + x] = 0
    }
  }

  return encodePng(pixels, SIZE)
}

export function createMockProvider(): ImageGenerationProvider {
  const motifsFor = (seedSource: Buffer | string, count: number): GeneratedImage[] => {
    const base = createHash('sha256').update(seedSource).digest()[0]
    return Array.from({ length: count }, (_, index) => ({
      data: drawMotif(base + index),
      contentType: 'image/png',
    }))
  }

  return {
    id: 'mock:shapes',

    async generate({ prompt, count }: GenerateRequest): Promise<GeneratedImage[]> {
      return motifsFor(prompt, count)
    },

    // Seeded from the photo's bytes, so an uploaded image yields a different, stable motif.
    async editFromImage({ source, count }: EditRequest): Promise<GeneratedImage[]> {
      return motifsFor(source.data, count)
    },
  }
}
