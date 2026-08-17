import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { formatCents } from '@/lib/format'
import { SHAPE_LABELS, ZONE_TYPE_LABELS } from '@/lib/labels'
import { loadTemplateBySlug } from '@/lib/queries/templates'
import type { TextZoneConstraints } from '@/lib/schema/zone'
import { startDesignAction } from '@/server/actions/designs'

export async function generateMetadata(
  props: PageProps<'/catalog/[slug]'>,
): Promise<Metadata> {
  const { slug } = await props.params
  const template = await loadTemplateBySlug(slug)
  if (!template) return { title: 'Buckle not found — Marley Buckles' }

  return {
    title: `${template.name} — Marley Buckles`,
    description: template.description ?? undefined,
  }
}

/** Plain-language summary of what a customer can change on a given zone. */
function zoneSummary(zone: {
  zoneType: keyof typeof ZONE_TYPE_LABELS
  constraints: unknown
  fonts: unknown[]
  ornaments: unknown[]
}): string {
  switch (zone.zoneType) {
    case 'top_text':
    case 'bottom_text': {
      const constraints = zone.constraints as TextZoneConstraints
      return `up to ${constraints.maxChars} characters, ${zone.fonts.length} font${
        zone.fonts.length === 1 ? '' : 's'
      }`
    }
    case 'center_image':
      return 'a custom engraved design'
    case 'corner_ornament':
      return `${zone.ornaments.length} option${zone.ornaments.length === 1 ? '' : 's'}`
  }
}

export default async function TemplateDetailPage(props: PageProps<'/catalog/[slug]'>) {
  const { slug } = await props.params
  const template = await loadTemplateBySlug(slug)

  // A draft or archived model is not for sale, so it should not be reachable by URL either.
  if (!template || template.status !== 'published') notFound()

  const startDesign = startDesignAction.bind(null, template.id)

  return (
    <div className="space-y-8">
      <Link href="/catalog" className="text-sm text-stone-500 hover:underline">
        &larr; All buckles
      </Link>

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white p-6">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            {template.name}
          </h1>
          <p className="mt-1 text-sm text-stone-500">{SHAPE_LABELS[template.shapeType]}</p>
          {template.description ? (
            <p className="mt-4 text-stone-600">{template.description}</p>
          ) : null}
          <p className="mt-6 text-2xl font-semibold text-stone-900">
            From {formatCents(template.basePriceCents)}
          </p>

          <form action={startDesign} className="mt-6">
            <button
              type="submit"
              className="w-full rounded-md bg-stone-900 px-5 py-3 font-medium text-white transition hover:bg-stone-800"
            >
              Start designing
            </button>
          </form>
          <p className="mt-3 text-xs text-stone-500">
            No payment yet — you&rsquo;ll see the full design before anything is charged.
          </p>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            What you can personalise
          </h2>
          {template.zones.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">
              This model has no personalisation set up yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {template.zones.map((zone) => (
                <li key={zone.id} className="flex items-baseline justify-between py-3">
                  <div>
                    <p className="font-medium text-stone-900">{zone.label}</p>
                    <p className="text-xs text-stone-500">{zoneSummary(zone)}</p>
                  </div>
                  <span className="text-xs text-stone-400">
                    {ZONE_TYPE_LABELS[zone.zoneType]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
