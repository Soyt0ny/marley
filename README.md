# Marley Custom Buckles

Online shop for custom western belt buckles. Customers pick a fabricable buckle model,
personalise its defined zones (top text, an AI-generated centre design, bottom text, corner
ornaments) within real production limits, and submit the design. Marley reviews every order and
approves it before anything is made.

## Architecture in one paragraph

`lib/schema/zone.ts` is the single source of truth for what a zone is and what a customer may do
with it. Three consumers read from it and none re-implement its rules: the admin template editor
(what to show Marley), the storefront customizer (what to offer the customer), and the renderer
(how to draw it). Zone geometry lives in JSONB typed against that schema, so adding a capability
is a data change rather than a code change per model.

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript
- Postgres + Drizzle ORM
- Auth.js, for the admin only — customers never sign in; a design is claimed by a signed cookie
- Konva for the buckle renderer, shared by the customizer, the admin editor and the proof
- OpenAI `gpt-image-2` behind a swappable provider interface, with a mock for tests
- Images stored on disk and served through `/api/assets` (swap in R2 by implementing
  `ImageStorage`); Cloudflare Turnstile is wired up but inactive until keys are set

Not built, on purpose: checkout, payments, the order queue and transactional email. See
**Status** below.

Note: Next 16 renamed `middleware` to `proxy` — the admin redirect gate lives in `proxy.ts`. It
is only an optimistic UX redirect; `requireAdmin()` in `lib/auth/session.ts` is the real
authority and is called by every admin page and Server Action.

Note: Next 16 renamed `middleware` to `proxy` — the admin redirect gate lives in `proxy.ts`. It
is only an optimistic UX redirect; `requireAdmin()` in `lib/auth/session.ts` is the real
authority and is called by every admin page and Server Action.

## Running it

**[GUIA.md](GUIA.md) is the day-to-day guide** — how to start and stop it, the admin password,
and what to do when something breaks. First-time setup:

```bash
docker compose up -d          # Postgres on :5434, MailHog UI on :8025
cp .env.example .env.local    # then fill in AUTH_SECRET (npx auth secret)
npm install
npm run db:migrate
npm run db:seed               # admin login + font/ornament libraries + one example model
npm run dev
```

Postgres is published on **5434**, not 5432 — a locally-installed PostgreSQL service and another
project's container already hold 5432 and 5433.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server. Only one instance per project (Next 16 lockfile). |
| `npm run build` | Production build (`output: standalone`, for the Docker image). |
| `npm run typecheck` | Regenerates route types, then `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm run test:schema` | Zone fabrication guardrails. No database or browser needed. |
| `npm run test:curved-text` | Arc text layout maths. No database or browser needed. |
| `npm run test:e2e` | Playwright, against the real local database and the mock image provider. |
| `npm run db:generate` | Write a migration after editing `db/schema.ts`. |
| `npm run db:migrate` | Apply pending migrations (also the deploy release step). |
| `npm run db:seed` | Idempotent development seed. |
| `npm run db:studio` | Drizzle Studio. |

`npm run test:e2e` starts its own dev server on port 3000 (Next 16 allows only one per
project), so stop `npm run dev` first. It forces `AI_PROVIDER=mock` so the suite never spends
OpenAI credits.

### A note on OPENAI_API_KEY

A real environment variable always takes precedence over `.env.local`. If your shell already
exports `OPENAI_API_KEY` — PostHog Desktop does — it shadows the key in the file, and generation
fails with a confusing "incorrect API key" from OpenAI. `getImageProvider()` checks for the
`sk-` prefix and says so plainly rather than letting it get that far.

## Status — working beta

This is a beta built to prove the idea, not to sell yet. **Checkout and payments are
deliberately not built**, and neither is the order queue or transactional email.

What works end to end today:

- Admin: sign-in, buckle models, zones (numeric fields and a drag-and-drop layout editor over
  the artwork), and the font and ornament libraries.
- Storefront: catalogue, and a guided customizer — wording, corner details, centre design,
  then the proof — with the buckle redrawing live at every step.
- Centre designs from a written description or from a photo the customer uploads, generated on
  `gpt-image-2`, capped per design per day, captcha- and rate-limited, and re-hosted locally.
- A black line-art proof of the whole buckle: the same renderer, in ink rather than metal, with
  the customer's text set in its real font rather than drawn by the image model.

The natural next step, if the beta needs to close its loop, is submitting a design to Marley
and letting her review it — none of which needs payment.

Open questions for Marley, unchanged: whether her fabricator needs vector output (SVG/DXF) or a
high-resolution PNG proof is enough, and the shipping/tax policy.

The example model ships with stand-in artwork (the rope border reads as dots, and corner
ornaments are lettered circles). Both are data: upload the real blanks and ornament art from the
admin panel and nothing in the code changes.
