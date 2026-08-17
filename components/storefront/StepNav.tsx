'use client'

export type StepDefinition = {
  id: string
  title: string
  /** Shown under the title as a one-line instruction. */
  hint: string
  /** False when the step has nothing to offer on this model, and is skipped entirely. */
  available: boolean
  /** Whether the customer has done what this step asks, for the tick and the summary. */
  complete: boolean
}

/**
 * Progress rail for the guided customizer.
 *
 * Steps stay clickable in both directions: the buckle is one object, and someone who changes
 * their mind about the name after seeing the centre design should not have to start over.
 */
export function StepNav({
  steps,
  currentIndex,
  onSelect,
}: {
  steps: StepDefinition[]
  currentIndex: number
  onSelect: (index: number) => void
}) {
  return (
    <ol className="flex items-center gap-1">
      {steps.map((step, index) => {
        const current = index === currentIndex
        return (
          <li key={step.id} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-current={current ? 'step' : undefined}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                current
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                  current
                    ? 'bg-white text-stone-900'
                    : step.complete
                      ? 'bg-green-600 text-white'
                      : 'bg-stone-200 text-stone-600'
                }`}
              >
                {step.complete && !current ? '✓' : index + 1}
              </span>
              <span className="truncate">{step.title}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
