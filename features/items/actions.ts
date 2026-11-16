"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/session";
import { markItemBought } from "./data-access";
import { markAsBoughtSchema } from "./schema";

export type MarkAsBoughtResult =
  | { ok: true; data: { itemId: string; changed: boolean } }
  | { ok: false; error: "UNAUTHENTICATED" | "INVALID_INPUT" | "NOT_FOUND" | "ARCHIVED" };

// useActionState signature: (previous result, form data) => next result.
// Unexpected errors (database down, FK failure) are not caught; they propagate.
export async function markAsBought(
  _prevState: MarkAsBoughtResult | null,
  formData: FormData,
): Promise<MarkAsBoughtResult> {
  const session = await getCurrentSession();
  if (!session) {
    return { ok: false, error: "UNAUTHENTICATED" };
  }

  const parsed = markAsBoughtSchema.safeParse({ itemId: formData.get("itemId") ?? "" });
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT" };
  }
  const { itemId } = parsed.data;

  // The buyer is always the session user, never a value from the form.
  const outcome = await markItemBought({ itemId, userId: session.user.id });

  switch (outcome.kind) {
    case "BOUGHT":
      revalidatePath("/shopping-list");
      return { ok: true, data: { itemId, changed: true } };
    case "ALREADY_IN_STOCK":
      // Someone else bought it first (or a double tap): still a success, and the
      // refreshed list no longer shows it.
      revalidatePath("/shopping-list");
      return { ok: true, data: { itemId, changed: false } };
    case "NOT_FOUND":
      return { ok: false, error: "NOT_FOUND" };
    case "ARCHIVED":
      return { ok: false, error: "ARCHIVED" };
  }
}
