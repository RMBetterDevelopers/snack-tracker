import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { getCurrentSession, type Session } from "@/lib/session";
import { signIn, signOut } from "./actions";

vi.mock("@/lib/auth", () => ({
  auth: { api: { signInEmail: vi.fn(), signOut: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
// Like the real redirect(), the mock throws so code after it never runs.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const requestHeaders = new Headers({ cookie: "better-auth.session_token=test" });

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

const validForm = () => formData({ email: "  someone@example.com ", password: "correct-password" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(headers).mockResolvedValue(requestHeaders as Awaited<ReturnType<typeof headers>>);
});

describe("signIn", () => {
  it("returns INVALID_INPUT with field errors for empty fields and does not call Better Auth", async () => {
    const result = await signIn(null, formData({ email: "", password: "" }));

    expect(result).toEqual({
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: { email: ["Email is required"], password: ["Password is required"] },
    });
    expect(auth.api.signInEmail).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("treats missing form fields as empty", async () => {
    const result = await signIn(null, new FormData());

    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    expect(auth.api.signInEmail).not.toHaveBeenCalled();
  });

  it("returns INVALID_INPUT for a malformed email", async () => {
    const result = await signIn(null, formData({ email: "nope", password: "x" }));

    expect(result).toEqual({
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: { email: ["Enter a valid email"] },
    });
  });

  it("returns INVALID_CREDENTIALS when Better Auth says UNAUTHORIZED", async () => {
    vi.mocked(auth.api.signInEmail).mockRejectedValue(
      new APIError("UNAUTHORIZED", { message: "Invalid email or password" }),
    );

    const result = await signIn(null, validForm());

    expect(result).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns UNKNOWN for any other Better Auth error", async () => {
    vi.mocked(auth.api.signInEmail).mockRejectedValue(new APIError("TOO_MANY_REQUESTS"));

    const result = await signIn(null, validForm());

    expect(result).toEqual({ ok: false, error: "UNKNOWN" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rethrows errors that are not Better Auth errors", async () => {
    vi.mocked(auth.api.signInEmail).mockRejectedValue(new Error("database down"));

    await expect(signIn(null, validForm())).rejects.toThrow("database down");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("signs in with the trimmed input and request headers, then redirects to /", async () => {
    vi.mocked(auth.api.signInEmail).mockResolvedValue(
      {} as Awaited<ReturnType<typeof auth.api.signInEmail>>,
    );

    await expect(signIn(null, validForm())).rejects.toThrow("NEXT_REDIRECT");

    expect(auth.api.signInEmail).toHaveBeenCalledWith({
      body: { email: "someone@example.com", password: "correct-password" },
      headers: requestHeaders,
    });
    expect(redirect).toHaveBeenCalledWith("/");
  });
});

describe("signOut", () => {
  it("does not call Better Auth when nobody is signed in, and redirects to /sign-in", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");

    expect(auth.api.signOut).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("signs out with the request headers when signed in, then redirects to /sign-in", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: "user-1", name: "Test User" },
      session: { id: "session-1", userId: "user-1" },
    } as Session);
    vi.mocked(auth.api.signOut).mockResolvedValue({ success: true, url: undefined, redirect: undefined });

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");

    expect(auth.api.signOut).toHaveBeenCalledWith({ headers: requestHeaders });
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });
});
