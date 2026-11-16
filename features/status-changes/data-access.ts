import "server-only";

import { prisma } from "@/lib/db";

/** How many history entries the item detail page shows. */
export const STATUS_CHANGE_HISTORY_LIMIT = 20;

/**
 * The latest status changes for one item, newest first. Read-only.
 *
 * Global for all signed-in users, so it takes no user. Archived items keep
 * their history, so it does not filter on `archived`. Only the user's name is
 * selected, never the email. The `id` sort only makes ties stable when two
 * rows share a `createdAt`.
 */
export async function listItemStatusChanges(itemId: string) {
  return prisma.statusChange.findMany({
    where: { itemId },
    select: {
      id: true,
      newStatus: true,
      createdAt: true,
      user: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: STATUS_CHANGE_HISTORY_LIMIT,
  });
}

export type StatusChangeHistoryEntry = Awaited<ReturnType<typeof listItemStatusChanges>>[number];
