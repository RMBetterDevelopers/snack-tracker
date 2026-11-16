import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentSession, type Session } from "@/lib/session";
import { markAsBought } from "./actions";
import { markItemBought } from "./data-access";

vi.mock("@/lib/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("./data-access", () => ({ markItemBought: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ITEM_ID = "cmhz8x0q50000a8u7k3j2f9vd";

function sessionFor(userId: string): Session {
  return {
    user: { id: userId, name: "Test User" },
    session: { id: `session-${userId}`, userId },
  } as Session;
}

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentSession).mockResolvedValue(sessionFor("user-1"));
});

describe("markAsBought", () => {
  it("returns UNAUTHENTICATED without a session and does nothing else", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    const result = await markAsBought(null, formData({ itemId: ITEM_ID }));

    expect(result).toEqual({ ok: false, error: "UNAUTHENTICATED" });
    expect(markItemBought).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns INVALID_INPUT when itemId is missing", async () => {
    const result = await markAsBought(null, new FormData());

    expect(result).toEqual({ ok: false, error: "INVALID_INPUT" });
    expect(markItemBought).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns INVALID_INPUT when itemId is not a cuid", async () => {
    const result = await markAsBought(null, formData({ itemId: "not a cuid!" }));

    expect(result).toEqual({ ok: false, error: "INVALID_INPUT" });
    expect(markItemBought).not.toHaveBeenCalled();
  });

  it("maps NOT_FOUND without revalidating", async () => {
    vi.mocked(markItemBought).mockResolvedValue({ kind: "NOT_FOUND" });

    const result = await markAsBought(null, formData({ itemId: ITEM_ID }));

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps ARCHIVED without revalidating", async () => {
    vi.mocked(markItemBought).mockResolvedValue({ kind: "ARCHIVED" });

    const result = await markAsBought(null, formData({ itemId: ITEM_ID }));

    expect(result).toEqual({ ok: false, error: "ARCHIVED" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns changed: true and revalidates the shopping list when bought", async () => {
    vi.mocked(markItemBought).mockResolvedValue({ kind: "BOUGHT", oldStatus: "OUT" });

    const result = await markAsBought(null, formData({ itemId: ITEM_ID }));

    expect(result).toEqual({ ok: true, data: { itemId: ITEM_ID, changed: true } });
    expect(markItemBought).toHaveBeenCalledWith({ itemId: ITEM_ID, userId: "user-1" });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/shopping-list");
  });

  it("returns changed: false and still revalidates when the item is already in stock", async () => {
    vi.mocked(markItemBought).mockResolvedValue({ kind: "ALREADY_IN_STOCK" });

    const result = await markAsBought(null, formData({ itemId: ITEM_ID }));

    expect(result).toEqual({ ok: true, data: { itemId: ITEM_ID, changed: false } });
    expect(revalidatePath).toHaveBeenCalledWith("/shopping-list");
  });

  it("uses the session user, ignoring any userId in the form", async () => {
    vi.mocked(markItemBought).mockResolvedValue({ kind: "BOUGHT", oldStatus: "RUNNING_LOW" });

    await markAsBought(null, formData({ itemId: ITEM_ID, userId: "someone-else" }));

    expect(markItemBought).toHaveBeenCalledWith({ itemId: ITEM_ID, userId: "user-1" });
  });

  it("lets any signed-in user mark items bought", async () => {
    vi.mocked(markItemBought).mockResolvedValue({ kind: "BOUGHT", oldStatus: "OUT" });

    vi.mocked(getCurrentSession).mockResolvedValueOnce(sessionFor("user-a"));
    const first = await markAsBought(null, formData({ itemId: ITEM_ID }));
    vi.mocked(getCurrentSession).mockResolvedValueOnce(sessionFor("user-b"));
    const second = await markAsBought(null, formData({ itemId: ITEM_ID }));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(markItemBought).toHaveBeenNthCalledWith(1, { itemId: ITEM_ID, userId: "user-a" });
    expect(markItemBought).toHaveBeenNthCalledWith(2, { itemId: ITEM_ID, userId: "user-b" });
  });

  it("rethrows unexpected errors from data-access", async () => {
    vi.mocked(markItemBought).mockRejectedValue(new Error("database down"));

    await expect(markAsBought(null, formData({ itemId: ITEM_ID }))).rejects.toThrow("database down");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
