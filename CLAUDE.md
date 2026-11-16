# CLAUDE.md

Office Snack Tracker: a small internal web app where colleagues log which snacks,
coffee and sodas are running low, and whoever does the shopping marks them as bought.

## Product in one paragraph

The office has a list of supplies (items). Anyone signed in can flag an item as
"running low" or "out". The person doing the shopping sees a shopping list of
everything flagged, buys it, and marks it as bought, which resets the item to
"in stock". Every status change is logged so we can see who flagged/bought what
and when. That is the whole MVP. Do not add features beyond this unless the
task explicitly asks for them.

## Domain vocabulary

Use these exact names in code, UI and database. Do not invent synonyms.

- **Item**: one supply we keep in the office, e.g. "Oat milk", "Coca-Cola Zero".
  - `category`: `SNACK` | `COFFEE` | `SODA` | `OTHER`
  - `status`: `IN_STOCK` | `RUNNING_LOW` | `OUT`
  - `archived`: items are archived, never hard-deleted.
- **Shopping list**: all non-archived items with status `RUNNING_LOW` or `OUT`.
  It is a view, not a table.
- **Status change**: an append-only log row (item, old status, new status,
  user, timestamp). Every status change must write one. Never update or delete
  these rows.
- **Mark as bought**: sets status to `IN_STOCK` and logs a status change.

## Stack

- Next.js 16 (App Router) with TypeScript in strict mode
- React Server Components by default; Client Components only where needed
- Prisma 7 ORM with PostgreSQL: in Docker for local dev, PostgreSQL in production
- Better Auth for sign-in
- Zod for all input validation
- Tailwind CSS 4 + shadcn/ui for UI
- Vitest for unit tests, Playwright for end-to-end tests
- Package manager: pnpm (do not use yarn, npm or bun)

Use the current APIs for these major versions, not older patterns from memory.
In particular: Next.js 16 uses `proxy.ts` (not `middleware.ts`), and Prisma 7
uses `prisma.config.ts` and a driver adapter (`@prisma/adapter-pg`).

## Commands

- start database: `docker compose up -d` (Postgres, defined in `docker-compose.yml`)
- stop database: `docker compose down`
- dev: `pnpm dev`
- build: `pnpm build`
- lint: `pnpm lint`
- typecheck: `pnpm typecheck`
- unit tests: `pnpm test`
- e2e tests: `pnpm test:e2e`
- create migration: `pnpm prisma migrate dev --name <short_description>`
- regenerate client: `pnpm prisma generate`
- seed data: `pnpm prisma db seed`
- generate Better Auth schema: `pnpm dlx @better-auth/cli generate`

The database must be running before migrate, seed, dev or tests.
`DATABASE_URL` lives in `.env`; `.env.example` has a placeholder for it and for
every other variable.

pnpm 10 blocks dependency install scripts by default. If Prisma or another
package needs its install script, approve it with `pnpm approve-builds` and
commit the resulting change to `package.json`.

Before saying a task is done, run lint, typecheck and unit tests, and make sure
they all pass. If you changed a user flow, also run the e2e tests.

## Folder structure

```
app/                     # routes only: pages, layouts, loading/error files
  (app)/layout.tsx       # checks the session for every page in (app)
  (app)/items/           # item list + item detail pages
  (app)/shopping-list/   # the shopping list page
  api/auth/[...all]/     # Better Auth route handler (the only API route for now)
features/
  items/
    data-access.ts       # all Prisma queries for items ("server-only")
    actions.ts           # Server Actions ("use server"), thin
    schema.ts            # Zod schemas + inferred types
    components/          # UI components used only by this feature
  status-changes/
    ...same split...
components/ui/           # shared shadcn/ui components
lib/                     # db client, auth config, small shared helpers
prisma/                  # schema.prisma, migrations, seed.ts
tests/e2e/               # Playwright tests
proxy.ts                 # optimistic session-cookie check (see Auth)
docker-compose.yml       # local Postgres
```

## Architecture rules

- Each feature folder has the same three-file split:
  - `schema.ts`: Zod schemas. The single source of truth for input shapes.
    Derive TypeScript types with `z.infer`; do not hand-write duplicate types.
  - `data-access.ts`: the only place that imports the Prisma client, with one
    exception: `lib/auth.ts` imports it for Better Auth's `prismaAdapter`.
    Starts with `import "server-only";`. Each function does one query or one
    transaction.
  - `actions.ts`: Server Actions. Each action: check the session, validate input
    with the Zod schema, call data-access, `revalidatePath` the affected pages,
    return a typed result. No Prisma calls and no business rules beyond that.
- Changing an item's status and writing its status-change row must happen in
  one Prisma transaction, inside one data-access function.
- Pages are Server Components that read data by calling data-access functions
  directly. Do not fetch your own app through HTTP.
- Add `"use client"` only to the smallest component that needs interactivity
  (buttons with pending state, dialogs, forms with live validation).
- Use Server Actions for mutations. Do not create API routes for them.
- Server Actions return `{ ok: true, data }` or `{ ok: false, error }`. They do
  not throw for expected failures such as validation errors or not-found.
- Never trust the client for the user's identity. Read the user from the session
  on the server.

## Auth

- Sign-in method: email/password for now. Microsoft Entra ID later (if i task it or mention it)
- Every page except the sign-in page requires a signed-in user.
- Check the session in three places:
  1. `proxy.ts`: an optimistic check that only looks for the session cookie
     (`getSessionCookie` from `better-auth/cookies`) and redirects to sign-in.
     It does not query the database. It is a convenience, not security.
  2. `app/(app)/layout.tsx`: the real check with `auth.api.getSession`.
  3. Every Server Action: the real check again, before doing anything else.
- All signed-in users have the same permissions in the MVP. Do not add roles
  unless a task asks for them.

## Database rules

- Every schema change goes through a Prisma migration. Never edit an existing
  migration file; create a new one.
- Better Auth owns its tables (`user`, `session`, `account`, `verification`).
  Generate their schema with the Better Auth CLI and do not hand-edit them. The
  two rules below apply only to our own tables.
- Use `cuid()` string IDs.
- Every table has `createdAt` and `updatedAt`.
- Keep `prisma/seed.ts` working. It should create:
  - a realistic starter set of items in each category so the app looks real in dev
  - a test user that the Playwright tests sign in as

## UI rules

- The UI text is in English. Keep it short and friendly.
- Mobile-first: people will flag items from their phone in the kitchen.
  Every page must work at 375px width.
- Flagging an item and marking it bought must each be a single tap, no form.
- Show the status with both a color AND a text label, never color alone.
- Use shadcn/ui components before writing custom ones.

## Testing rules

- Every data-access and action function gets Vitest unit tests, including the
  unhappy paths (not signed in, invalid input, item not found, archived item).
- Data-access tests run against a real test database in Docker (a separate
  database from dev, reset between tests). Do not mock Prisma.
- Action tests may mock data-access and the session.
- Every user flow gets one Playwright test: flag an item, see it on the shopping
  list, mark it bought, see it disappear from the list. Playwright signs in as
  the seeded test user.
- Tests must not depend on each other or on the order they run in.
- Do not delete or weaken a failing test to make it pass. Fix the code, or stop
  and explain why the test is wrong.

## Code style

- TypeScript strict mode. No `any`. No `@ts-ignore` unless there is a comment
  explaining why.
- Named exports only, except where Next.js requires a default export
  (`page.tsx`, `layout.tsx`, etc.).
- File and folder names in kebab-case.
- Prefer small, readable functions over clever ones. This codebase is also
  used for learning.

## Do not

- Do not commit directly to `main`. Work on a branch and open a pull request.
- Do not add new dependencies without saying why in the PR description.
- Do not add a state-management library (Redux, Zustand, etc.). Server
  Components plus Server Actions are enough for this app.
- Do not hard-delete items or status-change rows.
- Do not put secrets in code or commit `.env` files. Add new variables to
  `.env.example` with a placeholder value.
- Do not log email addresses or session tokens.
- Do not build features that are not in the task: no budgets, no prices,
  no ordering from suppliers, no notifications, unless asked.

## Definition of done

A task is done when:

1. The acceptance criteria in the task are met.
2. Lint, typecheck, unit tests and (if a flow changed) e2e tests pass.
3. Migrations and seed data are updated if the schema changed.
4. The PR description says what changed, why, and how to test it manually.

## Deeper docs

- docs/architecture.md: the feature-folder pattern in more detail
- docs/domain.md: item statuses and the rules for changing them

(Create these files when the corresponding section here grows past ~20 lines.)
