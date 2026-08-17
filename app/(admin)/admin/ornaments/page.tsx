import { asc } from 'drizzle-orm'
import type { Metadata } from 'next'

import { ActionButton } from '@/components/admin/ActionButton'
import { NewOrnamentForm } from '@/components/admin/LibraryForms'
import { ornamentOptions } from '@/db/schema'
import { requireAdmin } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { createOrnamentAction, setOrnamentActiveAction } from '@/server/actions/libraries'

export const metadata: Metadata = { title: 'Ornaments — Marley Admin' }

export default async function OrnamentsPage() {
  await requireAdmin()

  const library = await db
    .select()
    .from(ornamentOptions)
    .orderBy(asc(ornamentOptions.name))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Corner ornaments</h1>
        <p className="mt-1 text-sm text-stone-500">
          Flowers, stones and rivets customers can pick for corner slots. Each corner zone
          offers a subset of these.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        {library.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-500">No ornaments yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {library.map((ornament) => (
              <li key={ornament.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <p className="min-w-48 font-medium text-stone-900">{ornament.name}</p>
                {!ornament.assetUrl ? (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                    No artwork yet
                  </span>
                ) : null}
                {!ornament.isActive ? (
                  <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-700">
                    Retired
                  </span>
                ) : null}
                <div className="ml-auto">
                  <ActionButton
                    action={setOrnamentActiveAction.bind(
                      null,
                      ornament.id,
                      !ornament.isActive,
                    )}
                    label={ornament.isActive ? 'Retire' : 'Re-enable'}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="rounded-lg border border-stone-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium text-stone-900">Add an ornament</h2>
        <NewOrnamentForm action={createOrnamentAction} />
      </section>
    </div>
  )
}
