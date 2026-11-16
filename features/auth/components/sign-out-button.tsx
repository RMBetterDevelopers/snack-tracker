"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Must be rendered inside <form action={signOut}>. useFormStatus reads the
// pending state of that parent form.
export function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
