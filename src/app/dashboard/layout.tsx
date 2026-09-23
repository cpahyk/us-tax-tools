import { Notifications } from "@/components/notifications";
import { notificationEmailConfigured } from "@/lib/email";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { getCurrentProfile } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }
  if (profile.role === "client") {
    redirect("/portal");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/dashboard" className="font-semibold text-ink">
              US Tax Tools
            </Link>
            <Link href="/dashboard/clients" className="text-ink-muted hover:text-ink">
              Clients
            </Link>
            <Link href="/dashboard/templates" className="text-ink-muted hover:text-ink">
              Templates
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <Notifications area="dashboard" emailConfigured={notificationEmailConfigured()} />
            <span>{profile.full_name}</span>
            <form action={signOut}>
              <button className="underline underline-offset-2 hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
