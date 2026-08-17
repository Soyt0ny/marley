/**
 * Lays out text along a circular baseline, glyph by glyph.
 *
 * Konva has no text-on-a-path primitive, so this is hand-rolled — and it is the one piece of
 * rendering maths the product depends on being identical in the browser (customer preview,
 * admin editor) and in Node (the proof image Marley approves and the shop fabricates from).
 * It is therefore kept pure: text measurement is injected, so the same function can be checked
 * without a canvas at all (see `scripts/check-curved-text.ts`).
 *
 * Coordinates are in the template artwork's pixel space, the same as zone geometry.
 */

/** Advance width of a string at the current font. Supplied by the caller's canvas context. */
export type MeasureText = (text: string) => number

export type GlyphPlacement = {
  char: string
  /** Centre of the glyph's baseline. */
  x: number
  y: number
  /** Clockwise degrees, matching canvas rotation direction. */
  rotationDeg: number
  advance: number
}

export type ArcTextLayout = {
  glyphs: GlyphPlacement[]
  /** Total advance width of the string, before bending. */
  totalWidth: number
  /** Arc the text subtends. Useful for warning that a line is wrapping around the circle. */
  sweepDeg: number
  /** True when the text is long enough relative to the radius that it self-overlaps. */
  overflows: boolean
}

/**
 * Where the cap height of the text sits inside the zone box. Baselines sit below the visual
 * middle by roughly a third of the font size, which reads as vertically centred.
 */
const BASELINE_OFFSET_RATIO = 0.35

/** Past this the text has wrapped far enough around the circle to collide with itself. */
const OVERFLOW_SWEEP_DEG = 350

export function layoutTextOnArc({
  text,
  radius,
  fontSize,
  box,
  align = 'center',
  measure,
}: {
  text: string
  /**
   * Signed radius of the baseline. Positive bows the text upward (a rainbow, as on a top
   * banner); negative bows it downward (as on a bottom banner). Larger magnitude is flatter.
   */
  radius: number
  fontSize: number
  box: { x: number; y: number; width: number; height: number }
  align?: 'left' | 'center' | 'right'
  measure: MeasureText
}): ArcTextLayout {
  const chars = Array.from(text)
  const empty: ArcTextLayout = { glyphs: [], totalWidth: 0, sweepDeg: 0, overflows: false }
  if (chars.length === 0) return empty

  const advances = chars.map(measure)
  const totalWidth = advances.reduce((sum, advance) => sum + advance, 0)

  // A zero or missing radius has no arc to follow; the caller should draw straight text.
  const r = Math.abs(radius)
  if (!Number.isFinite(r) || r === 0) return { ...empty, totalWidth }

  // Direction the arc bows: +1 up, -1 down.
  const bow = Math.sign(radius)

  const centreX = box.x + box.width / 2
  const apexY = box.y + box.height / 2 + fontSize * BASELINE_OFFSET_RATIO
  // Circle centre sits on the far side of the baseline from the bulge.
  const centreY = apexY + bow * r

  /*
   * Arc length from the apex to where the string starts.
   *
   * Centred text straddles the apex. For left and right alignment the box edge is converted
   * from a horizontal position into an arc length via asin, because bending the baseline makes
   * an arc length of N px span less than N px horizontally — measuring along the arc instead
   * would leave the text visibly short of the edge Marley aligned it to. The ratio is clamped
   * for boxes wider than the circle, where the edge is simply the quarter-turn point.
   */
  const edgeRatio = Math.min(1, Math.max(-1, box.width / 2 / r))
  const edgeOffset = r * Math.asin(edgeRatio)
  const startOffset =
    align === 'center'
      ? -totalWidth / 2
      : align === 'left'
        ? -edgeOffset
        : edgeOffset - totalWidth

  const glyphs: GlyphPlacement[] = []
  let travelled = 0

  for (const [index, char] of chars.entries()) {
    const advance = advances[index]
    // Position each glyph by its own centre so wide and narrow letters both sit square.
    const distanceFromApex = startOffset + travelled + advance / 2
    const angle = distanceFromApex / r

    glyphs.push({
      char,
      x: centreX + r * Math.sin(angle),
      y: centreY - bow * r * Math.cos(angle),
      // The glyph tilts with the tangent, mirrored when the arc bows the other way.
      rotationDeg: (bow * angle * 180) / Math.PI,
      advance,
    })

    travelled += advance
  }

  const sweepDeg = ((totalWidth / r) * 180) / Math.PI

  return { glyphs, totalWidth, sweepDeg, overflows: sweepDeg > OVERFLOW_SWEEP_DEG }
}

/**
 * Horizontal start of straight text inside its box, so straight and curved zones honour the
 * same alignment rules.
 */
export function straightTextX(
  box: { x: number; width: number },
  totalWidth: number,
  align: 'left' | 'center' | 'right',
): number {
  if (align === 'left') return box.x
  if (align === 'right') return box.x + box.width - totalWidth
  return box.x + box.width / 2 - totalWidth / 2
}

/** Baseline y for straight text, matching the curved case's vertical placement. */
export function straightTextBaselineY(
  box: { y: number; height: number },
  fontSize: number,
): number {
  return box.y + box.height / 2 + fontSize * BASELINE_OFFSET_RATIO
}

/**
 * Shrinks the font until the line fits the width it is engraved into.
 *
 * A zone is a physical area on the buckle: text that overruns it has nowhere to go on the metal,
 * so a long name has to be set smaller rather than spilling over the border. The customer picks
 * a size, and this treats it as a maximum rather than a promise.
 *
 * Advance width scales linearly with font size, so one proportional step lands almost exactly;
 * the result is re-measured and nudged down for the rounding that fonts with hinting introduce.
 */
export function fitFontSizeToWidth({
  fontSize,
  maxWidth,
  minFontSize,
  measureAt,
}: {
  fontSize: number
  maxWidth: number
  minFontSize: number
  /** Width of the string when set at the given size. */
  measureAt: (size: number) => number
}): number {
  if (maxWidth <= 0) return fontSize

  const width = measureAt(fontSize)
  if (width <= maxWidth || width === 0) return fontSize

  let candidate = Math.max(minFontSize, (fontSize * maxWidth) / width)

  // Step down in small increments if hinting leaves it a hair too wide.
  for (let attempt = 0; attempt < 8 && candidate > minFontSize; attempt++) {
    if (measureAt(candidate) <= maxWidth) break
    candidate = Math.max(minFontSize, candidate - Math.max(0.5, candidate * 0.02))
  }

  return candidate
}
