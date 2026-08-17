import { expect, test, type Page } from '@playwright/test'

/**
 * Covers the admin flow end to end against the real database.
 *
 * Prerequisites: `docker compose up -d`, `npm run db:migrate`, `npm run db:seed`.
 *
 * Beyond the happy path, this asserts the fabrication guardrails actually reach the screen —
 * a zone dragged off the artwork and an unpublishable model must be refused with a message,
 * not silently accepted.
 */

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'marley@local.test'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'marley1234'

// Unique per run so repeated runs don't collide on the slug's unique index.
const RUN_ID = Date.now().toString(36)

async function signIn(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible()
}

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.goto('/admin/templates')
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Ftemplates/)
  await expect(page.getByRole('heading', { name: 'Marley Admin' })).toBeVisible()
})

test('a wrong password is rejected', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Matched by text rather than role: Next renders its own empty role="alert" route announcer.
  await expect(page.getByText('Wrong email or password.')).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/login/)
})

test('the seeded model appears with its seven zones', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Buckle models' }).first().click()

  const row = page.getByRole('row', { name: /Classic Rope Border/ })
  await expect(row).toContainText('Rectangle, cut corners')
  await expect(row).toContainText('$180.00')
  await expect(row).toContainText('7')

  await page.getByRole('link', { name: 'Classic Rope Border' }).click()
  await expect(page.getByRole('heading', { name: 'Classic Rope Border' })).toBeVisible()
  await expect(page.getByText(/Zones \(7\)/)).toBeVisible()

  // The curve-capable rule must surface: the script face is offered but disabled on arc text.
  const topBanner = page.locator('details', { has: page.getByText('Top banner') }).first()
  await topBanner.locator('summary').click()
  await expect(topBanner.getByText('Not usable on a curved line')).toBeVisible()
  await expect(topBanner.getByRole('checkbox', { name: /Ranch Script/ })).toBeDisabled()
  await expect(topBanner.getByRole('checkbox', { name: /Western Slab/ })).toBeChecked()
})

test('Marley can create a model, add a zone, and is stopped from breaking fabrication rules', async ({
  page,
}) => {
  await signIn(page)
  await page.goto('/admin/templates/new')

  const slug = `test-model-${RUN_ID}`
  // Name carries the run id too, so a leftover row from an interrupted run can't confuse the
  // by-name assertions below.
  const name = `Test Oval ${RUN_ID}`
  await page.getByLabel('Model name').fill(name)
  await page.getByLabel('URL slug').fill(slug)
  await page.getByLabel('Buckle shape').selectOption('oval')
  await page.getByLabel('Base price (USD)').fill('210.50')
  await page.getByLabel('Width').fill('900')
  await page.getByLabel('Height').fill('700')
  await page.getByRole('button', { name: 'Create model' }).click()

  // Lands on the edit page for the new model.
  await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByText('$210.50 base')).toBeVisible()
  await expect(page.getByText('No zones yet.')).toBeVisible()

  // --- Publishing is refused while the model is unusable -------------------
  await page.getByRole('button', { name: 'Publish to shop' }).click()
  await expect(page.getByText(/Add the base artwork image before publishing/)).toBeVisible()

  // --- A zone placed off the artwork is refused ----------------------------
  const addZone = page.locator('details', { has: page.getByText('Add a zone') }).last()
  await addZone.locator('summary').click()

  await addZone.getByLabel('X', { exact: true }).fill('850') // 850 + 600 wide overflows the 900px artwork
  await addZone.getByRole('button', { name: 'Add zone' }).click()
  await expect(addZone.getByText(/outside the 900x700px artwork/)).toBeVisible()

  // --- A valid zone is accepted -------------------------------------------
  await addZone.getByLabel('Label').fill('Rider name')
  await addZone.getByLabel('X', { exact: true }).fill('150')
  await addZone.getByLabel('Y', { exact: true }).fill('80')
  await addZone.getByLabel('Width', { exact: true }).fill('600')
  await addZone.getByLabel('Height', { exact: true }).fill('90')
  await addZone.getByRole('button', { name: 'Add zone' }).click()

  await expect(page.getByText(/Zones \(1\)/)).toBeVisible()
  const zone = page.locator('details', { has: page.getByText('Rider name') }).first()
  await expect(zone).toContainText('600x90 at 150,80')
  await expect(zone).toContainText('curved r900')
  await expect(zone).toContainText('up to 22 chars')

  // --- Selecting a different zone type swaps in that type's fields ---------
  await addZone.getByLabel('Zone type').selectOption('corner_ornament')
  await expect(addZone.getByLabel('Corner')).toBeVisible()
  await expect(addZone.getByLabel('Max characters')).toBeHidden()

  await addZone.getByLabel('Zone type').selectOption('center_image')
  await expect(addZone.getByLabel('Mask')).toBeVisible()
  await expect(addZone.getByLabel('Corner')).toBeHidden()

  // --- Tidy up, which also exercises deletion ------------------------------
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete model' }).click()
  await expect(page).toHaveURL(/\/admin\/templates$/)
  await expect(page.getByRole('link', { name })).toBeHidden()
  await expect(page.getByText(`/${slug}`)).toBeHidden()
})

test('fonts can be assigned to a text zone', async ({ page }) => {
  await signIn(page)
  await page.goto('/admin/templates')
  await page.getByRole('link', { name: 'Classic Rope Border' }).click()

  const bottomName = page.locator('details', { has: page.getByText('Bottom name') }).first()
  await bottomName.locator('summary').click()

  const romanSerif = bottomName.getByRole('checkbox', { name: /Roman Serif/ })
  const wasChecked = await romanSerif.isChecked()
  await romanSerif.setChecked(!wasChecked)
  await bottomName.getByRole('button', { name: 'Update fonts' }).click()
  await expect(bottomName.getByRole('status')).toHaveText('Fonts updated.')

  // Restore, and confirm the change actually persisted across a reload.
  await page.reload()
  const reopened = page.locator('details', { has: page.getByText('Bottom name') }).first()
  await reopened.locator('summary').click()
  const persisted = reopened.getByRole('checkbox', { name: /Roman Serif/ })
  await expect(persisted).toBeChecked({ checked: !wasChecked })
  await persisted.setChecked(wasChecked)
  await reopened.getByRole('button', { name: 'Update fonts' }).click()
  await expect(reopened.getByRole('status')).toHaveText('Fonts updated.')
})

test('signing out returns to the login page', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/admin\/login/)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})
