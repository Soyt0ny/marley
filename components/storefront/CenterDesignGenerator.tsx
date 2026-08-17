'use client'

import Image from 'next/image'
import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'

import type { CustomizableZone } from '@/lib/queries/templates'
import type { CenterImageZoneConstraints } from '@/lib/schema/zone'
import { generateProposalsAction, type GenerateState, type Proposal } from '@/server/actions/generate'

import { TurnstileField } from './TurnstileField'

/**
 * Generation takes the better part of a minute, sometimes longer. Without a running clock and a
 * stated expectation the page looks frozen and customers press again or leave.
 */
function GeneratingNotice() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50 p-3"
    >
      <span
        aria-hidden
        className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700"
      />
      <div className="text-sm text-stone-700">
        <p className="font-medium">Drawing your ideas...</p>
        <p className="mt-0.5 text-xs text-stone-500">
          This usually takes 1 to 3 minutes. Please keep this page open
          {seconds > 0 ? ` — ${seconds}s so far` : ''}.
        </p>
      </div>
    </div>
  )
}

function GenerateButton({ hasProposals }: { hasProposals: boolean }) {
  const { pending } = useFormStatus()

  return (
    <>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
      >
        {pending
          ? 'Drawing ideas...'
          : hasProposals
            ? 'Generate more ideas'
            : 'Generate design ideas'}
      </button>
      {pending ? <GeneratingNotice /> : null}
    </>
  )
}

/**
 * Describe-and-generate control for the centre of the buckle.
 *
 * Generation costs real money per press, so it is an explicit button rather than something that
 * fires as the customer types, and the server caps how many rounds a single design may spend.
 */
export function CenterDesignGenerator({
  designId,
  zone,
  initialProposals: proposals,
  selectedProposalId,
  onProposalsChange,
  onSelect,
}: {
  designId: string
  zone: CustomizableZone
  initialProposals: Proposal[]
  selectedProposalId: string | null
  /** Lifted to the customizer, which needs the image URLs to draw the chosen design. */
  onProposalsChange: (update: (current: Proposal[]) => Proposal[]) => void
  onSelect: (proposalId: string | null) => void
}) {
  const constraints = zone.constraints as CenterImageZoneConstraints
  const [mode, setMode] = useState<'describe' | 'photo'>('describe')
  const [photoName, setPhotoName] = useState<string | null>(null)
  const [state, action] = useActionState<GenerateState, FormData>(
    generateProposalsAction.bind(null, designId),
    undefined,
  )

  // Newly generated proposals are appended to whatever the design already had.
  useEffect(() => {
    const fresh = state?.proposals
    if (!fresh) return
    onProposalsChange((current) => {
      const seen = new Set(current.map((proposal) => proposal.id))
      return [...current, ...fresh.filter((proposal) => !seen.has(proposal.id))]
    })
  }, [state, onProposalsChange])

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-stone-700">
          {zone.label}
          {zone.isRequired ? <span className="text-red-600"> *</span> : null}
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Describe what you want engraved in the middle and pick from the ideas we draw.
        </p>
      </div>

      <div className="flex gap-1 rounded-md bg-stone-100 p-1 text-sm">
        {(
          [
            ['describe', 'Describe it'],
            ['photo', 'Use my photo'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`flex-1 rounded px-3 py-1.5 transition ${
              mode === value
                ? 'bg-white font-medium text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form action={action} className="space-y-2">
        {mode === 'photo' ? (
          <div className="space-y-2">
            <label
              htmlFor={`photo-${zone.id}`}
              className="block text-xs font-medium text-stone-600"
            >
              Your photo
            </label>
            <input
              id={`photo-${zone.id}`}
              name="photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
              onChange={(event) => setPhotoName(event.target.files?.[0]?.name ?? null)}
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 file:mr-3 file:rounded file:border-0 file:bg-stone-900 file:px-3 file:py-1 file:text-sm file:text-white"
            />
            <p className="text-xs text-stone-500">
              We redraw your photo as engravable line art. A clear subject on a plain background
              works best. JPEG, PNG or WebP, up to 12 MB.
            </p>
            {photoName ? (
              <p className="text-xs text-stone-600">Selected: {photoName}</p>
            ) : null}
          </div>
        ) : null}

        <label htmlFor={`prompt-${zone.id}`} className="sr-only">
          Describe your centre design
        </label>
        <textarea
          id={`prompt-${zone.id}`}
          name="description"
          rows={3}
          maxLength={400}
          // With a photo supplied, words are an optional extra steer rather than the brief.
          required={mode === 'describe'}
          placeholder={
            mode === 'photo'
              ? 'Optional: anything to emphasise or leave out'
              : (constraints.promptHint ?? 'A longhorn skull with crossed ropes')
          }
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500"
        />
        <TurnstileField />
        <GenerateButton hasProposals={proposals.length > 0} />
      </form>

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      {state?.proposals ? (
        <p className="text-xs text-stone-500">
          {state.remaining} more idea{state.remaining === 1 ? '' : 's'} available for this
          buckle today.
        </p>
      ) : null}

      {proposals.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-stone-600">Pick one for your buckle</p>
          <div className="grid grid-cols-2 gap-2">
            {proposals.map((proposal) => {
              const selected = proposal.id === selectedProposalId
              return (
                <button
                  key={proposal.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(selected ? null : proposal.id)}
                  className={`overflow-hidden rounded-md border-2 bg-white transition ${
                    selected
                      ? 'border-stone-900 ring-2 ring-stone-900/20'
                      : 'border-stone-200 hover:border-stone-400'
                  }`}
                >
                  <Image
                    src={proposal.url}
                    alt="Generated design idea"
                    width={256}
                    height={256}
                    unoptimized
                    className="h-auto w-full"
                  />
                </button>
              )
            })}
          </div>
          {selectedProposalId ? (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-xs text-stone-500 hover:underline"
            >
              Clear selection
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
