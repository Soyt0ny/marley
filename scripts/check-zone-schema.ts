/**
 * Guardrail check for the shared zone schema — the rule set the whole product depends on.
 *
 *   npm run test:schema
 *
 * Everything else (admin editor, customizer, renderer) trusts `lib/schema/zone.ts` to reject
 * anything unfabricable, so a regression here would let a bad design reach production. Runs
 * without a database or a browser, so it is cheap to run on every change.
 */

import { zoneDefinitionSchema, zoneDefinitionSchemaFor } from '../lib/schema/zone'

const ARTWORK = { width: 1000, height: 780 }
const schema = zoneDefinitionSchemaFor(ARTWORK)

const validTextZone = {
  zoneType: 'top_text',
  label: 'Top',
  sortOrder: 0,
  isRequired: false,
  geometry: {
    kind: 'arc',
    x: 200,
    y: 70,
    width: 600,
    height: 90,
    rotation: 0,
    align: 'center',
    curveRadius: 900,
  },
  constraints: {
    maxChars: 22,
    minFontSizePx: 18,
    maxFontSizePx: 64,
    defaultFontSizePx: 46,
    uppercaseOnly: false,
    priceModifierCents: 0,
  },
}

const withGeometry = (patch: Record<string, unknown>) => ({
  ...validTextZone,
  geometry: { ...validTextZone.geometry, ...patch },
})
const withConstraints = (patch: Record<string, unknown>) => ({
  ...validTextZone,
  constraints: { ...validTextZone.constraints, ...patch },
})

const cases: Array<[name: string, input: unknown, shouldPass: boolean]> = [
  ['a valid curved text zone', validTextZone, true],
  ['a zone running off the right edge', withGeometry({ x: 900 }), false],
  ['a zone at a negative position', withGeometry({ x: -10 }), false],
  ['a zone with negative width', withGeometry({ width: -50 }), false],
  ['a zone taller than the artwork', withGeometry({ height: 900 }), false],
  ['curved text with no radius', withGeometry({ curveRadius: null }), false],
  ['a curve too tight to engrave', withGeometry({ curveRadius: 5 }), false],
  ['more characters than a line can hold', withConstraints({ maxChars: 99 }), false],
  [
    'a minimum font size above the maximum',
    withConstraints({ minFontSizePx: 60, maxFontSizePx: 20 }),
    false,
  ],
  ['a default font size outside its range', withConstraints({ defaultFontSizePx: 200 }), false],
  ['an unknown zone type', { ...validTextZone, zoneType: 'sparkles' }, false],
]

let failures = 0

for (const [name, input, shouldPass] of cases) {
  const accepted = schema.safeParse(input).success
  const passed = accepted === shouldPass
  if (!passed) failures++
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${name} -> ${accepted ? 'accepted' : 'rejected'}`)
}

// The bounds message has no single offending field, so it must land at the root for the form to
// display it. Keyed to a field name it would be silently swallowed.
const outOfBounds = schema.safeParse(withGeometry({ x: 900 }))
const reportedAtRoot =
  !outOfBounds.success &&
  outOfBounds.error.issues.some(
    (issue) => issue.path.length === 0 && /falls outside/.test(issue.message),
  )
if (!reportedAtRoot) failures++
console.log(`${reportedAtRoot ? 'ok  ' : 'FAIL'} the bounds error is reported at form level`)

// Bounds depend on the template's artwork, so the base schema must not guess at them.
const baseIgnoresBounds = zoneDefinitionSchema.safeParse(withGeometry({ x: 900 })).success
if (!baseIgnoresBounds) failures++
console.log(
  `${baseIgnoresBounds ? 'ok  ' : 'FAIL'} the base schema leaves bounds to the artwork-bound factory`,
)

console.log(
  failures === 0
    ? '\nAll zone guardrails behave as expected.'
    : `\n${failures} unexpected result(s).`,
)
process.exit(failures === 0 ? 0 : 1)
