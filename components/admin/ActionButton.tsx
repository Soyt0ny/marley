'use client'

import { useActionState } from 'react'

import type { FormState } from '@/server/actions/types'

/**
 * Button for actions that need no form fields, only a target id (publish, archive, delete).
 * Uses `useActionState` so a refusal — "add the artwork before publishing" — is shown rather
 * than silently discarded.
 */
export function ActionButton({
  action,
  label,
  variant = 'secondary',
  confirmMessage,
}: {
  action: () => Promise<FormState>
  label: string
  variant?: 'primary' | 'secondary' | 'danger'
  confirmMessage?: string
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async () => action(),
    undefined,
  )

  const styles = {
    primary: 'bg-stone-900 text-white hover:bg-stone-800',
    secondary: 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
    danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  }[variant]

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${styles}`}
      >
        {pending ? 'Working...' : label}
      </button>
      {state?.error ? (
        <p role="alert" className="mt-2 max-w-xs text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
