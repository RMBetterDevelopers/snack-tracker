"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getCurrentSession } from "@/lib/session";
import { signInSchema, type SignInFieldErrors } from "./schema";

export type SignInResult =
  | { ok: false; error: "INVALID_INPUT"; fieldErrors: SignInFieldErrors }
  | { ok: false; error: "INVALID_CREDENTIALS" }
  | { ok: false; error: "UNKNOWN" };

function readField(formData: FormData, name: string): unknown {
  return formData.get(name) ?? "";
}

// The one Server Action without a session check: it is what creates the session.
// On success it redirects to "/" and never returns.
export async function signIn(
  _prevState: SignInResult | null,
  formData: FormData,
): Promise<SignInResult> {
  const parsed = signInSchema.safeParse({
    email: readField(formData, "email"),
    password: readField(formData, "password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    // nextCookies() (lib/auth.ts) sets the session cookie on this action's response.
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (error) {
    if (isAPIError(error)) {
      // Same answer for wrong password and unknown email, so we don't reveal
      // which emails exist.
      if (error.status === "UNAUTHORIZED") {
        return { ok: false, error: "INVALID_CREDENTIALS" };
      }
      return { ok: false, error: "UNKNOWN" };
    }
    throw error;
  }

  // Outside the try/catch: redirect() works by throwing, and a catch would swallow it.
  redirect("/");
}

export async function signOut(): Promise<void> {
  const session = await getCurrentSession();
  if (session) {
    // Deletes the session row; nextCookies() clears the cookie.
    await auth.api.signOut({ headers: await headers() });
  }
  redirect("/sign-in");
}
