import type { ItemCategory } from "@/generated/prisma/client";

// The text shown for each item category. Shared by the shopping list and the item detail page.
export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  SNACK: "Snack",
  COFFEE: "Coffee",
  SODA: "Soda",
  OTHER: "Other",
};
