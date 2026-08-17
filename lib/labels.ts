import type { BuckleShape, Corner, ZoneType } from '@/lib/schema/zone'

/** Human wording for the closed vocabularies, kept out of the schema so it stays data-only. */

export const SHAPE_LABELS: Record<BuckleShape, string> = {
  rect_cut_corners: 'Rectangle, cut corners',
  rect_rounded: 'Rectangle, rounded',
  contoured_rect: 'Contoured rectangle',
  oval: 'Oval',
  round: 'Round',
  shield: 'Shield',
}

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  top_text: 'Top text',
  bottom_text: 'Bottom text',
  center_image: 'Centre design',
  corner_ornament: 'Corner ornament',
}

export const CORNER_LABELS: Record<Corner, string> = {
  TL: 'Top left',
  TR: 'Top right',
  BL: 'Bottom left',
  BR: 'Bottom right',
}

export const TEMPLATE_STATUS_LABELS = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
} as const
