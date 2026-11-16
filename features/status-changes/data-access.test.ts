import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ItemStatus, PrismaClient } from "@/generated/prisma/client";
import { createTestDatabaseClient, resetDatabase } from "@/tests/helpers/reset-database";
import { STATUS_CHANGE_HISTORY_LIMIT, listItemStatusChanges } from "./data-access";

// Separate client for arranging and asserting. The function under test uses
// lib/db, which points at the same test database under Vitest.
const db: PrismaClient = createTestDatabaseClient();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

function createUser(name: string) {
  return db.user.create({
    data: { id: randomUUID(), name, email: `history-${randomUUID()}@example.com` },
  });
}

function createItem(data: { name?: string; archived?: boolean } = {}) {
  return db.item.create({
    data: {
      name: data.name ?? "Oat milk",
      category: "COFFEE",
      status: "IN_STOCK",
      archived: data.archived ?? false,
    },
  });
}

function addStatusChange(data: {
  itemId: string;
  userId: string;
  oldStatus?: ItemStatus;
  newStatus: ItemStatus;
  createdAt: Date;
}) {
  return db.statusChange.create({
    data: {
      itemId: data.itemId,
      userId: data.userId,
      oldStatus: data.oldStatus ?? "IN_STOCK",
      newStatus: data.newStatus,
      createdAt: data.createdAt,
    },
  });
}

const BASE_TIME = new Date("2026-11-10T12:00:00.000Z");

/** BASE_TIME plus the given number of minutes. */
function minutesAfterBase(minutes: number): Date {
  return new Date(BASE_TIME.getTime() + minutes * 60_000);
}

// A well-formed cuid that no row uses.
const UNKNOWN_ITEM_ID = "cmhz8x0q50000a8u7k3j2f9vd";

describe("listItemStatusChanges", () => {
  it("returns exactly id, newStatus, createdAt and the user's name, never the email", async () => {
    const anna = await createUser("Anna");
    const item = await createItem();
    const change = await addStatusChange({
      itemId: item.id,
      userId: anna.id,
      newStatus: "RUNNING_LOW",
      createdAt: BASE_TIME,
    });

    const entries = await listItemStatusChanges(item.id);

    expect(entries).toEqual([
      { id: change.id, newStatus: "RUNNING_LOW", createdAt: BASE_TIME, user: { name: "Anna" } },
    ]);
    expect(JSON.stringify(entries)).not.toContain("email");
    expect(JSON.stringify(entries)).not.toContain(anna.email);
  });

  it("returns flag, out and bought rows with the right newStatus and user name", async () => {
    const anna = await createUser("Anna");
    const tester = await createUser("Test User");
    const item = await createItem();
    await addStatusChange({
      itemId: item.id,
      userId: anna.id,
      oldStatus: "IN_STOCK",
      newStatus: "RUNNING_LOW",
      createdAt: minutesAfterBase(0),
    });
    await addStatusChange({
      itemId: item.id,
      userId: anna.id,
      oldStatus: "IN_STOCK",
      newStatus: "OUT",
      createdAt: minutesAfterBase(1),
    });
    await addStatusChange({
      itemId: item.id,
      userId: tester.id,
      oldStatus: "RUNNING_LOW",
      newStatus: "IN_STOCK",
      createdAt: minutesAfterBase(2),
    });

    const entries = await listItemStatusChanges(item.id);

    expect(entries.map((entry) => [entry.newStatus, entry.user.name])).toEqual([
      ["IN_STOCK", "Test User"],
      ["OUT", "Anna"],
      ["RUNNING_LOW", "Anna"],
    ]);
  });

  it("returns entries newest first", async () => {
    const user = await createUser("Anna");
    const item = await createItem();
    // Inserted out of time order on purpose.
    const middle = await addStatusChange({ itemId: item.id, userId: user.id, newStatus: "OUT", createdAt: minutesAfterBase(60) });
    const oldest = await addStatusChange({ itemId: item.id, userId: user.id, newStatus: "RUNNING_LOW", createdAt: minutesAfterBase(0) });
    const newest = await addStatusChange({ itemId: item.id, userId: user.id, newStatus: "IN_STOCK", createdAt: minutesAfterBase(120) });

    const entries = await listItemStatusChanges(item.id);

    expect(entries.map((entry) => entry.id)).toEqual([newest.id, middle.id, oldest.id]);
  });

  it("returns only the requested item's rows", async () => {
    const user = await createUser("Anna");
    const oatMilk = await createItem({ name: "Oat milk" });
    const cola = await createItem({ name: "Coca-Cola Zero" });
    const first = await addStatusChange({ itemId: oatMilk.id, userId: user.id, newStatus: "RUNNING_LOW", createdAt: minutesAfterBase(0) });
    const second = await addStatusChange({ itemId: oatMilk.id, userId: user.id, newStatus: "OUT", createdAt: minutesAfterBase(1) });
    await addStatusChange({ itemId: cola.id, userId: user.id, newStatus: "OUT", createdAt: minutesAfterBase(2) });

    const entries = await listItemStatusChanges(oatMilk.id);

    expect(entries.map((entry) => entry.id)).toEqual([second.id, first.id]);
  });

  it("returns rows made by every user, not only one", async () => {
    const userA = await createUser("Anna");
    const userB = await createUser("Bo");
    const item = await createItem();
    await addStatusChange({ itemId: item.id, userId: userA.id, newStatus: "RUNNING_LOW", createdAt: minutesAfterBase(0) });
    await addStatusChange({ itemId: item.id, userId: userB.id, newStatus: "IN_STOCK", createdAt: minutesAfterBase(1) });

    const entries = await listItemStatusChanges(item.id);

    expect(entries.map((entry) => entry.user.name)).toEqual(["Bo", "Anna"]);
  });

  it("orders rows with the same createdAt by id descending, identically on every call", async () => {
    const user = await createUser("Anna");
    const item = await createItem();
    const a = await addStatusChange({ itemId: item.id, userId: user.id, newStatus: "RUNNING_LOW", createdAt: BASE_TIME });
    const b = await addStatusChange({ itemId: item.id, userId: user.id, newStatus: "OUT", createdAt: BASE_TIME });
    const expectedIds = [a.id, b.id].sort().reverse();

    const firstCall = await listItemStatusChanges(item.id);
    const secondCall = await listItemStatusChanges(item.id);

    expect(firstCall.map((entry) => entry.id)).toEqual(expectedIds);
    expect(secondCall).toEqual(firstCall);
  });

  it(`returns only the ${STATUS_CHANGE_HISTORY_LIMIT} newest rows`, async () => {
    expect(STATUS_CHANGE_HISTORY_LIMIT).toBe(20);
    const user = await createUser("Anna");
    const item = await createItem();
    const created = [];
    for (let minute = 0; minute < 21; minute++) {
      created.push(
        await addStatusChange({
          itemId: item.id,
          userId: user.id,
          newStatus: minute % 2 === 0 ? "RUNNING_LOW" : "IN_STOCK",
          createdAt: minutesAfterBase(minute),
        }),
      );
    }
    const oldest = created[0];

    const entries = await listItemStatusChanges(item.id);

    expect(entries).toHaveLength(20);
    expect(entries.map((entry) => entry.id)).not.toContain(oldest?.id);
    expect(entries[0]?.id).toBe(created[20]?.id);
    expect(entries[19]?.id).toBe(created[1]?.id);
  });

  it("returns an empty array for an item with no history", async () => {
    const item = await createItem();

    expect(await listItemStatusChanges(item.id)).toEqual([]);
  });

  it("returns an empty array for an unknown id", async () => {
    expect(await listItemStatusChanges(UNKNOWN_ITEM_ID)).toEqual([]);
  });

  it("returns the history of an archived item", async () => {
    const user = await createUser("Anna");
    const item = await createItem({ archived: true });
    const change = await addStatusChange({ itemId: item.id, userId: user.id, newStatus: "OUT", createdAt: BASE_TIME });

    const entries = await listItemStatusChanges(item.id);

    expect(entries.map((entry) => entry.id)).toEqual([change.id]);
  });

  it("writes nothing, however often it is called", async () => {
    const user = await createUser("Anna");
    const item = await createItem();
    await addStatusChange({ itemId: item.id, userId: user.id, newStatus: "RUNNING_LOW", createdAt: minutesAfterBase(0) });
    await addStatusChange({ itemId: item.id, userId: user.id, newStatus: "IN_STOCK", createdAt: minutesAfterBase(1) });
    const before = await db.statusChange.findMany({ orderBy: { id: "asc" } });

    await listItemStatusChanges(item.id);
    await listItemStatusChanges(item.id);
    await listItemStatusChanges(item.id);

    expect(await db.statusChange.count()).toBe(2);
    expect(await db.statusChange.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });
});
