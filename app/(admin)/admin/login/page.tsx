import type { Metadata } from 'next'

import { LoginForm } from '@/components/admin/LoginForm'

export const metadata: Metadata = { title: 'Sign in — Marley Admin' }

export default async function AdminLoginPage(props: PageProps<'/admin/login'>) {
  const { next } = await props.searchParams
  const target = typeof next === 'string' ? next : '/admin'

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-stone-900">Marley Admin</h1>
        <p className="mt-1 mb-6 text-sm text-stone-500">
          Sign in to manage buckle models and review orders.
        </p>
        <LoginForm next={target} />
      </div>
    </div>
  )
}
