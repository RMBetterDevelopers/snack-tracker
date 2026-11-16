import { redirect } from "next/navigation";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { getCurrentSession } from "@/lib/session";

export default async function SignInPage() {
  // Already signed in? Nothing to do here.
  const session = await getCurrentSession();
  if (session) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Office Snack Tracker</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue</p>
      </div>
      <SignInForm />
    </main>
  );
}
