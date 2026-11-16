// Seeds a starter set of Items and the Playwright test user.
//
// Idempotent: run it as often as you like. Existing Items are left unchanged,
// and the test user's password is reset to TEST_USER_PASSWORD.
//
// Do NOT run this in production: leave TEST_USER_EMAIL / TEST_USER_PASSWORD unset there.
//
// Uses relative imports and its own Prisma client (no "server-only"), because it
// runs as a plain Node script via `pnpm prisma db seed` (tsx prisma/seed.ts).
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { hashPassword } from "better-auth/crypto";
import type { ItemCategory, ItemStatus, PrismaClient } from "../generated/prisma/client";
import { createPrismaClient } from "../lib/create-prisma-client";

type SeedItem = { name: string; category: ItemCategory; status: ItemStatus };

const SEED_ITEMS: readonly SeedItem[] = [
  { name: "Salted peanuts", category: "SNACK", status: "RUNNING_LOW" },
  { name: "Dark chocolate", category: "SNACK", status: "IN_STOCK" },
  { name: "Rice cakes", category: "SNACK", status: "OUT" },
  { name: "Coffee beans", category: "COFFEE", status: "IN_STOCK" },
  { name: "Oat milk", category: "COFFEE", status: "RUNNING_LOW" },
  { name: "Sugar cubes", category: "COFFEE", status: "IN_STOCK" },
  { name: "Coca-Cola Zero", category: "SODA", status: "OUT" },
  { name: "Sparkling water", category: "SODA", status: "IN_STOCK" },
  { name: "Ginger beer", category: "SODA", status: "IN_STOCK" },
  { name: "Paper towels", category: "OTHER", status: "IN_STOCK" },
  { name: "Dish soap", category: "OTHER", status: "RUNNING_LOW" },
];

const TEST_USER_NAME = "Test User";
// Better Auth's providerId for email/password accounts.
const CREDENTIAL_PROVIDER_ID = "credential";

type TestUserConfig = { email: string; password: string };

function readTestUserConfig(): TestUserConfig {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error("TEST_USER_EMAIL and TEST_USER_PASSWORD must both be set to seed the test user.");
  }
  // Better Auth lowercases emails on sign-in, so store it lowercased.
  return { email: email.trim().toLowerCase(), password };
}

/** Creates each seed Item that does not exist yet. Returns how many were created. */
async function seedItems(db: PrismaClient): Promise<number> {
  let created = 0;
  for (const item of SEED_ITEMS) {
    const existing = await db.item.findFirst({
      where: { name: item.name, archived: false },
      select: { id: true },
    });
    if (!existing) {
      await db.item.create({ data: item });
      created += 1;
    }
  }
  return created;
}

/** Upserts the test user and its credential account (password hash) in one transaction. */
async function seedTestUser(db: PrismaClient, config: TestUserConfig): Promise<void> {
  const passwordHash = await hashPassword(config.password);

  await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: config.email },
      create: {
        id: randomUUID(),
        name: TEST_USER_NAME,
        email: config.email,
        emailVerified: true,
      },
      update: {},
    });

    const account = await tx.account.findFirst({
      where: { userId: user.id, providerId: CREDENTIAL_PROVIDER_ID },
      select: { id: true },
    });

    if (account) {
      await tx.account.update({
        where: { id: account.id },
        data: { password: passwordHash },
      });
    } else {
      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: user.id,
          providerId: CREDENTIAL_PROVIDER_ID,
          userId: user.id,
          password: passwordHash,
        },
      });
    }
  });
}

export async function seedDatabase(db: PrismaClient): Promise<void> {
  // Check config first, so a missing variable fails before anything is written.
  const testUser = readTestUserConfig();

  const createdItems = await seedItems(db);
  await seedTestUser(db, testUser);

  // Counts only. Never log the email.
  console.log(
    `Seed done: ${createdItems} item(s) created, ${SEED_ITEMS.length - createdItems} already existed. Test user ready.`,
  );
}

function describeError(error: unknown): string {
  // Plain Errors are our own messages and contain no personal data. For anything
  // else (e.g. Prisma errors, which can echo query arguments) log only the type.
  if (error instanceof Error && error.constructor === Error) {
    return error.message;
  }
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
    return `${error.name}${code}`;
  }
  return "unknown error";
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  const db = createPrismaClient(connectionString);
  try {
    await seedDatabase(db);
  } finally {
    await db.$disconnect();
  }
}

// Run only when executed directly (`tsx prisma/seed.ts`), not when imported by tests.
const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(`Seed failed: ${describeError(error)}`);
    process.exit(1);
  });
}
