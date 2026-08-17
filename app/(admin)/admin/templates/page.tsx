import { count, desc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'

import { templates, zones } from '@/db/schema'
import { requireAdmin } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { formatCents, formatDate } from '@/lib/format'
import { SHAPE_LABELS, TEMPLATE_STATUS_LABELS } from '@/lib/labels'

export const metadata: Metadata = { title: 'Buckle models — Marley Admin' }

const STATUS_STYLES = {
  draft: 'bg-stone-100 text-stone-600',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-amber-100 text-amber-700',
} as const

export default async function TemplatesPage() {
  await requireAdmin()

  const rows = await db
    .select({
      id: templates.id,
      name: templates.name,
      slug: templates.slug,
      shapeType: templates.shapeType,
      status: templates.status,
      basePriceCents: templates.basePriceCents,
      updatedAt: templates.updatedAt,
      zoneCount: count(zones.id),
    })
    .from(templates)
    .leftJoin(zones, eq(zones.templateId, templates.id))
    .groupBy(templates.id)
    .orderBy(desc(templates.updatedAt))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Buckle models</h1>
          <p className="mt-1 text-sm text-stone-500">
            Each model defines the shape customers can order and the zones they may personalise.
          </p>
        </div>
        <Link
          href="/admin/templates/new"
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
        >
          New model
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No models yet. Create the first one to start building the catalogue.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Shape</th>
                <th className="px-4 py-3 font-medium">Zones</th>
                <th className="px-4 py-3 font-medium">Base price</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/templates/${row.id}`}
                      className="font-medium text-stone-900 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-stone-500">/{row.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{SHAPE_LABELS[row.shapeType]}</td>
                  <td className="px-4 py-3 text-stone-600">{row.zoneCount}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {formatCents(row.basePriceCents)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}
                    >
                      {TEMPLATE_STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-500">{formatDate(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
