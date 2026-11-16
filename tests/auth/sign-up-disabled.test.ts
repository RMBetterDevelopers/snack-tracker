import { isAPIError } from "better-auth/api";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";
import { createTestDatabaseClient, resetDatabase } from "../helpers/reset-database";

// The nextCookies() plugin calls next/headers' cookies(), which only works inside
// a Next.js request. Stub it so auth.api can be called from a plain test.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
  headers: vi.fn(async () => new Headers()),
}));

// Imported after the mock is registered (vi.mock is hoisted anyway).
const { auth } = await import("@/lib/auth");
const { prisma } = await import("@/lib/db");

const db: PrismaClient = createTestDatabaseClient();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
  await prisma.$disconnect();
});

describe("sign-up", () => {
  it("is disabled: signUpEmail rejects and no user is created", async () => {
    const usersBefore = await db.user.count();

    const error: unknown = await auth.api
      .signUpEmail({
        body: { name: "Intruder", email: "intruder@example.com", password: "intruder-password-123" },
      })
      .then(
        () => null,
        (rejection: unknown) => rejection,
      );

    expect(isAPIError(error)).toBe(true);
    expect(await db.user.count()).toBe(usersBefore);
    expect(await db.user.count({ where: { email: "intruder@example.com" } })).toBe(0);
  });
});
