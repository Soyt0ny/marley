import type { z } from 'zod'

/** Shape every admin form action returns, consumed by `useActionState`. */
export type FormState =
  | {
      error?: string
      fieldErrors?: Record<string, string[]>
      success?: string
    }
  | undefined

/**
 * Flattens a Zod error into the shape the forms render.
 *
 * Issues carrying a path belong to a field and are shown beside it. Issues reported at the root
 * — a whole-object rule such as "this zone falls outside the artwork" — have no field to attach
 * to, so they are surfaced in the banner instead of being silently dropped.
 */
export function toFieldErrors(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string[]> = {}
  const formErrors: string[] = []

  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.message)
      continue
    }
    const key = issue.path.join('.')
    fieldErrors[key] ??= []
    fieldErrors[key].push(issue.message)
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0

  return {
    error:
      formErrors.length > 0
        ? formErrors.join(' ')
        : hasFieldErrors
          ? 'Please fix the highlighted fields.'
          : 'That input is not valid.',
    ...(hasFieldErrors ? { fieldErrors } : {}),
  }
}
