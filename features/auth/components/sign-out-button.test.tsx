import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignOutButton } from "./sign-out-button";

describe("SignOutButton", () => {
  it("shows 'Sign out' and is enabled when idle", () => {
    render(
      <form>
        <SignOutButton />
      </form>,
    );

    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("is disabled with 'Signing out…' while the parent form is pending", async () => {
    // Stand-in for the signOut Server Action: never settles, so the form stays pending.
    const signOutAction = vi.fn(() => new Promise<void>(() => {}));
    render(
      <form action={signOutAction}>
        <SignOutButton />
      </form>,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));

    const button = await screen.findByRole("button", { name: "Signing out…" });
    expect(button).toBeDisabled();
    expect(signOutAction).toHaveBeenCalledTimes(1);
  });
});
