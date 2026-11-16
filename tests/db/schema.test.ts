import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";
import { createTestDatabaseClient, resetDatabase } from "../helpers/reset-database";

const db: PrismaClient = createTestDatabaseClient();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

function createUser() {
  return db.user.create({
    data: { id: randomUUID(), name: "Schema Tester", email: `schema-${randomUUID()}@example.com` },
  });
}

function createItem() {
  return db.item.create({ data: { name: "Oat milk", category: "COFFEE" } });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("item", () => {
  it("defaults to IN_STOCK, not archived, with timestamps set", async () => {
    const item = await createItem();

    expect(item.status).toBe("IN_STOCK");
    expect(item.archived).toBe(false);
    expect(item.createdAt).toBeInstanceOf(Date);
    expect(item.updatedAt).toBeInstanceOf(Date);
  });

  it("changes updatedAt on update but keeps createdAt", async () => {
    const item = await createItem();
    await wait(20);

    const updated = await db.item.update({ where: { id: item.id }, data: { status: "OUT" } });

    expect(updated.createdAt.getTime()).toBe(item.createdAt.getTime());
    expect(updated.updatedAt.getTime()).toBeGreaterThan(item.updatedAt.getTime());
  });

  it("rejects an unknown category at the database level", async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO "item" ("id", "name", "category", "updatedAt") VALUES ('bad-category', 'Candy', 'CANDY', now())`,
      ),
    ).rejects.toThrow();
  });

  it("rejects an unknown status at the database level", async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO "item" ("id", "name", "category", "status", "updatedAt") VALUES ('bad-status', 'Candy', 'SNACK', 'GONE', now())`,
      ),
    ).rejects.toThrow();
  });
});

describe("status_change", () => {
  it("stores item, old status, new status, user and timestamps", async () => {
    const user = await createUser();
    const item = await createItem();

    const change = await db.statusChange.create({
      data: { itemId: item.id, userId: user.id, oldStatus: "IN_STOCK", newStatus: "RUNNING_LOW" },
    });
    const read = await db.statusChange.findUniqueOrThrow({
      where: { id: change.id },
      include: { item: true, user: true },
    });

    expect(read.item.id).toBe(item.id);
    expect(read.user.id).toBe(user.id);
    expect(read.oldStatus).toBe("IN_STOCK");
    expect(read.newStatus).toBe("RUNNING_LOW");
    expect(read.createdAt).toBeInstanceOf(Date);
    expect(read.updatedAt).toBeInstanceOf(Date);
  });

  it("does not let an Item with status changes be deleted", async () => {
    const user = await createUser();
    const item = await createItem();
    await db.statusChange.create({
      data: { itemId: item.id, userId: user.id, oldStatus: "IN_STOCK", newStatus: "OUT" },
    });

    await expect(db.item.delete({ where: { id: item.id } })).rejects.toThrow();
    expect(await db.item.count({ where: { id: item.id } })).toBe(1);
    expect(await db.statusChange.count()).toBe(1);
  });

  it("does not let a User with status changes be deleted", async () => {
    const user = await createUser();
    const item = await createItem();
    await db.statusChange.create({
      data: { itemId: item.id, userId: user.id, oldStatus: "IN_STOCK", newStatus: "OUT" },
    });

    await expect(db.user.delete({ where: { id: user.id } })).rejects.toThrow();
    expect(await db.user.count({ where: { id: user.id } })).toBe(1);
    expect(await db.statusChange.count()).toBe(1);
  });
});
