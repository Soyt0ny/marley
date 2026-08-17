import { asc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ActionButton } from '@/components/admin/ActionButton'
import { TemplateForm } from '@/components/admin/TemplateForm'
import { ZoneForm } from '@/components/admin/ZoneForm'
import { ZoneLayoutEditor } from '@/components/admin/ZoneLayoutEditor'
import { ZoneOptionsForm, type OptionChoice } from '@/components/admin/ZoneOptionsForm'
import { fonts, ornamentOptions, templates, zones } from '@/db/schema'
import { zoneFormDefaults, type ZoneFormValues } from '@/lib/admin/zone-form'
import { requireAdmin } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { centsToDollars, formatCents } from '@/lib/format'
import { CORNER_LABELS, TEMPLATE_STATUS_LABELS, ZONE_TYPE_LABELS } from '@/lib/labels'
import type {
  CenterImageZoneConstraints,
  CenterImageZoneGeometry,
  CornerOrnamentZoneGeometry,
  TextZoneConstraints,
  TextZoneGeometry,
} from '@/lib/schema/zone'
import {
  deleteTemplateAction,
  setTemplateStatusAction,
  updateTemplateAction,
} from '@/server/actions/templates'
import { saveZoneLayoutAction } from '@/server/actions/zone-layout'
import {
  createZoneAction,
  deleteZoneAction,
  setZoneFontsAction,
  setZoneOrnamentsAction,
  updateZoneAction,
} from '@/server/actions/zones'

export const metadata: Metadata = { title: 'Edit model — Marley Admin' }

type ZoneRow = Awaited<ReturnType<typeof loadZones>>[number]

async function loadZones(templateId: string) {
  return db.query.zones.findMany({
    where: eq(zones.templateId, templateId),
    orderBy: [asc(zones.sortOrder)],
    with: { fontOptions: true, ornamentOptions: true },
  })
}

/** Flattens a stored zone into the shape the numeric editor renders. */
function toFormValues(zone: ZoneRow): ZoneFormValues {
  const base = {
    zoneType: zone.zoneType,
    label: zone.label,
    sortOrder: zone.sortOrder,
    isRequired: zone.isRequired,
    x: zone.geometry.x,
    y: zone.geometry.y,
    width: zone.geometry.width,
    height: zone.geometry.height,
    rotation: zone.geometry.rotation,
    priceModifierCents: zone.constraints.priceModifierCents,
  }

  switch (zone.zoneType) {
    case 'top_text':
    case 'bottom_text': {
      const geometry = zone.geometry as TextZoneGeometry
      const constraints = zone.constraints as TextZoneConstraints
      return {
        ...base,
        kind: geometry.kind,
        align: geometry.align,
        curveRadius: geometry.curveRadius,
        maxChars: constraints.maxChars,
        minFontSizePx: constraints.minFontSizePx,
        maxFontSizePx: constraints.maxFontSizePx,
        defaultFontSizePx: constraints.defaultFontSizePx,
        uppercaseOnly: constraints.uppercaseOnly,
      }
    }
    case 'center_image': {
      const geometry = zone.geometry as CenterImageZoneGeometry
      const constraints = zone.constraints as CenterImageZoneConstraints
      return { ...base, clip: geometry.clip, promptHint: constraints.promptHint }
    }
    case 'corner_ornament':
      return { ...base, corner: (zone.geometry as CornerOrnamentZoneGeometry).corner }
  }
}

function zoneSummary(zone: ZoneRow): string {
  const { x, y, width, height } = zone.geometry
  const position = `${width}x${height} at ${x},${y}`

  if (zone.zoneType === 'top_text' || zone.zoneType === 'bottom_text') {
    const geometry = zone.geometry as TextZoneGeometry
    const constraints = zone.constraints as TextZoneConstraints
    const baseline = geometry.kind === 'arc' ? `curved r${geometry.curveRadius}` : 'straight'
    return `${position} · ${baseline} · up to ${constraints.maxChars} chars · ${zone.fontOptions.length} font(s)`
  }
  if (zone.zoneType === 'corner_ornament') {
    const geometry = zone.geometry as CornerOrnamentZoneGeometry
    return `${position} · ${CORNER_LABELS[geometry.corner]} · ${zone.ornamentOptions.length} ornament(s)`
  }
  return position
}

export default async function EditTemplatePage(props: PageProps<'/admin/templates/[templateId]'>) {
  await requireAdmin()
  const { templateId } = await props.params

  const [template] = await db
    .select()
    .from(templates)
    .where(eq(templates.id, templateId))
    .limit(1)

  if (!template) notFound()

  const [templateZones, fontLibrary, ornamentLibrary] = await Promise.all([
    loadZones(templateId),
    db.select().from(fonts).where(eq(fonts.isActive, true)).orderBy(asc(fonts.name)),
    db
      .select()
      .from(ornamentOptions)
      .where(eq(ornamentOptions.isActive, true))
      .orderBy(asc(ornamentOptions.name)),
  ])

  const ornamentChoices: OptionChoice[] = ornamentLibrary.map((ornament) => ({
    id: ornament.id,
    name: ornament.name,
  }))

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/templates" className="text-sm text-stone-500 hover:underline">
          &larr; Buckle models
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-stone-900">{template.name}</h1>
          <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
            {TEMPLATE_STATUS_LABELS[template.status]}
          </span>
          <span className="text-sm text-stone-500">
            {formatCents(template.basePriceCents)} base
          </span>
        </div>
      </div>

      <section className="flex flex-wrap items-start gap-3 rounded-lg border border-stone-200 bg-white p-4">
        {template.status !== 'published' ? (
          <ActionButton
            action={setTemplateStatusAction.bind(null, templateId, 'published')}
            label="Publish to shop"
            variant="primary"
          />
        ) : (
          <ActionButton
            action={setTemplateStatusAction.bind(null, templateId, 'draft')}
            label="Unpublish"
          />
        )}
        {template.status !== 'archived' ? (
          <ActionButton
            action={setTemplateStatusAction.bind(null, templateId, 'archived')}
            label="Archive"
          />
        ) : null}
        <div className="ml-auto">
          <ActionButton
            action={deleteTemplateAction.bind(null, templateId)}
            label="Delete model"
            variant="danger"
            confirmMessage={`Delete "${template.name}"? This cannot be undone.`}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-medium text-stone-900">Model details</h2>
        <TemplateForm
          action={updateTemplateAction.bind(null, templateId)}
          submitLabel="Save changes"
          defaultValues={{
            name: template.name,
            slug: template.slug,
            description: template.description ?? '',
            shapeType: template.shapeType,
            baseArtworkUrl: template.baseArtworkUrl ?? '',
            lineArtUrl: template.lineArtUrl ?? '',
            baseArtworkWidth: template.baseArtworkWidth,
            baseArtworkHeight: template.baseArtworkHeight,
            basePriceDollars: centsToDollars(template.basePriceCents),
          }}
        />
      </section>

      {templateZones.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-medium text-stone-900">Layout</h2>
            <p className="text-sm text-stone-500">
              Drag a zone to move it, or select it to resize and rotate. This is the same
              preview customers see.
            </p>
          </div>
          <ZoneLayoutEditor
            action={saveZoneLayoutAction.bind(null, templateId)}
            artwork={{
              url: template.baseArtworkUrl,
              width: template.baseArtworkWidth,
              height: template.baseArtworkHeight,
            }}
            shape={template.shapeType}
            zones={templateZones.map((zone) => ({
              id: zone.id,
              zoneType: zone.zoneType,
              label: zone.label,
              sortOrder: zone.sortOrder,
              isRequired: zone.isRequired,
              geometry: zone.geometry,
              constraints: zone.constraints,
            }))}
            sampleText={Object.fromEntries(
              templateZones.map((zone) => [
                zone.id,
                zone.zoneType === 'top_text' ? 'Matthew 7:21' : 'SANCHEZ',
              ]),
            )}
          />
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-stone-900">
            Zones ({templateZones.length})
          </h2>
          <p className="text-sm text-stone-500">
            Positions are in artwork pixels — this model&rsquo;s canvas is{' '}
            {template.baseArtworkWidth}x{template.baseArtworkHeight}.
          </p>
        </div>

        {templateZones.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            No zones yet. Add the first one below.
          </p>
        ) : (
          <ul className="space-y-3">
            {templateZones.map((zone) => {
              const isTextZone =
                zone.zoneType === 'top_text' || zone.zoneType === 'bottom_text'
              const isCurved =
                isTextZone && (zone.geometry as TextZoneGeometry).kind === 'arc'

              const fontChoices: OptionChoice[] = fontLibrary.map((font) => ({
                id: font.id,
                name: font.name,
                // A curved line cannot offer a face that distorts when bent.
                disabled: isCurved && !font.supportsCurve,
                note:
                  isCurved && !font.supportsCurve ? 'Not usable on a curved line' : undefined,
              }))

              return (
                <li
                  key={zone.id}
                  className="overflow-hidden rounded-lg border border-stone-200 bg-white"
                >
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 hover:bg-stone-50">
                      <span className="font-medium text-stone-900">{zone.label}</span>
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                        {ZONE_TYPE_LABELS[zone.zoneType]}
                      </span>
                      {zone.isRequired ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          Required
                        </span>
                      ) : null}
                      <span className="ml-auto text-xs text-stone-500">
                        {zoneSummary(zone)}
                      </span>
                    </summary>

                    <div className="space-y-6 border-t border-stone-100 px-4 py-5">
                      <ZoneForm
                        action={updateZoneAction.bind(null, zone.id)}
                        values={toFormValues(zone)}
                        submitLabel="Save zone"
                        lockType
                      />

                      {isTextZone ? (
                        <div className="space-y-2 border-t border-stone-100 pt-5">
                          <h3 className="text-sm font-medium text-stone-700">
                            Fonts offered here
                          </h3>
                          <ZoneOptionsForm
                            action={setZoneFontsAction.bind(null, zone.id)}
                            fieldName="fontIds"
                            choices={fontChoices}
                            selectedIds={zone.fontOptions.map((option) => option.fontId)}
                            emptyMessage="No fonts in the library yet."
                            submitLabel="Update fonts"
                          />
                        </div>
                      ) : null}

                      {zone.zoneType === 'corner_ornament' ? (
                        <div className="space-y-2 border-t border-stone-100 pt-5">
                          <h3 className="text-sm font-medium text-stone-700">
                            Ornaments offered here
                          </h3>
                          <ZoneOptionsForm
                            action={setZoneOrnamentsAction.bind(null, zone.id)}
                            fieldName="ornamentOptionIds"
                            choices={ornamentChoices}
                            selectedIds={zone.ornamentOptions.map(
                              (option) => option.ornamentOptionId,
                            )}
                            emptyMessage="No ornaments in the library yet."
                            submitLabel="Update ornaments"
                          />
                        </div>
                      ) : null}

                      <div className="border-t border-stone-100 pt-5">
                        <ActionButton
                          action={deleteZoneAction.bind(null, zone.id)}
                          label="Delete zone"
                          variant="danger"
                          confirmMessage={`Delete the "${zone.label}" zone?`}
                        />
                      </div>
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
        )}

        <details className="rounded-lg border border-stone-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 font-medium text-stone-900 hover:bg-stone-50">
            Add a zone
          </summary>
          <div className="border-t border-stone-100 px-4 py-5">
            <ZoneForm
              action={createZoneAction.bind(null, templateId)}
              values={zoneFormDefaults('top_text')}
              submitLabel="Add zone"
            />
          </div>
        </details>
      </section>
    </div>
  )
}
