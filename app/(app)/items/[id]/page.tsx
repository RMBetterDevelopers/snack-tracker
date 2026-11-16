import { notFound, redirect } from "next/navigation";
import { ItemDetailHeader } from "@/features/items/components/item-detail-header";
import { getItem } from "@/features/items/data-access";
import { itemDetailParamsSchema } from "@/features/items/schema";
import { StatusChangeHistory } from "@/features/status-changes/components/status-change-history";
import { listItemStatusChanges } from "@/features/status-changes/data-access";
import { getCurrentSession } from "@/lib/session";

type ItemDetailPageProps = {
  // In Next.js 16, route params arrive as a Promise.
  params: Promise<{ id: string }>;
};

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  // Cached per request, so this reuses the layout's lookup. The layout and page
  // can render in parallel, so the page does not rely on the layout's redirect.
  const session = await getCurrentSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const parsed = itemDetailParamsSchema.safeParse({ id });
  if (!parsed.success) {
    notFound();
  }

  // Archived items are shown too, with an "Archived" note.
  const item = await getItem(parsed.data.id);
  if (!item) {
    notFound();
  }

  const entries = await listItemStatusChanges(item.id);
  // One "now" per request, on the server, so all entries are relative to the same moment.
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <ItemDetailHeader item={item} />
      <StatusChangeHistory entries={entries} now={now} />
    </div>
  );
}
