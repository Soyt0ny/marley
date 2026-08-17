'use client'

import { useActionState } from 'react'

import { SHAPE_LABELS } from '@/lib/labels'
import { BUCKLE_SHAPES, type BuckleShape } from '@/lib/schema/zone'
import type { FormState } from '@/server/actions/types'

import { Callout, Field, Select, SubmitButton, TextArea, TextInput } from './ui'

export type TemplateFormValues = {
  name: string
  slug: string
  description: string
  shapeType: BuckleShape
  baseArtworkUrl: string
  lineArtUrl: string
  baseArtworkWidth: number
  baseArtworkHeight: number
  basePriceDollars: string
}

export function TemplateForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  defaultValues: TemplateFormValues
  submitLabel: string
}) {
  const [state, formAction] = useActionState(action, undefined)

  return (
    <form action={formAction} className="space-y-6">
      <Callout state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model name" name="name" errors={state?.fieldErrors}>
          <TextInput name="name" defaultValue={defaultValues.name} required maxLength={120} />
        </Field>

        <Field
          label="URL slug"
          name="slug"
          hint="Appears in the shop link, e.g. /catalog/classic-rope-border"
          errors={state?.fieldErrors}
        >
          <TextInput name="slug" defaultValue={defaultValues.slug} required maxLength={80} />
        </Field>
      </div>

      <Field label="Description" name="description" errors={state?.fieldErrors}>
        <TextArea name="description" defaultValue={defaultValues.description} rows={3} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Buckle shape" name="shapeType" errors={state?.fieldErrors}>
          <Select name="shapeType" defaultValue={defaultValues.shapeType}>
            {BUCKLE_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {SHAPE_LABELS[shape]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Base price (USD)"
          name="basePriceCents"
          hint="What the model costs before any zone add-ons."
          errors={state?.fieldErrors}
        >
          <TextInput
            name="basePriceCents"
            defaultValue={defaultValues.basePriceDollars}
            required
            inputMode="decimal"
          />
        </Field>
      </div>

      <Field
        label="Base artwork URL"
        name="baseArtworkUrl"
        hint="Photo or line art of the blank buckle. Required before the model can be published."
        errors={state?.fieldErrors}
      >
        <TextInput
          name="baseArtworkUrl"
          defaultValue={defaultValues.baseArtworkUrl}
          placeholder="https://..."
        />
      </Field>

      <Field
        label="Line art URL"
        name="lineArtUrl"
        hint="Black-outline version of the same blank, used for the proof. Falls back to the plain shape outline when blank."
        errors={state?.fieldErrors}
      >
        <TextInput
          name="lineArtUrl"
          defaultValue={defaultValues.lineArtUrl}
          placeholder="https://..."
        />
      </Field>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium text-stone-700">
          Artwork size in pixels
        </legend>
        <Field
          label="Width"
          name="baseArtworkWidth"
          hint="Every zone position on this model is measured in these pixels."
          errors={state?.fieldErrors}
        >
          <TextInput
            name="baseArtworkWidth"
            type="number"
            min={200}
            max={6000}
            defaultValue={defaultValues.baseArtworkWidth}
            required
          />
        </Field>
        <Field label="Height" name="baseArtworkHeight" errors={state?.fieldErrors}>
          <TextInput
            name="baseArtworkHeight"
            type="number"
            min={200}
            max={6000}
            defaultValue={defaultValues.baseArtworkHeight}
            required
          />
        </Field>
      </fieldset>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  )
}
