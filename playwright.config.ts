import { defineConfig, devices } from '@playwright/test'

/**
 * Tests run against the ordinary dev server on port 3000 and reuse one that is already up.
 *
 * Next 16 allows only a single `next dev` per project, so a second server on another port is
 * not an option — and reusing 3000 keeps AUTH_URL from .env.local correct, which Auth.js needs
 * for its post-login redirects.
 *
 * They talk to the real local database: run `docker compose up -d`, `npm run db:migrate` and
 * `npm run db:seed` first.
 */
const PORT = 3000
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: baseURL,
    /*
     * Playwright owns the server so it can force the mock image provider — otherwise every run
     * would spend real credits on generated designs. Next 16 allows only one dev server per
     * project, so stop `npm run dev` before running the suite.
     */
    reuseExistingServer: false,
    env: { AI_PROVIDER: 'mock' },
    timeout: 180_000,
  },
})
