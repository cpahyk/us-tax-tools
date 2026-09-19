import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";

export default async function DashboardPage() {
  // The layout already redirected signed-out/client-role visitors away —
  // this is just for the greeting text, not access control.
  const profile = await getCurrentProfile();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="text-ink-muted">
          Signed in as {profile?.full_name} ({profile?.role}).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/clients"
          className="rounded-md border border-hairline bg-white px-4 py-4 hover:border-ledger"
        >
          <p className="font-medium text-ink">Clients</p>
          <p className="text-sm text-ink-muted">Add clients and send organizers.</p>
        </Link>
        <Link
          href="/dashboard/templates"
          className="rounded-md border border-hairline bg-white px-4 py-4 hover:border-ledger"
        >
          <p className="font-medium text-ink">Organizer templates</p>
          <p className="text-sm text-ink-muted">Build reusable question sets.</p>
        </Link>
      </div>
    </div>
  );
}
