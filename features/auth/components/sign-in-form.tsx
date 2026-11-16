"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInResult } from "@/features/auth/actions";

const FORM_ERROR_MESSAGES: Record<Exclude<SignInResult["error"], "INVALID_INPUT">, string> = {
  INVALID_CREDENTIALS: "Wrong email or password.",
  UNKNOWN: "Something went wrong. Please try again.",
};

function formErrorMessage(result: SignInResult | null): string | null {
  if (!result || result.error === "INVALID_INPUT") {
    return null;
  }
  return FORM_ERROR_MESSAGES[result.error];
}

export function SignInForm() {
  // state = the last result from signIn (null before the first submit).
  // On success signIn redirects to "/", so state only ever holds an error.
  const [state, formAction, isPending] = useActionState(signIn, null);

  // React resets uncontrolled fields after a form action. Keeping the email
  // controlled means the user does not have to retype it after an error.
  const [email, setEmail] = useState("");

  const fieldErrors = state?.error === "INVALID_INPUT" ? state.fieldErrors : {};
  const emailError = fieldErrors.email?.[0];
  const passwordError = fieldErrors.password?.[0];
  const formError = formErrorMessage(state);

  return (
    <Card>
      <CardContent>
        <form action={formAction} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && (
              <p id="email-error" className="text-sm text-destructive">
                {emailError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? "password-error" : undefined}
            />
            {passwordError && (
              <p id="password-error" className="text-sm text-destructive">
                {passwordError}
              </p>
            )}
          </div>

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
