'use client'

import { useActionState, useState } from 'react'

import { zoneFormDefaults, type ZoneFormValues } from '@/lib/admin/zone-form'
import { CORNER_LABELS, ZONE_TYPE_LABELS } from '@/lib/labels'
import { CORNERS, LIMITS, ZONE_TYPES, type ZoneType } from '@/lib/schema/zone'
import type { FormState } from '@/server/actions/types'

import { Callout, Checkbox, Field, Select, SubmitButton, TextInput } from './ui'

/**
 * Numeric zone editor. Marley positions zones by typing coordinates here; the visual
 * drag-and-drop editor replaces this form later and writes the same fields.
 */
export function ZoneForm({
  action,
  values: initialValues,
  submitLabel,
  lockType = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  values: ZoneFormValues
  submitLabel: string
  lockType?: boolean
}) {
  const [state, formAction] = useActionState(action, undefined)

  /*
   * When adding a zone, picking a different type has to swap in that type's fields and starting
   * numbers — a corner zone needs a corner, a text zone needs character limits. Existing zones
   * keep their type (`lockType`), since the type decides which option tables apply.
   */
  const [zoneType, setZoneType] = useState<ZoneType>(initialValues.zoneType)
  const values =
    zoneType === initialValues.zoneType ? initialValues : zoneFormDefaults(zoneType)
  const isText = zoneType === 'top_text' || zoneType === 'bottom_text'

  return (
    // Remounting on type change lets the inputs pick up the new type's defaultValues.
    <form action={formAction} className="space-y-5" key={zoneType}>
      <Callout state={state} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Zone type" name="zoneType" errors={state?.fieldErrors}>
          {lockType ? (
            <>
              <input type="hidden" name="zoneType" value={values.zoneType} />
              <p className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-600">
                {ZONE_TYPE_LABELS[values.zoneType]}
              </p>
            </>
          ) : (
            <Select
              name="zoneType"
              defaultValue={values.zoneType}
              onChange={(event) => setZoneType(event.target.value as ZoneType)}
            >
              {ZONE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ZONE_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Label" name="label" errors={state?.fieldErrors}>
          <TextInput name="label" defaultValue={values.label} required maxLength={60} />
        </Field>

        <Field
          label="Sort order"
          name="sortOrder"
          hint="Lower draws first."
          errors={state?.fieldErrors}
        >
          <TextInput name="sortOrder" type="number" min={0} defaultValue={values.sortOrder} />
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-md border border-stone-200 p-4">
        <legend className="px-1 text-sm font-medium text-stone-700">
          Position on the artwork
        </legend>
        <div className="grid gap-4 sm:grid-cols-5">
          <Field label="X" name="x" errors={state?.fieldErrors}>
            <TextInput name="x" type="number" defaultValue={values.x} required />
          </Field>
          <Field label="Y" name="y" errors={state?.fieldErrors}>
            <TextInput name="y" type="number" defaultValue={values.y} required />
          </Field>
          <Field label="Width" name="width" errors={state?.fieldErrors}>
            <TextInput name="width" type="number" defaultValue={values.width} required />
          </Field>
          <Field label="Height" name="height" errors={state?.fieldErrors}>
            <TextInput name="height" type="number" defaultValue={values.height} required />
          </Field>
          <Field label="Rotation" name="rotation" errors={state?.fieldErrors}>
            <TextInput
              name="rotation"
              type="number"
              min={LIMITS.rotation.min}
              max={LIMITS.rotation.max}
              defaultValue={values.rotation}
            />
          </Field>
        </div>
      </fieldset>

      {isText ? (
        <fieldset className="space-y-4 rounded-md border border-stone-200 p-4">
          <legend className="px-1 text-sm font-medium text-stone-700">Text limits</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Baseline" name="kind" errors={state?.fieldErrors}>
              <Select name="kind" defaultValue={values.kind ?? 'straight'}>
                <option value="straight">Straight</option>
                <option value="arc">Curved</option>
              </Select>
            </Field>
            <Field
              label="Curve radius"
              name="curveRadius"
              hint="Curved only. Positive bows up, negative bows down."
              errors={state?.fieldErrors}
            >
              <TextInput
                name="curveRadius"
                type="number"
                defaultValue={values.curveRadius ?? ''}
              />
            </Field>
            <Field label="Alignment" name="align" errors={state?.fieldErrors}>
              <Select name="align" defaultValue={values.align ?? 'center'}>
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field
              label="Max characters"
              name="maxChars"
              hint={`Up to ${LIMITS.maxCharsCeiling}.`}
              errors={state?.fieldErrors}
            >
              <TextInput
                name="maxChars"
                type="number"
                min={1}
                max={LIMITS.maxCharsCeiling}
                defaultValue={values.maxChars ?? 20}
                required
              />
            </Field>
            <Field label="Min font size" name="minFontSizePx" errors={state?.fieldErrors}>
              <TextInput
                name="minFontSizePx"
                type="number"
                defaultValue={values.minFontSizePx ?? 18}
                required
              />
            </Field>
            <Field label="Max font size" name="maxFontSizePx" errors={state?.fieldErrors}>
              <TextInput
                name="maxFontSizePx"
                type="number"
                defaultValue={values.maxFontSizePx ?? 64}
                required
              />
            </Field>
            <Field
              label="Default font size"
              name="defaultFontSizePx"
              errors={state?.fieldErrors}
            >
              <TextInput
                name="defaultFontSizePx"
                type="number"
                defaultValue={values.defaultFontSizePx ?? 44}
                required
              />
            </Field>
          </div>

          <Checkbox
            name="uppercaseOnly"
            label="Force uppercase"
            defaultChecked={values.uppercaseOnly ?? false}
          />
        </fieldset>
      ) : null}

      {zoneType === 'center_image' ? (
        <fieldset className="grid gap-4 rounded-md border border-stone-200 p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium text-stone-700">Centre design</legend>
          <Field label="Mask" name="clip" errors={state?.fieldErrors}>
            <Select name="clip" defaultValue={values.clip ?? 'none'}>
              <option value="none">None</option>
              <option value="rect">Rectangle</option>
              <option value="ellipse">Ellipse</option>
            </Select>
          </Field>
          <Field
            label="Prompt hint"
            name="promptHint"
            hint="Shown to the customer as an example of what to describe."
            errors={state?.fieldErrors}
          >
            <TextInput name="promptHint" defaultValue={values.promptHint ?? ''} maxLength={200} />
          </Field>
        </fieldset>
      ) : null}

      {zoneType === 'corner_ornament' ? (
        <Field label="Corner" name="corner" errors={state?.fieldErrors}>
          <Select name="corner" defaultValue={values.corner ?? 'TL'}>
            {CORNERS.map((corner) => (
              <option key={corner} value={corner}>
                {CORNER_LABELS[corner]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Price add-on (cents)"
          name="priceModifierCents"
          hint="Added to the model's base price when the customer fills this zone."
          errors={state?.fieldErrors}
        >
          <TextInput
            name="priceModifierCents"
            type="number"
            defaultValue={values.priceModifierCents}
          />
        </Field>
        <div className="flex items-end">
          <Checkbox
            name="isRequired"
            label="Customer must fill this zone"
            defaultChecked={values.isRequired}
          />
        </div>
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  )
}
