import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getItem, type ItemDetail } from "@/features/items/data-access";
import {
  listItemStatusChanges,
  type StatusChangeHistoryEntry,
} from "@/features/status-changes/data-access";
import { getCurrentSession } from "@/lib/session";
import ItemDetailPage from "./page";

// redirect() and notFound() throw inside Next.js; marker errors let us assert on them.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/features/items/data-access", () => ({
  getItem: vi.fn(),
}));

vi.mock("@/features/status-changes/data-access", () => ({
  listItemStatusChanges: vi.fn(),
}));

type Session = NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;

const ITEM_ID = "cklow0000000000000000000b";

const OAT_MILK: ItemDetail = {
  id: ITEM_ID,
  name: "Oat milk",
  category: "COFFEE",
  status: "RUNNING_LOW",
  archived: false,
};

const ENTRIES: StatusChangeHistoryEntry[] = [
  {
    id: "ckentry00000000000000000a",
    newStatus: "RUNNING_LOW",
    // 2 days and 1 hour ago, so the test does not depend on the exact run time.
    createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    user: { name: "Anna" },
  },
];

function renderPage(id: string) {
  return ItemDetailPage({ params: Promise.resolve({ id }) });
}

describe("ItemDetailPage", () => {
  beforeEach(() => {
    vi.mocked(getCurrentSession).mockReset();
    vi.mocked(getItem).mockReset();
    vi.mocked(listItemStatusChanges).mockReset();

    // The page only checks that a session exists; its contents do not matter here.
    vi.mocked(getCurrentSession).mockResolvedValue({} as Session);
    vi.mocked(getItem).mockResolvedValue(OAT_MILK);
    vi.mocked(listItemStatusChanges).mockResolvedValue(ENTRIES);
  });

  it("redirects to sign-in when nobody is signed in, without reading the item", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    await expect(renderPage(ITEM_ID)).rejects.toThrow("REDIRECT:/sign-in");
    expect(getItem).not.toHaveBeenCalled();
    expect(listItemStatusChanges).not.toHaveBeenCalled();
  });

  it.each(["not a cuid!", ""])("shows not-found for the malformed id '%s'", async (id) => {
    await expect(renderPage(id)).rejects.toThrow("NOT_FOUND");
    expect(getItem).not.toHaveBeenCalled();
    expect(listItemStatusChanges).not.toHaveBeenCalled();
  });

  it("shows not-found when the item does not exist", async () => {
    vi.mocked(getItem).mockResolvedValue(null);

    await expect(renderPage(ITEM_ID)).rejects.toThrow("NOT_FOUND");
    expect(getItem).toHaveBeenCalledWith(ITEM_ID);
    expect(listItemStatusChanges).not.toHaveBeenCalled();
  });

  it("renders the item and its history", async () => {
    render(await renderPage(ITEM_ID));

    expect(getItem).toHaveBeenCalledWith(ITEM_ID);
    expect(listItemStatusChanges).toHaveBeenCalledWith(ITEM_ID);
    expect(screen.getByRole("heading", { level: 1, name: "Oat milk" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Flagged running low by Anna, 2 days ago");
  });

  it("shows the empty history state for an item with no history", async () => {
    vi.mocked(listItemStatusChanges).mockResolvedValue([]);

    render(await renderPage(ITEM_ID));

    expect(screen.getByText("No history yet.")).toBeInTheDocument();
  });

  it("renders an archived item with the Archived note instead of not-found", async () => {
    vi.mocked(getItem).mockResolvedValue({ ...OAT_MILK, archived: true });

    render(await renderPage(ITEM_ID));

    expect(screen.getByRole("heading", { level: 1, name: "Oat milk" })).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Flagged running low by Anna");
  });
});
