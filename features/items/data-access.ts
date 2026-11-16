import "server-only";

import type { ItemStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * The shopping list: every non-archived item that is RUNNING_LOW or OUT.
 * Global for all signed-in users, so it takes no user.
 *
 * Order: OUT first, then RUNNING_LOW, then name A-Z.
 * `status: "desc"` relies on the declaration order of the ItemStatus enum in
 * prisma/schema.prisma (IN_STOCK, RUNNING_LOW, OUT): Postgres sorts enums by
 * that order. The `id` sort only makes ties stable.
 */
export async function listShoppingListItems() {
  return prisma.item.findMany({
    where: { archived: false, status: { in: ["RUNNING_LOW", "OUT"] } },
    select: { id: true, name: true, category: true, status: true },
    orderBy: [{ status: "desc" }, { name: "asc" }, { id: "asc" }],
  });
}

export type ShoppingListItem = Awaited<ReturnType<typeof listShoppingListItems>>[number];

/**
 * One item for the item detail page, or null if no item has this id.
 * Archived items are returned too: the page shows them with an "Archived" note.
 */
export async function getItem(itemId: string) {
  return prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, name: true, category: true, status: true, archived: true },
  });
}

export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItem>>>;

export type MarkItemBoughtOutcome =
  | { kind: "BOUGHT"; oldStatus: "RUNNING_LOW" | "OUT" }
  | { kind: "ALREADY_IN_STOCK" }
  | { kind: "NOT_FOUND" }
  | { kind: "ARCHIVED" };

const FLAGGED_STATUSES = ["OUT", "RUNNING_LOW"] as const satisfies readonly ItemStatus[];

/**
 * Sets a flagged item to IN_STOCK and appends one StatusChange row, in one
 * transaction.
 *
 * Each update is conditional on the exact old status, so the matched `where`
 * tells us the real old status. Two buyers racing on the same item: the second
 * update waits for the first transaction's row lock, re-checks the WHERE,
 * matches 0 rows and writes nothing.
 *
 * If the StatusChange insert fails (e.g. unknown user), the whole transaction
 * rolls back and the error propagates.
 */
export async function markItemBought(input: {
  itemId: string;
  userId: string;
}): Promise<MarkItemBoughtOutcome> {
  const { itemId, userId } = input;

  return prisma.$transaction(async (tx): Promise<MarkItemBoughtOutcome> => {
    for (const oldStatus of FLAGGED_STATUSES) {
      const { count } = await tx.item.updateMany({
        where: { id: itemId, archived: false, status: oldStatus },
        data: { status: "IN_STOCK" },
      });
      if (count > 0) {
        await tx.statusChange.create({
          data: { itemId, oldStatus, newStatus: "IN_STOCK", userId },
        });
        return { kind: "BOUGHT", oldStatus };
      }
    }

    // Nothing matched: find out why. No StatusChange is written.
    const item = await tx.item.findUnique({ where: { id: itemId }, select: { archived: true } });
    if (!item) {
      return { kind: "NOT_FOUND" };
    }
    if (item.archived) {
      return { kind: "ARCHIVED" };
    }
    return { kind: "ALREADY_IN_STOCK" };
  });
}
