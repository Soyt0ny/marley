import type { Metadata } from 'next'
import Link from 'next/link'

import { formatCents } from '@/lib/format'
import { SHAPE_LABELS } from '@/lib/labels'
import { loadPublishedTemplates } from '@/lib/queries/templates'

export const metadata: Metadata = {
  title: 'Buckles — Marley Buckles',
  description: 'Every buckle model available to customise.',
}

export default async function CatalogPage() {
  const models = await loadPublishedTemplates()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Buckles</h1>
        <p className="mt-2 text-stone-600">
          Pick the shape you want. You&rsquo;ll add your text and design in the next step.
        </p>
      </div>

      {models.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">
          No buckles are listed just yet. Check back soon.
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <li key={model.id}>
              <Link
                href={`/catalog/${model.slug}`}
                className="flex h-full flex-col rounded-lg border border-stone-200 bg-white p-5 transition hover:border-stone-400"
              >
                <h2 className="font-medium text-stone-900">{model.name}</h2>
                <p className="mt-1 text-sm text-stone-500">{SHAPE_LABELS[model.shapeType]}</p>
                {model.description ? (
                  <p className="mt-3 line-clamp-3 text-sm text-stone-600">
                    {model.description}
                  </p>
                ) : null}
                <p className="mt-auto pt-4 font-medium text-stone-900">
                  From {formatCents(model.basePriceCents)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
