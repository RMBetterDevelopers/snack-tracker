import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ItemStatusBadge } from "./item-status-badge";

describe("ItemStatusBadge", () => {
  it("shows 'Running low' as text with amber colors", () => {
    render(<ItemStatusBadge status="RUNNING_LOW" />);

    const badge = screen.getByText("Running low");
    expect(badge).toHaveClass("bg-amber-100", "text-amber-900", "border-amber-300");
  });

  it("shows 'Out' as text with red colors", () => {
    render(<ItemStatusBadge status="OUT" />);

    const badge = screen.getByText("Out");
    expect(badge).toHaveClass("bg-red-100", "text-red-900", "border-red-300");
  });

  it("uses a different label and different colors for RUNNING_LOW and OUT", () => {
    render(
      <>
        <ItemStatusBadge status="RUNNING_LOW" />
        <ItemStatusBadge status="OUT" />
      </>,
    );

    const runningLow = screen.getByText("Running low");
    const out = screen.getByText("Out");
    expect(runningLow.textContent).not.toBe(out.textContent);
    expect(runningLow).not.toHaveClass("bg-red-100");
    expect(out).not.toHaveClass("bg-amber-100");
  });

  it("shows 'In stock' as text with green colors", () => {
    render(<ItemStatusBadge status="IN_STOCK" />);

    expect(screen.getByText("In stock")).toHaveClass("bg-emerald-100", "text-emerald-900");
  });
});
