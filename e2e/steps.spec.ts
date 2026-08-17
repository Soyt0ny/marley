import { expect, test, type Page } from '@playwright/test'

/**
 * The guided, step-by-step customizer.
 *
 * Covers that each step shows only its own controls, that the buckle preview stays visible
 * throughout, and that the final step swaps to the black line-art proof — the drawing Marley
 * actually works from — with the customer's text rendered by us rather than by the image model.
 */

async function startDesigning(page: Page) {
  await page.goto('/catalog/classic-rope-border')
  await page.getByRole('button', { name: 'Start designing' }).click()
  await expect(page).toHaveURL(/\/design\/[0-9a-f-]{36}/)
  await expect(page.locator('canvas').first()).toBeVisible()
}

test('the steps show one part of the buckle at a time', async ({ page }) => {
  await startDesigning(page)

  // Step 1 of 4: wording only.
  await expect(page.getByText('Step 1 of 4')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wording' })).toBeVisible()
  await expect(page.getByLabel('Top banner')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Corner TL' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Generate design ideas' })).toBeHidden()
  // The preview is present from the first step.
  await expect(page.locator('canvas').first()).toBeVisible()

  await page.getByLabel('Top banner').fill('Matthew 7:21')
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  // Step 2: corners only.
  await expect(page.getByText('Step 2 of 4')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Corner TL' })).toBeVisible()
  await expect(page.getByLabel('Top banner')).toBeHidden()

  await page
    .getByRole('group', { name: 'Corner TL' })
    .getByRole('button', { name: 'Flower rosette' })
    .click()
  await expect(page.getByText('$195.00')).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  // Step 3: the centre design.
  await expect(page.getByText('Step 3 of 4')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate design ideas' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Corner TL' })).toBeHidden()

  await page.getByRole('button', { name: 'Next', exact: true }).click()

  // Step 4: the proof, summarising every zone.
  await expect(page.getByText('Step 4 of 4')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your buckle', exact: true })).toBeVisible()
  await expect(page.getByText('Matthew 7:21')).toBeVisible()
  await expect(page.getByText('Flower rosette')).toBeVisible()
  await expect(page.getByText(/Still to fill in: Centre design/)).toBeVisible()
  await expect(page.getByText(/This is the drawing Marley works from/)).toBeVisible()

  // Steps can be revisited directly, without losing what was entered. The rail shows a tick
  // instead of the number once a step is done, so match on the title alone.
  await page.getByRole('button', { name: /Wording/ }).click()
  await expect(page.getByLabel('Top banner')).toHaveValue('Matthew 7:21')
})

test('the proof step draws the buckle as black line art', async ({ page }) => {
  await startDesigning(page)

  await page.getByLabel('Top banner').fill('HILARIO')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your buckle', exact: true })).toBeVisible()

  /*
   * The metal preview is mostly mid-grey; the proof is ink on white. Comparing the share of
   * near-white pixels distinguishes the two without depending on exact artwork.
   */
  const whiteShare = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) throw new Error('no canvas')
    const context = canvas.getContext('2d')!
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let white = 0
    let total = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 20) continue
      total++
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) white++
    }
    return total === 0 ? 0 : white / total
  })

  expect(whiteShare).toBeGreaterThan(0.5)

  await expect(page).toHaveScreenshot('buckle-proof-line-art.png', {
    maxDiffPixelRatio: 0.02,
    fullPage: true,
  })
})

test('the centre design can be based on an uploaded photo', async ({ page }) => {
  await startDesigning(page)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Centre design' })).toBeVisible()

  await page.getByRole('button', { name: 'Use my photo' }).click()
  await expect(page.getByLabel('Your photo')).toBeVisible()

  // A 1x1 PNG is enough to prove the upload path: it is validated by magic number, not name.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.getByLabel('Your photo').setInputFiles({
    name: 'my-horse.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await page.getByRole('button', { name: 'Generate design ideas' }).click()

  const options = page.getByRole('button', { name: 'Generated design idea' })
  await expect(options).toHaveCount(2, { timeout: 30_000 })
  await options.first().click()
  await expect(options.first()).toHaveAttribute('aria-pressed', 'true')
})

test('a file that is not an image is refused', async ({ page }) => {
  await startDesigning(page)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  await page.getByRole('button', { name: 'Use my photo' }).click()
  await page.getByLabel('Your photo').setInputFiles({
    name: 'notes.png',
    // Claims to be a PNG, but the bytes say otherwise.
    mimeType: 'image/png',
    buffer: Buffer.from('this is definitely not an image', 'utf8'),
  })
  await page.getByRole('button', { name: 'Generate design ideas' }).click()

  await expect(page.getByText('Please upload a JPEG, PNG or WebP photo.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generated design idea' })).toHaveCount(0)
})
