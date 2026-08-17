import type { Metadata } from 'next'
import Link from 'next/link'

import { TemplateForm } from '@/components/admin/TemplateForm'
import { requireAdmin } from '@/lib/auth/session'
import { createTemplateAction } from '@/server/actions/templates'

export const metadata: Metadata = { title: 'New model — Marley Admin' }

export default async function NewTemplatePage() {
  await requireAdmin()

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/templates" className="text-sm text-stone-500 hover:underline">
          &larr; Buckle models
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-stone-900">New buckle model</h1>
        <p className="mt-1 text-sm text-stone-500">
          Save the model first, then add the zones customers can personalise.
        </p>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-6">
        <TemplateForm
          action={createTemplateAction}
          submitLabel="Create model"
          defaultValues={{
            name: '',
            slug: '',
            description: '',
            shapeType: 'rect_cut_corners',
            baseArtworkUrl: '',
            lineArtUrl: '',
            baseArtworkWidth: 1000,
            baseArtworkHeight: 780,
            basePriceDollars: '180.00',
          }}
        />
      </div>
    </div>
  )
}
