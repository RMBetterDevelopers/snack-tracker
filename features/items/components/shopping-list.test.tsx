import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ShoppingListItem } from "@/features/items/data-access";
import { ShoppingList } from "./shopping-list";

// The rows render MarkAsBoughtButton, which imports the Server Action.
vi.mock("@/features/items/actions", () => ({
  markAsBought: vi.fn(),
}));

const ITEMS: ShoppingListItem[] = [
  { id: "ckout0000000000000000000a", name: "Coca-Cola Zero", category: "SODA", status: "OUT" },
  { id: "cklow0000000000000000000b", name: "Oat milk", category: "COFFEE", status: "RUNNING_LOW" },
  { id: "cklow0000000000000000000c", name: "Rice cakes", category: "SNACK", status: "RUNNING_LOW" },
  { id: "cklow0000000000000000000d", name: "Dish soap", category: "OTHER", status: "OUT" },
];

describe("ShoppingList", () => {
  it("shows the empty state when nothing is flagged", () => {
    render(<ShoppingList items={[]} />);

    expect(screen.getByText("Nothing to buy. All stocked up!")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows one row per item, in the order given", () => {
    render(<ShoppingList items={ITEMS} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    ITEMS.forEach((item, index) => {
      expect(rows[index]).toHaveTextContent(item.name);
    });
    expect(screen.queryByText("Nothing to buy. All stocked up!")).not.toBeInTheDocument();
  });

  it.each([
    ["Coca-Cola Zero", "Soda", "Out"],
    ["Oat milk", "Coffee", "Running low"],
    ["Rice cakes", "Snack", "Running low"],
    ["Dish soap", "Other", "Out"],
  ])("row '%s' shows category %s, status %s and a Bought button", (name, category, status) => {
    render(<ShoppingList items={ITEMS} />);

    const row = screen.getAllByRole("listitem").find((li) => li.textContent?.includes(name));
    expect(row).toBeDefined();
    const scoped = within(row as HTMLElement);
    expect(scoped.getByText(name)).toBeInTheDocument();
    expect(scoped.getByText(category)).toBeInTheDocument();
    expect(scoped.getByText(status)).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "Bought" })).toBeEnabled();
  });

  it("gives each row's form the id of its own item", () => {
    const { container } = render(<ShoppingList items={ITEMS} />);

    const ids = [...container.querySelectorAll<HTMLInputElement>('input[name="itemId"]')].map(
      (input) => input.value,
    );
    expect(ids).toEqual(ITEMS.map((item) => item.id));
  });
});
