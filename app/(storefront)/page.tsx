import type { Metadata } from 'next'
import Link from 'next/link'

import { formatCents } from '@/lib/format'
import { SHAPE_LABELS } from '@/lib/labels'
import { loadPublishedTemplates } from '@/lib/queries/templates'

export const metadata: Metadata = {
  title: 'Marley Buckles — Custom western belt buckles',
  description:
    'Choose a buckle, add your own text and a custom engraved design, and we make it by hand.',
}

const STEPS = [
  {
    title: 'Pick a buckle',
    body: 'Each model has a real shape and size we can actually make.',
  },
  {
    title: 'Make it yours',
    body: 'Add your name, a line of text, a design for the centre, and corner details.',
  },
  {
    title: 'We check it by hand',
    body: 'Marley reviews every design before anything is cut, and confirms the price.',
  },
]

export default async function HomePage() {
  const models = await loadPublishedTemplates()

  return (
    <div className="space-y-16">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
          Custom western belt buckles, made your way
        </h1>
        <p className="mt-4 text-lg text-stone-600">
          Start from a buckle we know how to make, then put your own name, text and engraved
          design on it. Nothing gets made until it has been checked by hand.
        </p>
        <Link
          href="/catalog"
          className="mt-6 inline-block rounded-md bg-stone-900 px-5 py-2.5 font-medium text-white transition hover:bg-stone-800"
        >
          Browse buckles
        </Link>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          How it works
        </h2>
        <ol className="mt-4 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-stone-200 bg-white p-5">
              <span className="text-sm font-semibold text-stone-400">0{index + 1}</span>
              <h3 className="mt-1 font-medium text-stone-900">{step.title}</h3>
              <p className="mt-1 text-sm text-stone-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {models.length > 0 ? (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              Buckle models
            </h2>
            <Link href="/catalog" className="text-sm text-stone-600 hover:underline">
              See all
            </Link>
          </div>
          <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {models.slice(0, 3).map((model) => (
              <li key={model.id}>
                <Link
                  href={`/catalog/${model.slug}`}
                  className="block rounded-lg border border-stone-200 bg-white p-5 transition hover:border-stone-400"
                >
                  <h3 className="font-medium text-stone-900">{model.name}</h3>
                  <p className="mt-1 text-sm text-stone-500">
                    {SHAPE_LABELS[model.shapeType]}
                  </p>
                  <p className="mt-3 font-medium text-stone-900">
                    From {formatCents(model.basePriceCents)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
