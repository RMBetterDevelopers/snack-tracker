import { verifyPassword } from "better-auth/crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client";
import { seedDatabase } from "../prisma/seed";
import { createTestDatabaseClient, resetDatabase } from "./helpers/reset-database";

const db: PrismaClient = createTestDatabaseClient();

// Fixed test values, independent of the developer's .env.
const SEED_EMAIL = "Seed.Tester@Example.com";
const SEED_PASSWORD = "seed-test-password-123";

const CATEGORIES = ["SNACK", "COFFEE", "SODA", "OTHER"] as const;
const STATUSES = ["IN_STOCK", "RUNNING_LOW", "OUT"] as const;

beforeEach(async () => {
  await resetDatabase(db);
  vi.stubEnv("TEST_USER_EMAIL", SEED_EMAIL);
  vi.stubEnv("TEST_USER_PASSWORD", SEED_PASSWORD);
  // Keep test output clean; the seed logs counts.
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("seedDatabase", () => {
  it("creates at least one non-archived Item in every category", async () => {
    await seedDatabase(db);

    for (const category of CATEGORIES) {
      expect(await db.item.count({ where: { category, archived: false } })).toBeGreaterThan(0);
    }
  });

  it("gives every Item a name, a valid category and a valid status", async () => {
    await seedDatabase(db);

    const items = await db.item.findMany();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.name.trim()).not.toBe("");
      expect(CATEGORIES).toContain(item.category);
      expect(STATUSES).toContain(item.status);
    }
  });

  it("includes RUNNING_LOW and OUT items and archives nothing", async () => {
    await seedDatabase(db);

    expect(await db.item.count({ where: { status: "RUNNING_LOW" } })).toBeGreaterThan(0);
    expect(await db.item.count({ where: { status: "OUT" } })).toBeGreaterThan(0);
    expect(await db.item.count({ where: { archived: true } })).toBe(0);
  });

  it("writes no status changes", async () => {
    await seedDatabase(db);

    expect(await db.statusChange.count()).toBe(0);
  });

  it("creates the test user with a lowercased email and a working password", async () => {
    await seedDatabase(db);

    const user = await db.user.findUniqueOrThrow({
      where: { email: SEED_EMAIL.toLowerCase() },
      include: { accounts: true },
    });
    expect(user.name).toBe("Test User");
    expect(user.emailVerified).toBe(true);

    const credential = user.accounts.find((account) => account.providerId === "credential");
    expect(credential?.accountId).toBe(user.id);
    expect(credential?.password).toBeTruthy();
    expect(await verifyPassword({ hash: credential?.password ?? "", password: SEED_PASSWORD })).toBe(true);
    expect(await verifyPassword({ hash: credential?.password ?? "", password: "wrong-password" })).toBe(false);
  });

  it("is idempotent: running it twice gives the same counts", async () => {
    await seedDatabase(db);
    const itemsAfterFirst = await db.item.count();
    const usersAfterFirst = await db.user.count();

    await seedDatabase(db);

    expect(await db.item.count()).toBe(itemsAfterFirst);
    expect(await db.user.count()).toBe(usersAfterFirst);
    expect(await db.account.count({ where: { providerId: "credential" } })).toBe(1);
  });

  it("leaves existing Items unchanged on a re-run", async () => {
    await seedDatabase(db);
    const oatMilk = await db.item.findFirstOrThrow({ where: { name: "Oat milk" } });
    await db.item.update({ where: { id: oatMilk.id }, data: { status: "IN_STOCK" } });

    await seedDatabase(db);

    const after = await db.item.findUniqueOrThrow({ where: { id: oatMilk.id } });
    expect(after.status).toBe("IN_STOCK");
  });

  it("resets the test user's password to TEST_USER_PASSWORD on a re-run", async () => {
    await seedDatabase(db);
    vi.stubEnv("TEST_USER_PASSWORD", "a-new-password-456");

    await seedDatabase(db);

    const account = await db.account.findFirstOrThrow({ where: { providerId: "credential" } });
    expect(await verifyPassword({ hash: account.password ?? "", password: "a-new-password-456" })).toBe(true);
  });

  it("throws when TEST_USER_EMAIL is missing, without writing anything", async () => {
    vi.stubEnv("TEST_USER_EMAIL", "");

    await expect(seedDatabase(db)).rejects.toThrow("TEST_USER_EMAIL and TEST_USER_PASSWORD must both be set");
    expect(await db.item.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
  });

  it("throws when TEST_USER_PASSWORD is missing", async () => {
    vi.stubEnv("TEST_USER_PASSWORD", "");

    await expect(seedDatabase(db)).rejects.toThrow("TEST_USER_EMAIL and TEST_USER_PASSWORD must both be set");
  });

  it("never logs the email", async () => {
    await seedDatabase(db);

    const logged = vi.mocked(console.log).mock.calls.flat().join(" ").toLowerCase();
    expect(logged).not.toContain(SEED_EMAIL.toLowerCase());
  });
});
