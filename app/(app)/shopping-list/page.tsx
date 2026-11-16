import { redirect } from "next/navigation";
import { ShoppingList } from "@/features/items/components/shopping-list";
import { listShoppingListItems } from "@/features/items/data-access";
import { getCurrentSession } from "@/lib/session";

export default async function ShoppingListPage() {
  // Cached per request, so this reuses the layout's lookup. The layout and page
  // can render in parallel, so the page does not rely on the layout's redirect.
  const session = await getCurrentSession();
  if (!session) {
    redirect("/sign-in");
  }

  const items = await listShoppingListItems();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Shopping list</h1>
      <ShoppingList items={items} />
    </div>
  );
}
