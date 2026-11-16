import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const pageUrl = "http://localhost:3000/shopping-list";

function isRedirectToSignIn(response: Response): boolean {
  const location = response.headers.get("location");
  return response.status >= 300 && response.status < 400 && location !== null && new URL(location).pathname === "/sign-in";
}

describe("proxy", () => {
  it("redirects a page request without a session cookie to /sign-in", () => {
    const response = proxy(new NextRequest(pageUrl));

    expect(isRedirectToSignIn(response)).toBe(true);
  });

  it("lets a Server Action request without a session cookie through", () => {
    const request = new NextRequest(pageUrl, {
      method: "POST",
      headers: { "Next-Action": "abc123" },
    });

    const response = proxy(request);

    expect(isRedirectToSignIn(response)).toBe(false);
    // NextResponse.next() marks the response with this header.
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a page request with a session cookie through", () => {
    const request = new NextRequest(pageUrl, {
      headers: { cookie: "better-auth.session_token=test" },
    });

    const response = proxy(request);

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
