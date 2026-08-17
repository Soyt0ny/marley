import Link from 'next/link'

import { getAdminIdentity } from '@/lib/auth/session'
import { signOutAction } from '@/server/actions/auth'

const NAV = [
  { href: '/admin', label: 'Orders' },
  { href: '/admin/templates', label: 'Buckle models' },
  { href: '/admin/fonts', label: 'Fonts' },
  { href: '/admin/ornaments', label: 'Ornaments' },
]

/**
 * Shell only. The nav is hidden when nobody is signed in so the login page renders bare — this
 * layout deliberately does NOT gate access, because a layout does not stop nested segments or
 * Server Actions from running. Each page calls `requireAdmin()` for that.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const admin = await getAdminIdentity()

  if (!admin) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/admin" className="font-semibold text-stone-900">
            Marley Admin
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-stone-600 transition hover:text-stone-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-stone-500">{admin.name}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-stone-300 px-3 py-1.5 text-stone-700 transition hover:bg-stone-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
