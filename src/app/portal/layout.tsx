import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { getCurrentProfile } from "@/lib/auth";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }
  if (profile.role !== "client") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <span className="font-semibold text-ink">US Tax Tools</span>
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <span>{profile.full_name}</span>
            <form action={signOut}>
              <button className="underline underline-offset-2 hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-8">{children}</main>
    </div>
  );
}
