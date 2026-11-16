import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: is there a session cookie at all?
// It never queries the database. The real check is in app/(app)/layout.tsx
// and in every Server Action.
export function proxy(request: NextRequest) {
  // Server Action requests carry a `Next-Action` header. A redirect here would
  // hand the action client an HTML page it cannot parse, so let them through:
  // each action checks the session itself and returns UNAUTHENTICATED.
  if (request.headers.has("next-action")) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except the sign-in page, Better Auth's API, Next internals and static files.
  matcher: ["/((?!sign-in|api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
