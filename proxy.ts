import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: is there a session cookie at all?
// It never queries the database. The real check is in app/(app)/layout.tsx
// and in every Server Action.
export function proxy(request: NextRequest) {
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
