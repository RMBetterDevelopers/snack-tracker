import { redirect } from "next/navigation";
import { signOut } from "@/features/auth/actions";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getCurrentSession } from "@/lib/session";

// The real session check for every page in (app). proxy.ts only looks for the
// cookie; this asks Better Auth whether the session is actually valid.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="font-semibold">Office Snack Tracker</span>
          <form action={signOut}>
            <SignOutButton />
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
