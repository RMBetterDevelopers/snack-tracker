import type { ShoppingListItem } from "../data-access";
import { CATEGORY_LABELS } from "./category-labels";
import { ItemStatusBadge } from "./item-status-badge";
import { MarkAsBoughtButton } from "./mark-as-bought-button";

export function ShoppingList({ items }: { items: ShoppingListItem[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">Nothing to buy. All stocked up!</p>;
  }

  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium wrap-anywhere">{item.name}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{CATEGORY_LABELS[item.category]}</span>
              <ItemStatusBadge status={item.status} />
            </div>
          </div>
          <div className="shrink-0">
            <MarkAsBoughtButton itemId={item.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}
