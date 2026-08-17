'use client'

import { useActionState } from 'react'

import type { FormState } from '@/server/actions/types'

import { Callout, Checkbox, Field, SubmitButton, TextInput } from './ui'

export function NewFontForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
}) {
  const [state, formAction] = useActionState(action, undefined)

  return (
    <form action={formAction} className="space-y-4">
      <Callout state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" name="name" errors={state?.fieldErrors}>
          <TextInput name="name" required maxLength={80} placeholder="Western Slab" />
        </Field>
        <Field
          label="CSS font-family"
          name="cssFamily"
          hint="What the canvas draws with."
          errors={state?.fieldErrors}
        >
          <TextInput name="cssFamily" required placeholder="Georgia, serif" />
        </Field>
      </div>
      <Field
        label="Webfont file URL"
        name="fileUrl"
        hint="Loaded in the browser so text measures correctly. Optional for system fonts."
        errors={state?.fieldErrors}
      >
        <TextInput name="fileUrl" placeholder="https://..." />
      </Field>
      <Checkbox
        name="supportsCurve"
        label="Can be used on curved lines"
        defaultChecked
      />
      <SubmitButton>Add font</SubmitButton>
    </form>
  )
}

export function NewOrnamentForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
}) {
  const [state, formAction] = useActionState(action, undefined)

  return (
    <form action={formAction} className="space-y-4">
      <Callout state={state} />
      <Field label="Display name" name="name" errors={state?.fieldErrors}>
        <TextInput name="name" required maxLength={80} placeholder="Flower rosette" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Artwork URL"
          name="assetUrl"
          hint="Overlay composited into the corner."
          errors={state?.fieldErrors}
        >
          <TextInput name="assetUrl" placeholder="https://..." />
        </Field>
        <Field label="Thumbnail URL" name="thumbnailUrl" errors={state?.fieldErrors}>
          <TextInput name="thumbnailUrl" placeholder="https://..." />
        </Field>
      </div>
      <SubmitButton>Add ornament</SubmitButton>
    </form>
  )
}
