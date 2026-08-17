/**
 * Turns a customer's description into a prompt that produces something engravable.
 *
 * Left to itself an image model returns a photograph or a finely rendered illustration. Neither
 * survives being struck into metal: an engraver works in solid shapes and bold outlines, so
 * scales, fabric creases, feather barbs and stipple shading all disappear or turn to mud at
 * buckle size. Compare the real pieces — the hockey player on the DBU buckle is a clean
 * silhouette with a handful of interior lines, not a rendering.
 *
 * The wrapper therefore pushes hard toward few, thick, well-separated lines, and away from
 * detail the metal cannot hold. Output is black on white; the renderer composites it in
 * `multiply`, so the white falls away and only the linework sits on the buckle face.
 *
 * Versioned, and the exact text used is stored with every proposal so a design stays traceable.
 */

export const PROMPT_VERSION = 'engraving-v2-bold'

const STYLE_DIRECTIVE = [
  'Simple bold black-and-white line art for engraving into a metal belt buckle.',
  'Thick confident uniform outlines and a few large solid black shapes.',
  'Heavily simplified, like a stencil, a cattle brand or a screen-printed logo.',
  'Minimal interior detail: no scales, no fur or hair strands, no fabric wrinkles or folds,',
  'no feather or wood texture, no cross-hatching, no stippling, no dots, no fine parallel lines.',
  'Pure black on pure white only: no grey, no shading, no gradients, no colour, no shadows.',
  'No photorealism, no 3D rendering, no background scenery, no frame or border,',
  'no lettering, words or numbers.',
  'One centred subject that reads clearly from an arm away, filling the frame.',
].join(' ')

/** Extra steer when the source is the customer's own photo rather than a description. */
const FROM_PHOTO_DIRECTIVE = [
  'Redraw the subject of the supplied photograph in this style.',
  'Keep the pose and the recognisable shapes, discard everything else:',
  'drop the background entirely, and reduce the subject to bold outlines and solid shapes.',
].join(' ')

/** Trims and collapses whitespace so a rambling description stays within a sane length. */
function tidy(description: string): string {
  return description.trim().replace(/\s+/g, ' ').slice(0, 400)
}

export function buildEngravingPrompt(description: string): string {
  return `${STYLE_DIRECTIVE}\n\nSubject: ${tidy(description)}`
}

/** Prompt for turning an uploaded photo into engravable line art. */
export function buildPhotoEngravingPrompt(description: string): string {
  const subject = tidy(description)
  return [
    STYLE_DIRECTIVE,
    '',
    FROM_PHOTO_DIRECTIVE,
    '',
    subject.length > 0 ? `Also take into account: ${subject}` : '',
  ]
    .join('\n')
    .trim()
}
