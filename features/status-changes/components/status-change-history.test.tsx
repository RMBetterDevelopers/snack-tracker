import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StatusChangeHistoryEntry } from "@/features/status-changes/data-access";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { StatusChangeHistory } from "./status-change-history";

const NOW = new Date("2026-11-16T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

const ENTRIES: StatusChangeHistoryEntry[] = [
  {
    id: "ckentry00000000000000000c",
    newStatus: "IN_STOCK",
    createdAt: ago(3 * HOUR_MS),
    user: { name: "Test User" },
  },
  { id: "ckentry00000000000000000b", newStatus: "OUT", createdAt: ago(DAY_MS), user: { name: "Anna" } },
  {
    id: "ckentry00000000000000000a",
    newStatus: "RUNNING_LOW",
    createdAt: ago(2 * DAY_MS),
    user: { name: "Anna" },
  },
];

function historyRows() {
  return within(screen.getByRole("list", { name: "History" })).getAllByRole("listitem");
}

describe("StatusChangeHistory", () => {
  it("shows a History heading", () => {
    render(<StatusChangeHistory entries={ENTRIES} now={NOW} />);

    expect(screen.getByRole("heading", { level: 2, name: "History" })).toBeInTheDocument();
  });

  it.each([
    [2, "Flagged running low by Anna, 2 days ago"],
    [1, "Flagged out by Anna, 1 day ago"],
    [0, "Marked as bought by Test User, 3 hours ago"],
  ])("entry %i reads '%s'", (index, text) => {
    render(<StatusChangeHistory entries={ENTRIES} now={NOW} />);

    expect(historyRows()[index]).toHaveTextContent(text);
  });

  it("renders one list item per entry, in the order given", () => {
    render(<StatusChangeHistory entries={ENTRIES} now={NOW} />);

    const rows = historyRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Marked as bought");
    expect(rows[1]).toHaveTextContent("Flagged out");
    expect(rows[2]).toHaveTextContent("Flagged running low");
  });

  it("puts the ISO time in dateTime and the exact UTC time in title", () => {
    const { container } = render(<StatusChangeHistory entries={ENTRIES} now={NOW} />);

    const times = container.querySelectorAll("time");
    expect(times).toHaveLength(3);
    ENTRIES.forEach((entry, index) => {
      expect(times[index]).toHaveAttribute("dateTime", entry.createdAt.toISOString());
      expect(times[index]).toHaveAttribute("title", formatAbsoluteTime(entry.createdAt));
    });
    expect(times[2]).toHaveTextContent("2 days ago");
  });

  it("shows 'just now' for an entry under one minute old", () => {
    const entry: StatusChangeHistoryEntry = {
      id: "ckentry00000000000000000d",
      newStatus: "IN_STOCK",
      createdAt: ago(30 * 1000),
      user: { name: "Test User" },
    };
    render(<StatusChangeHistory entries={[entry]} now={NOW} />);

    expect(historyRows()[0]).toHaveTextContent("Marked as bought by Test User, just now");
  });

  it("shows the empty state and no list when there is no history", () => {
    render(<StatusChangeHistory entries={[]} now={NOW} />);

    expect(screen.getByRole("heading", { level: 2, name: "History" })).toBeInTheDocument();
    expect(screen.getByText("No history yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("does not show the empty state when there are entries", () => {
    render(<StatusChangeHistory entries={ENTRIES} now={NOW} />);

    expect(screen.queryByText("No history yet.")).not.toBeInTheDocument();
  });

  it("renders a very long user name in full", () => {
    const longName = "Bartholomew Alexander Fitzgerald-Montgomery-Wellington the Third of Copenhagen";
    const entry: StatusChangeHistoryEntry = { ...ENTRIES[0], user: { name: longName } };
    render(<StatusChangeHistory entries={[entry]} now={NOW} />);

    expect(historyRows()[0]).toHaveTextContent(longName);
  });

  it("does not repeat the item name in entries", () => {
    // Each entry starts with the phrase, never with an item name such as "Oat milk:".
    render(<StatusChangeHistory entries={ENTRIES} now={NOW} />);

    for (const row of historyRows()) {
      expect(row.textContent).toMatch(/^(Flagged running low|Flagged out|Marked as bought) by /);
    }
  });
});
