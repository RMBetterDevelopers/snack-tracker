import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, type SignInResult } from "@/features/auth/actions";
import { SignInForm } from "./sign-in-form";

// Mock the Server Action at the module boundary. The real one needs Better Auth.
vi.mock("@/features/auth/actions", () => ({
  signIn: vi.fn(),
}));

const signInMock = vi.mocked(signIn);

function resolveWith(result: SignInResult) {
  signInMock.mockResolvedValue(result);
}

async function submit() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

describe("SignInForm", () => {
  beforeEach(() => {
    signInMock.mockReset();
  });

  it("renders the email and password fields and the sign-in button, with no sign-up link", () => {
    render(<SignInForm />);

    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/sign up|create account/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends the typed email and password to signIn", async () => {
    resolveWith({ ok: false, error: "INVALID_CREDENTIALS" });
    render(<SignInForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.type(screen.getByLabelText("Password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByRole("alert");
    expect(signInMock).toHaveBeenCalledTimes(1);
    const formData = signInMock.mock.calls[0][1];
    expect(formData.get("email")).toBe("someone@example.com");
    expect(formData.get("password")).toBe("secret-password");
  });

  it("shows field errors under each input for INVALID_INPUT", async () => {
    resolveWith({
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: { email: ["Email is required"], password: ["Password is required"] },
    });
    render(<SignInForm />);

    await submit();

    const emailError = await screen.findByText("Email is required");
    const passwordError = screen.getByText("Password is required");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-describedby", emailError.id);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", passwordError.id);
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows only the email error when only the email is invalid", async () => {
    resolveWith({
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: { email: ["Enter a valid email"] },
    });
    render(<SignInForm />);

    await submit();

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-describedby");
  });

  it("shows 'Wrong email or password.' for INVALID_CREDENTIALS and keeps the email", async () => {
    resolveWith({ ok: false, error: "INVALID_CREDENTIALS" });
    render(<SignInForm />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
    expect(screen.getByLabelText("Email")).toHaveValue("someone@example.com");
  });

  it("shows the generic message for UNKNOWN", async () => {
    resolveWith({ ok: false, error: "UNKNOWN" });
    render(<SignInForm />);

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
  });

  it("disables the button with 'Signing in…' while pending", async () => {
    // Never resolves, so the form stays pending (like a slow sign-in).
    signInMock.mockReturnValue(new Promise<SignInResult>(() => {}));
    render(<SignInForm />);

    await submit();

    const button = await screen.findByRole("button", { name: "Signing in…" });
    expect(button).toBeDisabled();
  });
});
