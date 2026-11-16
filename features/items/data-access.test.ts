import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ItemCategory, ItemStatus, PrismaClient } from "@/generated/prisma/client";
import { createTestDatabaseClient, resetDatabase } from "@/tests/helpers/reset-database";
import { getItem, listShoppingListItems, markItemBought } from "./data-access";

// Separate client for arranging and asserting. The functions under test use
// lib/db, which points at the same test database under Vitest.
const db: PrismaClient = createTestDatabaseClient();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

function createUser() {
  return db.user.create({
    data: { id: randomUUID(), name: "Item Tester", email: `items-${randomUUID()}@example.com` },
  });
}

function createItem(data: {
  name?: string;
  category?: ItemCategory;
  status?: ItemStatus;
  archived?: boolean;
}) {
  return db.item.create({
    data: {
      name: data.name ?? "Oat milk",
      category: data.category ?? "COFFEE",
      status: data.status ?? "IN_STOCK",
      archived: data.archived ?? false,
    },
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A well-formed cuid that no row uses.
const UNKNOWN_ITEM_ID = "cmhz8x0q50000a8u7k3j2f9vd";

describe("listShoppingListItems", () => {
  it("returns non-archived RUNNING_LOW and OUT items with id, name, category and status", async () => {
    const low = await createItem({ name: "Oat milk", category: "COFFEE", status: "RUNNING_LOW" });
    const out = await createItem({ name: "Coca-Cola Zero", category: "SODA", status: "OUT" });

    const items = await listShoppingListItems();

    expect(items).toEqual([
      { id: out.id, name: "Coca-Cola Zero", category: "SODA", status: "OUT" },
      { id: low.id, name: "Oat milk", category: "COFFEE", status: "RUNNING_LOW" },
    ]);
  });

  it("excludes IN_STOCK items", async () => {
    await createItem({ name: "Espresso beans", status: "IN_STOCK" });
    const low = await createItem({ name: "Oat milk", status: "RUNNING_LOW" });

    const items = await listShoppingListItems();

    expect(items.map((item) => item.id)).toEqual([low.id]);
  });

  it("excludes archived RUNNING_LOW and OUT items", async () => {
    await createItem({ name: "Archived low", status: "RUNNING_LOW", archived: true });
    await createItem({ name: "Archived out", status: "OUT", archived: true });
    const out = await createItem({ name: "Active out", status: "OUT" });

    const items = await listShoppingListItems();

    expect(items.map((item) => item.id)).toEqual([out.id]);
  });

  it("returns flagged items from every category", async () => {
    await createItem({ name: "Crisps", category: "SNACK", status: "OUT" });
    await createItem({ name: "Filter coffee", category: "COFFEE", status: "RUNNING_LOW" });
    await createItem({ name: "Sparkling water", category: "SODA", status: "OUT" });
    await createItem({ name: "Paper towels", category: "OTHER", status: "RUNNING_LOW" });

    const items = await listShoppingListItems();

    expect(items.map((item) => item.category).sort()).toEqual(["COFFEE", "OTHER", "SNACK", "SODA"]);
  });

  it("orders OUT before RUNNING_LOW, then by name A-Z", async () => {
    await createItem({ name: "Bananas", status: "RUNNING_LOW" });
    await createItem({ name: "Tea", status: "OUT" });
    await createItem({ name: "Apples", status: "RUNNING_LOW" });
    await createItem({ name: "Milk", status: "OUT" });

    const items = await listShoppingListItems();

    expect(items.map((item) => [item.status, item.name])).toEqual([
      ["OUT", "Milk"],
      ["OUT", "Tea"],
      ["RUNNING_LOW", "Apples"],
      ["RUNNING_LOW", "Bananas"],
    ]);
  });

  it("returns an empty array when nothing is flagged", async () => {
    await createItem({ name: "Espresso beans", status: "IN_STOCK" });

    expect(await listShoppingListItems()).toEqual([]);
  });
});

describe("getItem", () => {
  it("returns exactly id, name, category, status and archived for an existing item", async () => {
    const item = await createItem({ name: "Oat milk", category: "COFFEE", status: "RUNNING_LOW" });

    expect(await getItem(item.id)).toEqual({
      id: item.id,
      name: "Oat milk",
      category: "COFFEE",
      status: "RUNNING_LOW",
      archived: false,
    });
  });

  it("returns an archived item with archived: true", async () => {
    const item = await createItem({ name: "Old crisps", category: "SNACK", status: "OUT", archived: true });

    expect(await getItem(item.id)).toEqual({
      id: item.id,
      name: "Old crisps",
      category: "SNACK",
      status: "OUT",
      archived: true,
    });
  });

  it("returns null for an unknown id", async () => {
    await createItem({});

    expect(await getItem(UNKNOWN_ITEM_ID)).toBeNull();
  });
});

describe("markItemBought", () => {
  it.each(["RUNNING_LOW", "OUT"] as const)(
    "sets a %s item to IN_STOCK and logs exactly one status change",
    async (oldStatus) => {
      const user = await createUser();
      const item = await createItem({ status: oldStatus });
      await wait(20);

      const outcome = await markItemBought({ itemId: item.id, userId: user.id });

      expect(outcome).toEqual({ kind: "BOUGHT", oldStatus });

      const after = await db.item.findUniqueOrThrow({ where: { id: item.id } });
      expect(after.status).toBe("IN_STOCK");
      expect(after.archived).toBe(false);
      expect(after.updatedAt.getTime()).toBeGreaterThan(item.updatedAt.getTime());

      const changes = await db.statusChange.findMany({ where: { itemId: item.id } });
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        oldStatus,
        newStatus: "IN_STOCK",
        userId: user.id,
      });
      expect(changes[0]?.createdAt).toBeInstanceOf(Date);
    },
  );

  it("returns NOT_FOUND for an unknown item and logs nothing", async () => {
    const user = await createUser();

    const outcome = await markItemBought({ itemId: UNKNOWN_ITEM_ID, userId: user.id });

    expect(outcome).toEqual({ kind: "NOT_FOUND" });
    expect(await db.statusChange.count()).toBe(0);
  });

  it("returns ARCHIVED for an archived item, leaves it unchanged and logs nothing", async () => {
    const user = await createUser();
    const item = await createItem({ status: "OUT", archived: true });

    const outcome = await markItemBought({ itemId: item.id, userId: user.id });

    expect(outcome).toEqual({ kind: "ARCHIVED" });
    const after = await db.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.status).toBe("OUT");
    expect(after.archived).toBe(true);
    expect(await db.statusChange.count()).toBe(0);
  });

  it("returns ALREADY_IN_STOCK for an item that is already in stock and logs nothing", async () => {
    const user = await createUser();
    const item = await createItem({ status: "IN_STOCK" });

    const outcome = await markItemBought({ itemId: item.id, userId: user.id });

    expect(outcome).toEqual({ kind: "ALREADY_IN_STOCK" });
    expect(await db.statusChange.count()).toBe(0);
  });

  it("logs exactly one status change when two users buy the same item at once", async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();
    const item = await createItem({ status: "OUT" });

    const outcomes = await Promise.all([
      markItemBought({ itemId: item.id, userId: firstUser.id }),
      markItemBought({ itemId: item.id, userId: secondUser.id }),
    ]);

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["ALREADY_IN_STOCK", "BOUGHT"]);
    const changes = await db.statusChange.findMany({ where: { itemId: item.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ oldStatus: "OUT", newStatus: "IN_STOCK" });
    const after = await db.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.status).toBe("IN_STOCK");
  });

  it("rolls back the status update when the status change cannot be written", async () => {
    const item = await createItem({ status: "RUNNING_LOW" });

    await expect(markItemBought({ itemId: item.id, userId: randomUUID() })).rejects.toThrow();

    const after = await db.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.status).toBe("RUNNING_LOW");
    expect(await db.statusChange.count()).toBe(0);
  });

  it("appends a new status change each time and never touches earlier ones", async () => {
    const user = await createUser();
    const item = await createItem({ status: "OUT" });

    await markItemBought({ itemId: item.id, userId: user.id });
    const [first] = await db.statusChange.findMany({ where: { itemId: item.id } });
    await db.item.update({ where: { id: item.id }, data: { status: "OUT" } });
    await wait(20);

    const outcome = await markItemBought({ itemId: item.id, userId: user.id });

    expect(outcome).toEqual({ kind: "BOUGHT", oldStatus: "OUT" });
    const changes = await db.statusChange.findMany({
      where: { itemId: item.id },
      orderBy: { createdAt: "asc" },
    });
    expect(changes).toHaveLength(2);
    expect(changes.find((change) => change.id === first?.id)).toEqual(first);
    expect(await db.item.count({ where: { id: item.id } })).toBe(1);
  });
});
