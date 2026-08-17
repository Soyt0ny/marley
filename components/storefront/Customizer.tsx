'use client'

import { useActionState, useMemo, useState } from 'react'

import { BucklePreview, type ZoneRenderValues } from '@/components/preview/BucklePreview'
import { useElementWidth } from '@/components/preview/useElementWidth'
import { formatCents } from '@/lib/format'
import type { CustomizableTemplate, CustomizableZone } from '@/lib/queries/templates'
import { quoteDesignCents, type TextZoneConstraints } from '@/lib/schema/zone'
import { saveDesignAction, type SaveDesignState } from '@/server/actions/designs'
import type { Proposal } from '@/server/actions/generate'

import { CenterDesignGenerator } from './CenterDesignGenerator'
import { StepNav, type StepDefinition } from './StepNav'

export type ZoneChoice =
  | { kind: 'text'; text: string; fontId: string; fontSizePx: number }
  | { kind: 'ornament'; ornamentOptionId: string }
  | { kind: 'image'; proposalId: string }

export type ZoneChoices = Record<string, ZoneChoice | undefined>

function TextZoneEditor({
  zone,
  choice,
  onChange,
}: {
  zone: CustomizableZone
  choice: Extract<ZoneChoice, { kind: 'text' }> | undefined
  onChange: (choice: ZoneChoice | undefined) => void
}) {
  const constraints = zone.constraints as TextZoneConstraints
  const text = choice?.text ?? ''
  const fontId = choice?.fontId ?? zone.fonts[0]?.id ?? ''
  const fontSizePx = choice?.fontSizePx ?? constraints.defaultFontSizePx

  if (zone.fonts.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No fonts are available for this line yet.
      </p>
    )
  }

  const update = (patch: Partial<Extract<ZoneChoice, { kind: 'text' }>>) => {
    const next = { kind: 'text' as const, text, fontId, fontSizePx, ...patch }
    // Clearing the line unfills the zone rather than storing an empty string.
    onChange(next.text.trim().length === 0 ? undefined : next)
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={`text-${zone.id}`} className="text-sm font-medium text-stone-700">
            {zone.label}
            {zone.isRequired ? <span className="text-red-600"> *</span> : null}
          </label>
          <span className="text-xs text-stone-500">
            {text.length}/{constraints.maxChars}
          </span>
        </div>
        <input
          id={`text-${zone.id}`}
          type="text"
          value={text}
          // The character cap is a fabrication limit, enforced here and again on the server.
          maxLength={constraints.maxChars}
          onChange={(event) =>
            update({
              text: constraints.uppercaseOnly
                ? event.target.value.toUpperCase()
                : event.target.value,
            })
          }
          placeholder={constraints.uppercaseOnly ? 'YOUR NAME' : 'Your text'}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900 outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`font-${zone.id}`}
            className="block text-xs font-medium text-stone-600"
          >
            Font
          </label>
          <select
            id={`font-${zone.id}`}
            value={fontId}
            onChange={(event) => update({ fontId: event.target.value })}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-stone-500"
          >
            {zone.fonts.map((font) => (
              <option key={font.id} value={font.id}>
                {font.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`size-${zone.id}`}
            className="block text-xs font-medium text-stone-600"
          >
            Size ({Math.round(fontSizePx)})
          </label>
          <input
            id={`size-${zone.id}`}
            type="range"
            min={constraints.minFontSizePx}
            max={constraints.maxFontSizePx}
            step={1}
            value={fontSizePx}
            onChange={(event) => update({ fontSizePx: Number(event.target.value) })}
            className="mt-3 w-full"
          />
        </div>
      </div>
    </div>
  )
}

function OrnamentZoneEditor({
  zone,
  choice,
  onChange,
}: {
  zone: CustomizableZone
  choice: Extract<ZoneChoice, { kind: 'ornament' }> | undefined
  onChange: (choice: ZoneChoice | undefined) => void
}) {
  if (zone.ornaments.length === 0) {
    return <p className="text-sm text-stone-500">No ornaments available for this corner.</p>
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-stone-700">{zone.label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={`rounded-md border px-3 py-1.5 text-sm transition ${
            choice === undefined
              ? 'border-stone-900 bg-stone-900 text-white'
              : 'border-stone-300 text-stone-700 hover:bg-stone-50'
          }`}
        >
          None
        </button>
        {zone.ornaments.map((ornament) => {
          const selected = choice?.ornamentOptionId === ornament.id
          return (
            <button
              key={ornament.id}
              type="button"
              onClick={() => onChange({ kind: 'ornament', ornamentOptionId: ornament.id })}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                selected
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-300 text-stone-700 hover:bg-stone-50'
              }`}
            >
              {ornament.name}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** One-line summary of a zone's current choice, for the review step. */
function describeChoice(zone: CustomizableZone, choice: ZoneChoice | undefined): string {
  if (!choice) return 'Not used'
  if (choice.kind === 'text') return choice.text
  if (choice.kind === 'ornament') {
    return (
      zone.ornaments.find((ornament) => ornament.id === choice.ornamentOptionId)?.name ??
      'Chosen'
    )
  }
  return 'Your chosen drawing'
}

export function Customizer({
  designId,
  template,
  initialChoices,
  initialProposals,
}: {
  designId: string
  template: CustomizableTemplate
  initialChoices: ZoneChoices
  initialProposals: Proposal[]
}) {
  const [choices, setChoices] = useState<ZoneChoices>(initialChoices)
  const [stepIndex, setStepIndex] = useState(0)
  // Proposal images are needed to draw the chosen one, so the list is kept alongside choices.
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals)
  const [saveState, saveAction, saving] = useActionState<SaveDesignState, FormData>(
    saveDesignAction.bind(null, designId),
    undefined,
  )
  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>()

  const setChoice = (zoneId: string, choice: ZoneChoice | undefined) => {
    setChoices((current) => ({ ...current, [zoneId]: choice }))
  }

  // Translate the customer's choices into what the renderer draws.
  const renderValues = useMemo<ZoneRenderValues>(() => {
    const values: ZoneRenderValues = {}
    for (const zone of template.zones) {
      const choice = choices[zone.id]
      if (!choice) continue

      if (choice.kind === 'text') {
        const font = zone.fonts.find((candidate) => candidate.id === choice.fontId)
        if (!font) continue
        values[zone.id] = {
          kind: 'text',
          text: choice.text,
          fontFamily: font.cssFamily,
          fontSizePx: choice.fontSizePx,
        }
      } else if (choice.kind === 'ornament') {
        const ornament = zone.ornaments.find(
          (candidate) => candidate.id === choice.ornamentOptionId,
        )
        if (!ornament) continue
        values[zone.id] = {
          kind: 'ornament',
          url: ornament.assetUrl,
          label: ornament.name,
        }
      } else {
        const proposal = proposals.find((candidate) => candidate.id === choice.proposalId)
        if (!proposal) continue
        values[zone.id] = { kind: 'image', url: proposal.url }
      }
    }
    return values
  }, [choices, template.zones, proposals])

  const filledZones = template.zones.filter((zone) => choices[zone.id] !== undefined)
  const priceCents = quoteDesignCents(template.basePriceCents, filledZones)

  const missingRequired = template.zones.filter(
    (zone) => zone.isRequired && choices[zone.id] === undefined,
  )

  const textZones = template.zones.filter(
    (zone) => zone.zoneType === 'top_text' || zone.zoneType === 'bottom_text',
  )
  const centerZones = template.zones.filter((zone) => zone.zoneType === 'center_image')
  const cornerZones = template.zones.filter((zone) => zone.zoneType === 'corner_ornament')

  /*
   * The buckle is built in the order it reads: the wording, then the corner details, then the
   * engraved centre, and finally the proof. A step with nothing to offer on a given model is
   * dropped rather than shown empty.
   */
  const steps: StepDefinition[] = [
    {
      id: 'text',
      title: 'Wording',
      hint: 'The lines across the top and bottom of your buckle.',
      available: textZones.length > 0,
      complete: textZones.some((zone) => choices[zone.id] !== undefined),
    },
    {
      id: 'corners',
      title: 'Corners',
      hint: 'Optional details in each corner.',
      available: cornerZones.length > 0,
      complete: cornerZones.some((zone) => choices[zone.id] !== undefined),
    },
    {
      id: 'centre',
      title: 'Centre design',
      hint: 'Describe it or upload a photo, then pick the drawing you like best.',
      available: centerZones.length > 0,
      complete: centerZones.every((zone) => choices[zone.id] !== undefined),
    },
    {
      id: 'proof',
      title: 'Your buckle',
      hint: 'How your buckle will be drawn up for making.',
      available: true,
      complete: missingRequired.length === 0,
    },
  ].filter((candidate) => candidate.available)

  const step = steps[Math.min(stepIndex, steps.length - 1)]
  const currentIndex = steps.indexOf(step)
  const isProofStep = step.id === 'proof'

  const artwork = {
    url: template.baseArtworkUrl,
    lineArtUrl: template.lineArtUrl,
    width: template.baseArtworkWidth,
    height: template.baseArtworkHeight,
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Sticky so the buckle stays in view while working through the steps. */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div
          ref={containerRef}
          className="overflow-hidden rounded-lg border border-stone-200 bg-white p-4"
        >
          {containerWidth > 0 ? (
            <BucklePreview
              artwork={artwork}
              shape={template.shapeType}
              zones={template.zones}
              values={renderValues}
              displayWidth={containerWidth - 32}
              /*
               * The proof is a finished drawing, so the dashed "nothing here yet" guides that
               * help while building are dropped from it.
               */
              showEmptyZones={!isProofStep}
              renderMode={isProofStep ? 'line-art' : 'metal'}
            />
          ) : null}
        </div>
        <p className="text-xs text-stone-500">
          {isProofStep
            ? 'This is the drawing Marley works from. She checks every one by hand and confirms the price before anything is made.'
            : 'A live preview of your buckle, updating as you go.'}
        </p>
      </div>

      <div className="space-y-5">
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-medium text-stone-900">{template.name}</h2>
          <p className="mt-1 text-2xl font-semibold text-stone-900">
            {formatCents(priceCents)}
          </p>
          {priceCents !== template.basePriceCents ? (
            <p className="text-xs text-stone-500">
              Includes add-ons on top of the {formatCents(template.basePriceCents)} base price.
            </p>
          ) : null}
        </div>

        <StepNav steps={steps} currentIndex={currentIndex} onSelect={setStepIndex} />

        <div className="space-y-5 rounded-lg border border-stone-200 bg-white p-5">
          <div>
            <h3 className="font-medium text-stone-900">{step.title}</h3>
            <p className="mt-0.5 text-xs text-stone-500">{step.hint}</p>
          </div>

          {step.id === 'text'
            ? textZones.map((zone) => (
                <TextZoneEditor
                  key={zone.id}
                  zone={zone}
                  choice={
                    choices[zone.id]?.kind === 'text'
                      ? (choices[zone.id] as Extract<ZoneChoice, { kind: 'text' }>)
                      : undefined
                  }
                  onChange={(choice) => setChoice(zone.id, choice)}
                />
              ))
            : null}

          {step.id === 'corners'
            ? cornerZones.map((zone) => (
                <OrnamentZoneEditor
                  key={zone.id}
                  zone={zone}
                  choice={
                    choices[zone.id]?.kind === 'ornament'
                      ? (choices[zone.id] as Extract<ZoneChoice, { kind: 'ornament' }>)
                      : undefined
                  }
                  onChange={(choice) => setChoice(zone.id, choice)}
                />
              ))
            : null}

          {step.id === 'centre'
            ? centerZones.map((zone) => {
                const choice = choices[zone.id]
                return (
                  <CenterDesignGenerator
                    key={zone.id}
                    designId={designId}
                    zone={zone}
                    initialProposals={proposals}
                    selectedProposalId={choice?.kind === 'image' ? choice.proposalId : null}
                    onProposalsChange={setProposals}
                    onSelect={(proposalId) =>
                      setChoice(zone.id, proposalId ? { kind: 'image', proposalId } : undefined)
                    }
                  />
                )
              })
            : null}

          {isProofStep ? (
            <div className="space-y-4">
              <dl className="divide-y divide-stone-100 text-sm">
                {template.zones.map((zone) => (
                  <div key={zone.id} className="flex justify-between gap-3 py-2">
                    <dt className="text-stone-500">{zone.label}</dt>
                    <dd className="text-right font-medium text-stone-900">
                      {describeChoice(zone, choices[zone.id])}
                    </dd>
                  </div>
                ))}
              </dl>

              {missingRequired.length > 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Still to fill in: {missingRequired.map((zone) => zone.label).join(', ')}.
                </p>
              ) : null}

              <form action={saveAction} className="space-y-3">
                <input
                  type="hidden"
                  name="values"
                  value={JSON.stringify(
                    Object.entries(choices)
                      .filter(([, choice]) => choice !== undefined)
                      .map(([zoneId, choice]) => ({ zoneId, ...choice! })),
                  )}
                />

                {saveState?.error ? (
                  <p role="alert" className="text-sm text-red-600">
                    {saveState.error}
                  </p>
                ) : null}
                {saveState?.success ? (
                  <p role="status" className="text-sm text-green-700">
                    {saveState.success}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-md bg-stone-900 px-4 py-2.5 font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save design'}
                </button>
              </form>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStepIndex(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm text-stone-700 transition hover:bg-stone-50 disabled:opacity-40"
          >
            Back
          </button>
          <span className="text-xs text-stone-500">
            Step {currentIndex + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={() => setStepIndex(Math.min(steps.length - 1, currentIndex + 1))}
            disabled={currentIndex === steps.length - 1}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
