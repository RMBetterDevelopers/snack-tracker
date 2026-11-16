import type { PrismaClient } from "../../generated/prisma/client";
import { createPrismaClient } from "../../lib/create-prisma-client";

/**
 * A Prisma client for the test database. Throws if the environment does not
 * point at the separate test database, so a test can never wipe dev data.
 */
export function createTestDatabaseClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!url || url !== testUrl || url === process.env.DEV_DATABASE_URL) {
    throw new Error("Tests must run against TEST_DATABASE_URL (see vitest.config.ts).");
  }
  return createPrismaClient(url);
}

/** Empties every table. Call it in beforeEach so tests never depend on each other. */
export async function resetDatabase(db: PrismaClient): Promise<void> {
  await db.$executeRaw`TRUNCATE TABLE "status_change", "item", "session", "account", "verification", "user" CASCADE`;
}
