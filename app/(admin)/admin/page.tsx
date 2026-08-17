import { count, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'

import { designs, orders, templates } from '@/db/schema'
import { requireAdmin } from '@/lib/auth/session'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Orders — Marley Admin' }

export default async function AdminDashboardPage() {
  const admin = await requireAdmin()

  const [[publishedTemplates], [draftTemplates], [designCount], [orderCount]] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(templates)
        .where(eq(templates.status, 'published')),
      db.select({ value: count() }).from(templates).where(eq(templates.status, 'draft')),
      db.select({ value: count() }).from(designs),
      db.select({ value: count() }).from(orders),
    ])

  const stats = [
    { label: 'Published models', value: publishedTemplates.value },
    { label: 'Draft models', value: draftTemplates.value },
    { label: 'Customer designs', value: designCount.value },
    { label: 'Orders', value: orderCount.value },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Welcome back, {admin.name}</h1>
        <p className="mt-1 text-sm text-stone-500">
          Orders awaiting your review will appear here.
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-stone-200 bg-white p-4">
            <dt className="text-xs uppercase tracking-wide text-stone-500">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-semibold text-stone-900">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-lg border border-dashed border-stone-300 bg-white p-8 text-center">
        <p className="text-sm text-stone-500">
          The order review queue arrives with checkout. For now, build out the catalogue.
        </p>
        <Link
          href="/admin/templates"
          className="mt-3 inline-block rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
        >
          Manage buckle models
        </Link>
      </div>
    </div>
  )
}
