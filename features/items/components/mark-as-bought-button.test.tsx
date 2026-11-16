import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { markAsBought, type MarkAsBoughtResult } from "@/features/items/actions";
import { MarkAsBoughtButton } from "./mark-as-bought-button";

// Mock the Server Action at the module boundary. The real one needs a session and the DB.
vi.mock("@/features/items/actions", () => ({
  markAsBought: vi.fn(),
}));

const markAsBoughtMock = vi.mocked(markAsBought);
const ITEM_ID = "ckxyz1234567890abcdefghij";

async function tapBought() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Bought" }));
  return user;
}

describe("MarkAsBoughtButton", () => {
  beforeEach(() => {
    markAsBoughtMock.mockReset();
  });

  it("shows an enabled 'Bought' button and no error when idle", () => {
    render(<MarkAsBoughtButton itemId={ITEM_ID} />);

    expect(screen.getByRole("button", { name: "Bought" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends only the item id to markAsBought", async () => {
    markAsBoughtMock.mockResolvedValue({ ok: true, data: { itemId: ITEM_ID, changed: true } });
    render(<MarkAsBoughtButton itemId={ITEM_ID} />);

    await tapBought();

    await vi.waitFor(() => expect(markAsBoughtMock).toHaveBeenCalledTimes(1));
    const formData = markAsBoughtMock.mock.calls[0][1];
    expect(formData.get("itemId")).toBe(ITEM_ID);
    expect([...formData.keys()]).toEqual(["itemId"]);
  });

  it("is disabled with 'Saving…' while pending, and a second tap does not call the action again", async () => {
    // Stays pending until we resolve it (like a slow network). We resolve it at
    // the end: React entangles pending async actions, so a promise that never
    // settles would keep later tests stuck in the pending state too.
    let resolveAction: (result: MarkAsBoughtResult) => void = () => {};
    markAsBoughtMock.mockReturnValue(
      new Promise<MarkAsBoughtResult>((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(<MarkAsBoughtButton itemId={ITEM_ID} />);

    const user = await tapBought();

    const button = await screen.findByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(markAsBoughtMock).toHaveBeenCalledTimes(1);

    resolveAction({ ok: true, data: { itemId: ITEM_ID, changed: true } });
    expect(await screen.findByRole("button", { name: "Bought" })).toBeEnabled();
    expect(markAsBoughtMock).toHaveBeenCalledTimes(1);
  });

  it("shows no error and is enabled again after success", async () => {
    markAsBoughtMock.mockResolvedValue({ ok: true, data: { itemId: ITEM_ID, changed: true } });
    render(<MarkAsBoughtButton itemId={ITEM_ID} />);

    await tapBought();

    expect(await screen.findByRole("button", { name: "Bought" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows no error when someone else already bought it (changed: false)", async () => {
    markAsBoughtMock.mockResolvedValue({ ok: true, data: { itemId: ITEM_ID, changed: false } });
    render(<MarkAsBoughtButton itemId={ITEM_ID} />);

    await tapBought();

    expect(await screen.findByRole("button", { name: "Bought" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows 'Please sign in again.' for UNAUTHENTICATED", async () => {
    markAsBoughtMock.mockResolvedValue({ ok: false, error: "UNAUTHENTICATED" });
    render(<MarkAsBoughtButton itemId={ITEM_ID} />);

    await tapBought();

    expect(await screen.findByRole("alert")).toHaveTextContent("Please sign in again.");
    expect(screen.getByRole("button", { name: "Bought" })).toBeEnabled();
  });

  it.each(["INVALID_INPUT", "NOT_FOUND", "ARCHIVED"] as const)(
    "shows 'Couldn't mark as bought. Please refresh.' for %s",
    async (error) => {
      markAsBoughtMock.mockResolvedValue({ ok: false, error });
      render(<MarkAsBoughtButton itemId={ITEM_ID} />);

      await tapBought();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Couldn't mark as bought. Please refresh.",
      );
      expect(screen.getByRole("button", { name: "Bought" })).toBeEnabled();
    },
  );
});
