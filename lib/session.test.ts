import { headers } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { getCurrentSession, type Session } from "./session";

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

const requestHeaders = new Headers({ cookie: "better-auth.session_token=test" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(headers).mockResolvedValue(requestHeaders as Awaited<ReturnType<typeof headers>>);
});

describe("getCurrentSession", () => {
  it("returns null when nobody is signed in", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    expect(await getCurrentSession()).toBeNull();
  });

  it("returns the session when signed in", async () => {
    const session = {
      user: { id: "user-1", name: "Test User" },
      session: { id: "session-1", userId: "user-1" },
    } as Session;
    vi.mocked(auth.api.getSession).mockResolvedValue(session);

    expect(await getCurrentSession()).toBe(session);
  });

  it("passes the incoming request headers to Better Auth", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    await getCurrentSession();

    expect(auth.api.getSession).toHaveBeenCalledWith({ headers: requestHeaders });
  });
});
