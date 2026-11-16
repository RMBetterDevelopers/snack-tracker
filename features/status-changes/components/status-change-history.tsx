import type { ItemStatus } from "@/generated/prisma/client";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/relative-time";
import type { StatusChangeHistoryEntry } from "../data-access";

// The wording depends only on the new status.
const PHRASE: Record<ItemStatus, string> = {
  RUNNING_LOW: "Flagged running low",
  OUT: "Flagged out",
  IN_STOCK: "Marked as bought",
};

type StatusChangeHistoryProps = {
  entries: StatusChangeHistoryEntry[];
  // Passed in from the page (one value per request) so every entry uses the same "now".
  now: Date;
};

export function StatusChangeHistory({ entries, now }: StatusChangeHistoryProps) {
  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-2">
      <h2 id="history-heading" className="text-lg font-semibold">
        History
      </h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">No history yet.</p>
      ) : (
        <ul aria-labelledby="history-heading" className="divide-y rounded-lg border">
          {entries.map((entry) => (
            <li key={entry.id} className="p-3 wrap-anywhere">
              {PHRASE[entry.newStatus]} by {entry.user.name},{" "}
              <time
                dateTime={entry.createdAt.toISOString()}
                title={formatAbsoluteTime(entry.createdAt)}
              >
                {formatRelativeTime(entry.createdAt, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
