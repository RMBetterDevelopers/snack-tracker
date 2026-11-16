import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";

export default async function HomePage() {
  // Cached per request, so this reuses the layout's lookup. The layout and page
  // can render in parallel, so the page does not rely on the layout's redirect.
  const session = await getCurrentSession();
  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold break-words">Welcome, {session.user.name}</h1>
      <p className="text-muted-foreground">Items are coming soon.</p>
    </div>
  );
}
