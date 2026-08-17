'use client'

import { useFormStatus } from 'react-dom'

import type { FormState } from '@/server/actions/types'

const inputClasses =
  'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500 disabled:bg-stone-50'

export function Field({
  label,
  name,
  hint,
  errors,
  children,
}: {
  label: string
  name: string
  hint?: string
  errors?: Record<string, string[]>
  children: React.ReactNode
}) {
  // Field errors are keyed by the schema path, e.g. "geometry.curveRadius" for a nested value.
  const messages = Object.entries(errors ?? {})
    .filter(([key]) => key === name || key.endsWith(`.${name}`))
    .flatMap(([, value]) => value)

  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium text-stone-700">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-stone-500">{hint}</p> : null}
      {messages.map((message) => (
        <p key={message} className="text-xs text-red-600">
          {message}
        </p>
      ))}
    </div>
  )
}

export function TextInput(props: React.ComponentProps<'input'>) {
  return <input {...props} id={props.id ?? props.name} className={inputClasses} />
}

export function TextArea(props: React.ComponentProps<'textarea'>) {
  return <textarea {...props} id={props.id ?? props.name} className={inputClasses} />
}

export function Select(props: React.ComponentProps<'select'>) {
  return <select {...props} id={props.id ?? props.name} className={inputClasses} />
}

export function Checkbox({
  label,
  ...props
}: React.ComponentProps<'input'> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-stone-700">
      <input
        {...props}
        type="checkbox"
        className="size-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
      />
      {label}
    </label>
  )
}

export function SubmitButton({
  children,
  variant = 'primary',
}: {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  const { pending } = useFormStatus()
  const styles = {
    primary: 'bg-stone-900 text-white hover:bg-stone-800',
    secondary: 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
    danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  }[variant]

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${styles}`}
    >
      {pending ? 'Saving...' : children}
    </button>
  )
}

export function Callout({ state }: { state: FormState }) {
  if (!state?.error && !state?.success) return null
  const isError = Boolean(state.error)

  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={`rounded-md px-3 py-2 text-sm ${
        isError
          ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
          : 'bg-green-50 text-green-700 ring-1 ring-green-200'
      }`}
    >
      {state.error ?? state.success}
    </p>
  )
}
