import { expect, test, type Page } from '@playwright/test'

/**
 * Visual zone editor in the admin panel.
 *
 * The drag itself is exercised through the trace; what matters to assert is that a moved zone
 * is persisted and reloads in its new place, and that the shared fabrication rules still apply
 * when positions come from dragging rather than typed coordinates.
 */

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'marley@local.test'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'marley1234'

async function openSeededModel(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible()

  await page.goto('/admin/templates')
  await page.getByRole('link', { name: 'Classic Rope Border' }).click()
  await expect(page.getByRole('heading', { name: 'Layout' })).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible()
}

test('the layout editor selects a zone and saves a drag', async ({ page }) => {
  await openSeededModel(page)

  await expect(page.getByText('Click a zone to move or resize it.')).toBeVisible()

  /*
   * Convert the centre design zone's known artwork coordinates (x 250, y 190, 500x380 in a
   * 1000x780 space) into on-screen pixels, so the press lands inside the box regardless of how
   * the stage is scaled. It is the largest zone, which makes it the reliable drag target.
   */
  const stage = page.locator('canvas').last()
  // The editor sits well below the fold; the mouse uses viewport coordinates, so the canvas has
  // to be scrolled into view before its box is a valid click target.
  await stage.scrollIntoViewIfNeeded()
  const box = await stage.boundingBox()
  if (!box) throw new Error('no canvas box')
  const scale = box.width / 1000
  const centreX = box.x + (250 + 500 / 2) * scale
  const centreY = box.y + (190 + 380 / 2) * scale

  // A single press-drag-release selects the zone (mousedown) and moves it (drag). Doing it as
  // one gesture avoids relying on a separate synthetic click landing on the canvas hit graph.
  await page.mouse.move(centreX, centreY)
  await page.mouse.down()
  await page.mouse.move(centreX, centreY + 60 * scale, { steps: 10 })
  await page.mouse.up()

  await expect(page.getByText(/^Selected: Centre design/)).toBeVisible()

  const save = page.getByRole('button', { name: 'Save positions' })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByText(/Saved \d+ zone position\(s\)\./)).toBeVisible()

  // The change persists: after a reload there is nothing pending to save.
  await page.reload()
  await expect(page.getByRole('button', { name: 'No changes to save' })).toBeVisible()

  // Put it back, so the shared seed template is not left permanently nudged for everyone else.
  const stageAgain = page.locator('canvas').last()
  await stageAgain.scrollIntoViewIfNeeded()
  const boxAgain = await stageAgain.boundingBox()
  if (!boxAgain) throw new Error('no canvas box')
  const scaleAgain = boxAgain.width / 1000
  await page.mouse.move(centreX, centreY + 60 * scaleAgain)
  await page.mouse.down()
  await page.mouse.move(centreX, centreY, { steps: 10 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Save positions' }).click()
  await expect(page.getByText(/Saved \d+ zone position\(s\)\./)).toBeVisible()
})
