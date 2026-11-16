import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";

export type Session = typeof auth.$Infer.Session;

// The only way pages and Server Actions get the signed-in user.
// Reads the session cookie from the incoming request and checks it against the
// database. Returns null when nobody is signed in (or the cookie is stale).
//
// React `cache` dedupes calls within one request, so the layout and the page
// share a single lookup.
export const getCurrentSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});
