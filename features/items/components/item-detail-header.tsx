import { Badge } from "@/components/ui/badge";
import type { ItemDetail } from "../data-access";
import { CATEGORY_LABELS } from "./category-labels";
import { ItemStatusBadge } from "./item-status-badge";

export function ItemDetailHeader({ item }: { item: ItemDetail }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold wrap-anywhere">{item.name}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{CATEGORY_LABELS[item.category]}</span>
        <ItemStatusBadge status={item.status} />
        {item.archived && <Badge variant="secondary">Archived</Badge>}
      </div>
    </div>
  );
}
