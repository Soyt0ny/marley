'use client'

import { useActionState } from 'react'

import type { FormState } from '@/server/actions/types'

import { Callout, SubmitButton } from './ui'

export type OptionChoice = {
  id: string
  name: string
  /** Shown as a muted note, e.g. that a font cannot be used on a curve. */
  note?: string
  disabled?: boolean
}

/**
 * Multi-select for the options a zone offers customers. Submits the full set every time, so the
 * action can replace the join rows outright rather than diffing.
 */
export function ZoneOptionsForm({
  action,
  fieldName,
  choices,
  selectedIds,
  emptyMessage,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  fieldName: 'fontIds' | 'ornamentOptionIds'
  choices: OptionChoice[]
  selectedIds: string[]
  emptyMessage: string
  submitLabel: string
}) {
  const [state, formAction] = useActionState(action, undefined)

  if (choices.length === 0) {
    return <p className="text-sm text-stone-500">{emptyMessage}</p>
  }

  return (
    <form action={formAction} className="space-y-3">
      <Callout state={state} />

      <div className="grid gap-2 sm:grid-cols-2">
        {choices.map((choice) => (
          <label
            key={choice.id}
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              choice.disabled
                ? 'border-stone-200 bg-stone-50 text-stone-400'
                : 'border-stone-200 text-stone-700'
            }`}
          >
            <input
              type="checkbox"
              name={fieldName}
              value={choice.id}
              defaultChecked={selectedIds.includes(choice.id)}
              disabled={choice.disabled}
              className="mt-0.5 size-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
            />
            <span>
              {choice.name}
              {choice.note ? (
                <span className="block text-xs text-stone-500">{choice.note}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      <SubmitButton variant="secondary">{submitLabel}</SubmitButton>
    </form>
  )
}
