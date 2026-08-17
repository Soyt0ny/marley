'use client'

import { useActionState } from 'react'

import { signInAction } from '@/server/actions/auth'

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, undefined)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-stone-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900 outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-stone-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900 outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500"
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-stone-900 px-4 py-2 font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
      >
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
