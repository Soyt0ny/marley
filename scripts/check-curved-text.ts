/**
 * Checks the arc text maths without a canvas.
 *
 *   npm run test:curved-text
 *
 * The customer preview, the admin editor and the server-rendered proof all call
 * `layoutTextOnArc`. If it drifts, what Marley approves stops matching what the customer saw,
 * so the invariants are pinned here rather than left to visual inspection.
 */

import { layoutTextOnArc, straightTextX } from '../lib/render/curvedText'

const BOX = { x: 200, y: 70, width: 600, height: 90 }
const FONT_SIZE = 46
/** Fixed-width stand-in for real font metrics, so expectations stay arithmetic. */
const measure = (text: string) => Array.from(text).length * 20

let failures = 0

function check(name: string, condition: boolean, detail = '') {
  if (!condition) failures++
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function approx(a: number, b: number, tolerance = 0.001) {
  return Math.abs(a - b) <= tolerance
}

// --- Empty and degenerate input ---------------------------------------------
check('empty text produces no glyphs', layoutTextOnArc({
  text: '', radius: 900, fontSize: FONT_SIZE, box: BOX, measure,
}).glyphs.length === 0)

const zeroRadius = layoutTextOnArc({
  text: 'SANCHEZ', radius: 0, fontSize: FONT_SIZE, box: BOX, measure,
})
check('a zero radius yields no arc for the caller to draw', zeroRadius.glyphs.length === 0)
check('a zero radius still reports the measured width', zeroRadius.totalWidth === 140)

// --- Glyph count and order -------------------------------------------------
const upward = layoutTextOnArc({
  text: 'SANCHEZ', radius: 900, fontSize: FONT_SIZE, box: BOX, measure,
})
check('one placement per character', upward.glyphs.length === 7)
check(
  'characters run left to right',
  upward.glyphs.every((glyph, i) => i === 0 || glyph.x > upward.glyphs[i - 1].x),
)
check('the string is preserved', upward.glyphs.map((g) => g.char).join('') === 'SANCHEZ')

// --- Bowing upward (positive radius) ---------------------------------------
const midIndex = Math.floor(upward.glyphs.length / 2)
const apex = upward.glyphs[midIndex]
check(
  'the middle glyph sits highest when bowing up',
  upward.glyphs.every((glyph) => glyph.y >= apex.y - 0.001),
  `apex y=${apex.y.toFixed(2)}`,
)
check(
  'ends tilt in opposite directions',
  upward.glyphs[0].rotationDeg < 0 && upward.glyphs.at(-1)!.rotationDeg > 0,
)
check(
  'the layout is symmetric about the box centre',
  approx(
    upward.glyphs[0].x - BOX.x,
    BOX.x + BOX.width - upward.glyphs.at(-1)!.x,
    0.5,
  ),
)

// --- Bowing downward (negative radius) -------------------------------------
const downward = layoutTextOnArc({
  text: 'SANCHEZ', radius: -900, fontSize: FONT_SIZE, box: BOX, measure,
})
const lowest = downward.glyphs[midIndex]
check(
  'the middle glyph sits lowest when bowing down',
  downward.glyphs.every((glyph) => glyph.y <= lowest.y + 0.001),
  `lowest y=${lowest.y.toFixed(2)}`,
)
check(
  'downward text still runs left to right',
  downward.glyphs.every((glyph, i) => i === 0 || glyph.x > downward.glyphs[i - 1].x),
)
check(
  'tilt mirrors the upward case',
  approx(downward.glyphs[0].rotationDeg, -upward.glyphs[0].rotationDeg, 0.001),
)
check(
  'both directions share the same apex baseline height',
  approx(apex.y, lowest.y, 0.001),
  `up=${apex.y.toFixed(3)} down=${lowest.y.toFixed(3)}`,
)

// --- Radius magnitude ------------------------------------------------------
const flat = layoutTextOnArc({
  text: 'SANCHEZ', radius: 100000, fontSize: FONT_SIZE, box: BOX, measure,
})
const tight = layoutTextOnArc({
  text: 'SANCHEZ', radius: 200, fontSize: FONT_SIZE, box: BOX, measure,
})
const spread = (layout: typeof flat) =>
  Math.max(...layout.glyphs.map((g) => g.y)) - Math.min(...layout.glyphs.map((g) => g.y))
check(
  'a large radius is nearly flat',
  spread(flat) < 0.5,
  `vertical spread ${spread(flat).toFixed(4)}px`,
)
check(
  'a tighter radius curves more',
  spread(tight) > spread(upward) && spread(upward) > spread(flat),
  `${spread(tight).toFixed(1)} > ${spread(upward).toFixed(1)} > ${spread(flat).toFixed(2)}`,
)
check(
  'sweep angle grows as the radius shrinks',
  tight.sweepDeg > upward.sweepDeg,
  `${tight.sweepDeg.toFixed(1)}deg vs ${upward.sweepDeg.toFixed(1)}deg`,
)

// --- Overflow detection ----------------------------------------------------
check('normal text does not report overflow', !upward.overflows)
const wrapped = layoutTextOnArc({
  text: 'A VERY LONG NAME INDEED', radius: 60, fontSize: FONT_SIZE, box: BOX, measure,
})
check(
  'text wrapping around the circle is flagged',
  wrapped.overflows,
  `sweep ${wrapped.sweepDeg.toFixed(0)}deg`,
)

// --- Alignment -------------------------------------------------------------
const centred = layoutTextOnArc({
  text: 'ABC', radius: 900, fontSize: FONT_SIZE, box: BOX, align: 'center', measure,
})
const leftAligned = layoutTextOnArc({
  text: 'ABC', radius: 900, fontSize: FONT_SIZE, box: BOX, align: 'left', measure,
})
const rightAligned = layoutTextOnArc({
  text: 'ABC', radius: 900, fontSize: FONT_SIZE, box: BOX, align: 'right', measure,
})
check(
  'left aligned starts before centred',
  leftAligned.glyphs[0].x < centred.glyphs[0].x,
)
check(
  'right aligned ends after centred',
  rightAligned.glyphs.at(-1)!.x > centred.glyphs.at(-1)!.x,
)
check(
  'left aligned begins at the box edge',
  approx(leftAligned.glyphs[0].x - leftAligned.glyphs[0].advance / 2, BOX.x, 1),
)

// --- Multi-byte characters -------------------------------------------------
const accented = layoutTextOnArc({
  text: 'PIÑA', radius: 900, fontSize: FONT_SIZE, box: BOX, measure,
})
check('accented characters are not split', accented.glyphs.length === 4)
check('the accented glyph survives', accented.glyphs[2].char === 'Ñ')

// --- Straight text shares the alignment rules ------------------------------
check(
  'straight centred text is centred in the box',
  approx(straightTextX(BOX, 140, 'center'), BOX.x + BOX.width / 2 - 70),
)
check('straight left text starts at the edge', straightTextX(BOX, 140, 'left') === BOX.x)
check(
  'straight right text ends at the edge',
  straightTextX(BOX, 140, 'right') === BOX.x + BOX.width - 140,
)

console.log(
  failures === 0
    ? '\nArc text maths behaves as expected.'
    : `\n${failures} unexpected result(s).`,
)
process.exit(failures === 0 ? 0 : 1)
