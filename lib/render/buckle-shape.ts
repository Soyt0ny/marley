import type { BuckleShape } from '@/lib/schema/zone'

/**
 * Outline of each fabricable buckle silhouette, as SVG path data sized to the given bounds.
 *
 * Used as a stand-in while a model has no base artwork uploaded yet, so Marley can position
 * zones against something buckle-shaped instead of an empty rectangle. Once real artwork
 * exists the photo is drawn instead and this is only a faint guide.
 */
export function buckleSilhouettePath(
  shape: BuckleShape,
  width: number,
  height: number,
): string {
  const w = width
  const h = height

  switch (shape) {
    case 'rect_cut_corners': {
      const cut = Math.min(w, h) * 0.16
      return [
        `M ${cut} 0`,
        `L ${w - cut} 0`,
        `L ${w} ${cut}`,
        `L ${w} ${h - cut}`,
        `L ${w - cut} ${h}`,
        `L ${cut} ${h}`,
        `L 0 ${h - cut}`,
        `L 0 ${cut}`,
        'Z',
      ].join(' ')
    }

    case 'rect_rounded': {
      const r = Math.min(w, h) * 0.14
      return [
        `M ${r} 0`,
        `H ${w - r}`,
        `A ${r} ${r} 0 0 1 ${w} ${r}`,
        `V ${h - r}`,
        `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
        `H ${r}`,
        `A ${r} ${r} 0 0 1 0 ${h - r}`,
        `V ${r}`,
        `A ${r} ${r} 0 0 1 ${r} 0`,
        'Z',
      ].join(' ')
    }

    case 'contoured_rect': {
      // Top and bottom edges bow outward, as on the pillowed buckles.
      const bow = h * 0.09
      const r = w * 0.07
      return [
        `M ${r} ${bow}`,
        `C ${w * 0.3} 0 ${w * 0.7} 0 ${w - r} ${bow}`,
        `Q ${w} ${bow} ${w} ${h / 2}`,
        `Q ${w} ${h - bow} ${w - r} ${h - bow}`,
        `C ${w * 0.7} ${h} ${w * 0.3} ${h} ${r} ${h - bow}`,
        `Q 0 ${h - bow} 0 ${h / 2}`,
        `Q 0 ${bow} ${r} ${bow}`,
        'Z',
      ].join(' ')
    }

    case 'oval': {
      const rx = w / 2
      const ry = h / 2
      return [
        `M 0 ${ry}`,
        `A ${rx} ${ry} 0 0 1 ${w} ${ry}`,
        `A ${rx} ${ry} 0 0 1 0 ${ry}`,
        'Z',
      ].join(' ')
    }

    case 'round': {
      const radius = Math.min(w, h) / 2
      const cx = w / 2
      const cy = h / 2
      return [
        `M ${cx - radius} ${cy}`,
        `A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`,
        `A ${radius} ${radius} 0 0 1 ${cx - radius} ${cy}`,
        'Z',
      ].join(' ')
    }

    case 'shield': {
      const r = Math.min(w, h) * 0.12
      return [
        `M 0 ${r}`,
        `Q 0 0 ${r} 0`,
        `H ${w - r}`,
        `Q ${w} 0 ${w} ${r}`,
        `V ${h * 0.55}`,
        `C ${w} ${h * 0.82} ${w * 0.62} ${h} ${w / 2} ${h}`,
        `C ${w * 0.38} ${h} 0 ${h * 0.82} 0 ${h * 0.55}`,
        'Z',
      ].join(' ')
    }
  }
}
