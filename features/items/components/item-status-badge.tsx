import { Badge } from "@/components/ui/badge";
import type { ItemStatus } from "@/generated/prisma/client";

// Every status gets a color AND a text label, never color alone.
// IN_STOCK is not shown on the shopping list; it is here so the Record covers every status.
const STATUS_STYLES: Record<ItemStatus, { label: string; className: string }> = {
  IN_STOCK: { label: "In stock", className: "border-emerald-300 bg-emerald-100 text-emerald-900" },
  RUNNING_LOW: { label: "Running low", className: "border-amber-300 bg-amber-100 text-amber-900" },
  OUT: { label: "Out", className: "border-red-300 bg-red-100 text-red-900" },
};

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const { label, className } = STATUS_STYLES[status];

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}
