import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { signOut } from "@/app/actions";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }
  if (profile.role === "client") {
    redirect("/portal");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Firm dashboard</h1>
        <form action={signOut}>
          <button className="text-sm text-ink-muted underline underline-offset-2">
            Sign out
          </button>
        </form>
      </div>
      <p className="text-ink-muted">
        Signed in as {profile.full_name} ({profile.role}).
      </p>
      <p className="rounded-md border border-hairline bg-white px-4 py-3 text-sm text-ink-muted">
        Client list and the organizer builder land here next.
      </p>
    </main>
  );
}
