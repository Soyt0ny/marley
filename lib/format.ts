const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}

/** Parses a price typed in dollars ("180", "180.50") into whole cents. */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim()
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) return null
  return Math.round(Number(trimmed) * 100)
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
