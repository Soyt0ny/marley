import { asc } from 'drizzle-orm'
import type { Metadata } from 'next'

import { ActionButton } from '@/components/admin/ActionButton'
import { NewFontForm } from '@/components/admin/LibraryForms'
import { fonts } from '@/db/schema'
import { requireAdmin } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { createFontAction, setFontActiveAction } from '@/server/actions/libraries'

export const metadata: Metadata = { title: 'Fonts — Marley Admin' }

export default async function FontsPage() {
  await requireAdmin()

  const library = await db.select().from(fonts).orderBy(asc(fonts.name))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Fonts</h1>
        <p className="mt-1 text-sm text-stone-500">
          The faces available across models. Each text zone offers a subset of these.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        {library.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-500">No fonts yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {library.map((font) => (
              <li key={font.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-48">
                  <p
                    className="font-medium text-stone-900"
                    style={{ fontFamily: font.cssFamily }}
                  >
                    {font.name}
                  </p>
                  <p className="text-xs text-stone-500">{font.cssFamily}</p>
                </div>
                {!font.supportsCurve ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    Straight lines only
                  </span>
                ) : null}
                {!font.fileUrl ? (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                    No webfont file
                  </span>
                ) : null}
                {!font.isActive ? (
                  <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-700">
                    Retired
                  </span>
                ) : null}
                <div className="ml-auto">
                  <ActionButton
                    action={setFontActiveAction.bind(null, font.id, !font.isActive)}
                    label={font.isActive ? 'Retire' : 'Re-enable'}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="rounded-lg border border-stone-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium text-stone-900">Add a font</h2>
        <NewFontForm action={createFontAction} />
      </section>
    </div>
  )
}
