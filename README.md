# snack-tracker

Office Snack Tracker: colleagues flag snacks, coffee and sodas that are running low,
and whoever shops marks them as bought. See `CLAUDE.md` for the full spec.

## Requirements

- Node.js 24, pnpm 10+
- Docker (for local Postgres)

## First-time setup

1. Copy the env file and fill in real values:

   ```bash
   cp .env.example .env
   ```

   - Generate `BETTER_AUTH_SECRET` with `pnpm dlx @better-auth/cli secret`.
   - Pick any `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`. The seed creates this user and
     Playwright signs in as it. **Never set these in production and never run the seed there.**
   - `DATABASE_URL` and `TEST_DATABASE_URL` must use the same user/password as `POSTGRES_*`.

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Start Postgres. On first start this also creates the separate test database
   `snack_tracker_test`:

   ```bash
   docker compose up -d
   ```

4. Generate the Prisma client (it is not generated on install), apply migrations and seed:

   ```bash
   pnpm prisma generate
   pnpm prisma migrate dev
   pnpm prisma db seed
   ```

5. Install the Playwright browser (once):

   ```bash
   pnpm exec playwright install chromium
   ```

6. Start the app at http://localhost:3000:

   ```bash
   pnpm dev
   ```

## Everyday commands

| What | Command |
| --- | --- |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Unit tests (uses `TEST_DATABASE_URL`) | `pnpm test` |
| End-to-end tests (uses the dev database) | `pnpm test:e2e` |
| New migration | `pnpm prisma migrate dev --name <short_description>` |

## Troubleshooting

- **`snack_tracker_test` does not exist.** The Docker init script only runs when the
  Postgres volume is first created. Either create it by hand
  (`docker compose exec db createdb -U <POSTGRES_USER> snack_tracker_test`) or stop the
  container, remove the `snack-tracker_db-data` volume yourself, and start it again
  (this deletes all local data).
- **Typecheck can't find `@/generated/prisma`.** Run `pnpm prisma generate`.
