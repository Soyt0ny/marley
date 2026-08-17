import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Customizer, type ZoneChoices } from '@/components/storefront/Customizer'
import { ownsDesign } from '@/lib/design-session'
import { loadDesign } from '@/lib/queries/templates'
import { listProposalsAction } from '@/server/actions/generate'

export const metadata: Metadata = { title: 'Design your buckle — Marley Buckles' }

export default async function DesignPage(props: PageProps<'/design/[designId]'>) {
  const { designId } = await props.params

  const loaded = await loadDesign(designId)
  if (!loaded) notFound()

  /*
   * Designs are claimed by a signed cookie rather than an account. Someone else's design is
   * treated as missing rather than forbidden, which also avoids confirming that the id exists.
   * The save action repeats this check, since it is reachable by direct POST.
   */
  if (!(await ownsDesign(designId))) notFound()

  const { design, template } = loaded

  const initialChoices: ZoneChoices = {}
  for (const value of design.zoneValues) {
    if (value.textValue !== null && value.fontId !== null) {
      initialChoices[value.zoneId] = {
        kind: 'text',
        text: value.textValue,
        fontId: value.fontId,
        fontSizePx: value.fontSizePx ?? 40,
      }
    } else if (value.selectedOrnamentOptionId !== null) {
      initialChoices[value.zoneId] = {
        kind: 'ornament',
        ornamentOptionId: value.selectedOrnamentOptionId,
      }
    } else if (value.selectedProposalId !== null) {
      initialChoices[value.zoneId] = {
        kind: 'image',
        proposalId: value.selectedProposalId,
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/catalog/${template.slug}`}
          className="text-sm text-stone-500 hover:underline"
        >
          &larr; {template.name}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
          Design your buckle
        </h1>
      </div>

      <Customizer
        designId={designId}
        template={template}
        initialChoices={initialChoices}
        initialProposals={await listProposalsAction(designId)}
      />
    </div>
  )
}
