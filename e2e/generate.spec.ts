import { expect, test, type Page } from '@playwright/test'

/**
 * Centre-design generation.
 *
 * Runs against the mock provider (`AI_PROVIDER=mock`), so the whole path — prompt in, images
 * stored, proposals listed, selection composited onto the buckle — is exercised without
 * spending credits. A separate manual check covers the real OpenAI call.
 */

async function startDesigning(page: Page) {
  await page.goto('/catalog/classic-rope-border')
  await page.getByRole('button', { name: 'Start designing' }).click()
  await expect(page).toHaveURL(/\/design\/[0-9a-f-]{36}/)
  await expect(page.locator('canvas').first()).toBeVisible()

  // The customizer is stepped: wording, corners, then the centre design.
  await page.getByRole('button', { name: 'Centre design' }).click()
  await expect(page.getByRole('button', { name: 'Generate design ideas' })).toBeVisible()
}

/** Dark pixels across the Konva layers, to tell whether the chosen design was drawn. */
const COUNT_DARK_PIXELS = `() => {
  let inked = 0
  for (const canvas of document.querySelectorAll('canvas')) {
    const context = canvas.getContext('2d')
    if (!context || !canvas.width || !canvas.height) continue
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 20 && data[i] < 120 && data[i + 1] < 120 && data[i + 2] < 120) inked++
    }
  }
  return inked
}`

test('a described design produces options that can be chosen and drawn', async ({ page }) => {
  await startDesigning(page)

  const before: number = await page.evaluate(`(${COUNT_DARK_PIXELS})()`)

  await page
    .getByPlaceholder(/longhorn skull/i)
    .fill('a longhorn skull with crossed ropes')
  await page.getByRole('button', { name: 'Generate design ideas' }).click()

  // Two options come back and the remaining daily allowance is reported.
  const options = page.getByRole('button', { name: 'Generated design idea' })
  await expect(options).toHaveCount(2, { timeout: 30_000 })
  await expect(page.getByText(/more ideas? available for this buckle today/)).toBeVisible()

  // Choosing one marks it selected and puts it on the buckle.
  await options.first().click()
  await expect(options.first()).toHaveAttribute('aria-pressed', 'true')
  await page.waitForFunction(`(${COUNT_DARK_PIXELS})() > ${before}`, undefined, {
    timeout: 10_000,
  })

  // It survives a save and reload, still selected and still drawn.
  await page.getByRole('button', { name: 'Your buckle' }).click()
  await page.getByRole('button', { name: 'Save design' }).click()
  await expect(page.getByText('Design saved.')).toBeVisible()

  const designUrl = page.url()
  await page.goto(designUrl)
  await page.getByRole('button', { name: 'Centre design' }).click()
  await expect(page.getByRole('button', { name: 'Generated design idea' })).toHaveCount(2)
  await expect(
    page.getByRole('button', { name: 'Generated design idea' }).first(),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Your buckle' }).click()
  await expect(page.getByText('Still to fill in')).toBeHidden()
})

test('an empty description is refused before anything is generated', async ({ page }) => {
  await startDesigning(page)

  await page.getByPlaceholder(/longhorn skull/i).fill('ab')
  await page.getByRole('button', { name: 'Generate design ideas' }).click()
  await expect(page.getByText('Describe the design in a few more words.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generated design idea' })).toHaveCount(0)
})

test('generated images are served back from storage', async ({ page, request }) => {
  await startDesigning(page)

  await page.getByPlaceholder(/longhorn skull/i).fill('a horse head in profile')
  await page.getByRole('button', { name: 'Generate design ideas' }).click()
  await expect(page.getByRole('button', { name: 'Generated design idea' })).toHaveCount(2, {
    timeout: 30_000,
  })

  const src = await page.locator('img[alt="Generated design idea"]').first().getAttribute('src')
  expect(src).toMatch(/^\/api\/assets\/designs\//)

  const response = await request.get(src!)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  // A real PNG, not an error page.
  expect((await response.body()).subarray(1, 4).toString('ascii')).toBe('PNG')
})

test('storage refuses to serve paths outside its root', async ({ request }) => {
  const response = await request.get('/api/assets/..%2F..%2F.env.local')
  expect(response.status()).toBe(404)
})
