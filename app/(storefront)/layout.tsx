import Link from 'next/link'

export default function StorefrontLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight text-stone-900">
            Marley Buckles
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/catalog" className="text-stone-600 transition hover:text-stone-900">
              Shop buckles
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-stone-500">
          Handmade custom belt buckles. Every design is reviewed before it is made.
        </div>
      </footer>
    </div>
  )
}
