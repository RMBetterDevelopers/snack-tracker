"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { markAsBought, type MarkAsBoughtResult } from "@/features/items/actions";

type MarkAsBoughtError = Extract<MarkAsBoughtResult, { ok: false }>["error"];

const ERROR_MESSAGES: Record<MarkAsBoughtError, string> = {
  UNAUTHENTICATED: "Please sign in again.",
  INVALID_INPUT: "Couldn't mark as bought. Please refresh.",
  NOT_FOUND: "Couldn't mark as bought. Please refresh.",
  ARCHIVED: "Couldn't mark as bought. Please refresh.",
};

function errorMessage(result: MarkAsBoughtResult | null): string | null {
  if (!result || result.ok) {
    return null;
  }
  return ERROR_MESSAGES[result.error];
}

// One tap, no confirm. On success the Server Action revalidates /shopping-list,
// so the re-rendered list (without this row) comes back in the same response.
export function MarkAsBoughtButton({ itemId }: { itemId: string }) {
  // state = the last result from markAsBought (null before the first tap).
  const [state, formAction, isPending] = useActionState(markAsBought, null);
  const error = errorMessage(state);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Bought"}
      </Button>
      {error && (
        <p role="alert" className="max-w-40 text-right text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
