import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ItemDetail } from "@/features/items/data-access";
import { ItemDetailHeader } from "./item-detail-header";

const OAT_MILK: ItemDetail = {
  id: "cklow0000000000000000000b",
  name: "Oat milk",
  category: "COFFEE",
  status: "RUNNING_LOW",
  archived: false,
};

describe("ItemDetailHeader", () => {
  it("shows the item name as the level-1 heading", () => {
    render(<ItemDetailHeader item={OAT_MILK} />);

    expect(screen.getByRole("heading", { level: 1, name: "Oat milk" })).toBeInTheDocument();
  });

  it.each([
    ["SNACK", "Snack"],
    ["COFFEE", "Coffee"],
    ["SODA", "Soda"],
    ["OTHER", "Other"],
  ] as const)("shows the category label for %s", (category, label) => {
    render(<ItemDetailHeader item={{ ...OAT_MILK, category }} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([
    ["IN_STOCK", "In stock"],
    ["RUNNING_LOW", "Running low"],
    ["OUT", "Out"],
  ] as const)("shows the status badge text for %s", (status, label) => {
    render(<ItemDetailHeader item={{ ...OAT_MILK, status }} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("does not show the Archived note for an active item", () => {
    render(<ItemDetailHeader item={OAT_MILK} />);

    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("shows the Archived note for an archived item", () => {
    render(<ItemDetailHeader item={{ ...OAT_MILK, archived: true }} />);

    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Oat milk" })).toBeInTheDocument();
  });

  it("has no buttons, because the page is read-only", () => {
    render(<ItemDetailHeader item={OAT_MILK} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
