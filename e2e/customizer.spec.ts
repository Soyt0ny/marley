import { expect, test, type Page } from '@playwright/test'

/**
 * Storefront and live-preview coverage.
 *
 * The canvas is opaque to the DOM, so as well as asserting the controls behave, this reads
 * pixels back off the Konva stage: text typed into a zone has to actually change what is drawn,
 * otherwise the "live preview" is only live in the markup.
 */

/**
 * Counts dark pixels across every Konva layer — the engraved text and details are near-black
 * over light metal, so this distinguishes "something was drawn" from "nothing changed".
 *
 * Konva puts each Layer on its own canvas, so all of them have to be summed; reading only the
 * first would sample the background artwork and always return zero.
 */
const COUNT_DARK_PIXELS = `() => {
  const canvases = Array.from(document.querySelectorAll('canvas'))
  if (canvases.length === 0) return 0
  let inked = 0
  for (const canvas of canvases) {
    const context = canvas.getContext('2d')
    if (!context || canvas.width === 0 || canvas.height === 0) continue
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 20 && data[i] < 120 && data[i + 1] < 120 && data[i + 2] < 120) inked++
    }
  }
  return inked
}`

async function inkedPixels(page: Page): Promise<number> {
  return page.evaluate(`(${COUNT_DARK_PIXELS})()`)
}

/** Waits until the drawing has changed, rather than sleeping and hoping. */
async function waitForMoreInk(page: Page, baseline: number) {
  await page.waitForFunction(
    `(${COUNT_DARK_PIXELS})() > ${baseline}`,
    undefined,
    { timeout: 5000 },
  )
}

async function startDesigning(page: Page) {
  await page.goto('/catalog')
  await page.getByRole('link', { name: /Classic Rope Border/ }).click()
  await page.getByRole('button', { name: 'Start designing' }).click()
  await expect(page).toHaveURL(/\/design\/[0-9a-f-]{36}/)
  await expect(page.getByRole('heading', { name: 'Design your buckle' })).toBeVisible()
  // Wait for the canvas to mount — it is loaded without SSR.
  await expect(page.locator('canvas').first()).toBeVisible()
}

test('the shop lists the published model', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /Custom western belt buckles/ }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Browse buckles' }).click()
  await expect(page).toHaveURL(/\/catalog$/)
  await expect(page.getByRole('heading', { name: 'Classic Rope Border' })).toBeVisible()
  await expect(page.getByText('From $180.00')).toBeVisible()
})

test('the model page explains what can be personalised', async ({ page }) => {
  await page.goto('/catalog/classic-rope-border')
  await expect(page.getByRole('heading', { name: 'Classic Rope Border' })).toBeVisible()
  await expect(page.getByText('up to 22 characters, 3 fonts')).toBeVisible()
  await expect(page.getByText('up to 16 characters, 3 fonts')).toBeVisible()
  await expect(page.getByText('a custom engraved design')).toBeVisible()
  await expect(page.getByText('4 options').first()).toBeVisible()
})

test('an unpublished model is not reachable', async ({ page }) => {
  const response = await page.goto('/catalog/does-not-exist')
  expect(response?.status()).toBe(404)
})

test('typing text changes what the canvas draws', async ({ page }) => {
  await startDesigning(page)

  const before = await inkedPixels(page)

  await page.getByLabel('Top banner').fill('Matthew 7:21')
  await expect(page.getByText('12/22')).toBeVisible()
  await waitForMoreInk(page, before)

  const afterTopText = await inkedPixels(page)
  expect(afterTopText).toBeGreaterThan(before)

  // A second line must add further ink rather than replacing the first.
  await page.getByLabel('Bottom name').fill('SANCHEZ')
  await expect(page.getByText('7/16')).toBeVisible()
  await waitForMoreInk(page, afterTopText)

  await expect(page).toHaveScreenshot('buckle-with-text.png', {
    maxDiffPixelRatio: 0.02,
    fullPage: true,
  })
})

test('fabrication limits are enforced in the controls', async ({ page }) => {
  await startDesigning(page)

  // The bottom line is uppercase-only on this model, and capped at 16 characters.
  const bottom = page.getByLabel('Bottom name')
  await bottom.fill('sanchez family ranch')
  await expect(bottom).toHaveValue('SANCHEZ FAMILY R')
  await expect(page.getByText('16/16')).toBeVisible()

  // Only the fonts Marley enabled for a curved line are offered.
  const fontOptions = await page.getByLabel('Font').first().locator('option').allInnerTexts()
  expect(fontOptions.sort()).toEqual(['Block Sans', 'Roman Serif', 'Western Slab'])
  expect(fontOptions).not.toContain('Ranch Script')
})

test('choosing a corner ornament updates the price and the canvas', async ({ page }) => {
  await startDesigning(page)
  await expect(page.getByText('$180.00')).toBeVisible()

  await page.getByRole('button', { name: 'Corners' }).click()

  const before = await inkedPixels(page)

  // Each corner ornament on this model adds $15.
  await page
    .getByRole('group', { name: 'Corner TL' })
    .getByRole('button', { name: 'Flower rosette' })
    .click()
  await expect(page.getByText('$195.00')).toBeVisible()

  await page
    .getByRole('group', { name: 'Corner TR' })
    .getByRole('button', { name: 'Ruby stone' })
    .click()
  await expect(page.getByText('$210.00')).toBeVisible()
  await expect(page.getByText(/Includes add-ons/)).toBeVisible()

  await waitForMoreInk(page, before)

  // Deselecting returns to the base price.
  await page
    .getByRole('group', { name: 'Corner TL' })
    .getByRole('button', { name: 'None' })
    .click()
  await expect(page.getByText('$195.00')).toBeVisible()
})

test('a design is saved and survives a reload', async ({ page }) => {
  await startDesigning(page)
  const designUrl = page.url()

  await page.getByLabel('Top banner').fill('Matthew 7:21')
  await page.getByLabel('Bottom name').fill('SANCHEZ')
  await page.getByLabel('Font').first().selectOption({ label: 'Block Sans' })

  await page.getByRole('button', { name: 'Corners' }).click()
  await page
    .getByRole('group', { name: 'Corner BL' })
    .getByRole('button', { name: 'Silver rivet' })
    .click()

  await page.getByRole('button', { name: 'Your buckle' }).click()
  await page.getByRole('button', { name: 'Save design' }).click()
  await expect(page.getByText('Design saved.')).toBeVisible()

  await page.goto(designUrl)
  await expect(page.getByLabel('Top banner')).toHaveValue('Matthew 7:21')
  await expect(page.getByLabel('Bottom name')).toHaveValue('SANCHEZ')
  // The chosen font persisted: its option is the one selected in the dropdown.
  await expect(
    page.getByLabel('Font').first().locator('option:checked'),
  ).toHaveText('Block Sans')
  await expect(page.getByText('$195.00')).toBeVisible()
})

test("another browser cannot open someone else's design", async ({ page, browser }) => {
  await startDesigning(page)
  const designUrl = page.url()

  // A fresh context has no signed ownership cookie for this design.
  const stranger = await browser.newContext()
  const strangerPage = await stranger.newPage()
  const response = await strangerPage.goto(designUrl)
  expect(response?.status()).toBe(404)
  await stranger.close()
})
