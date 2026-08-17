'use server'

import { AuthError } from 'next-auth'

import { signIn, signOut } from '@/auth'

export type AuthActionState = { error: string } | undefined

/** Only same-site admin paths are accepted, so `?next=` cannot become an open redirect. */
function safeRedirectTarget(value: FormDataEntryValue | null): string {
  const target = typeof value === 'string' ? value : ''
  return target.startsWith('/admin') && !target.startsWith('/admin/login') ? target : '/admin'
}

export async function signInAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: safeRedirectTarget(formData.get('next')),
    })
  } catch (error) {
    // A successful sign-in throws a redirect, which must be allowed to propagate.
    if (error instanceof AuthError) {
      return { error: 'Wrong email or password.' }
    }
    throw error
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/admin/login' })
}
