import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function SetupRequiredPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold text-ink">Your account needs setup</h1>
      <p className="max-w-md text-ink-muted">
        You are signed in, but your account has not been connected to a firm.
        Contact your firm administrator to finish setting up your access.
      </p>
      <Link href="/" prefetch={false} className="text-ledger underline underline-offset-2">
        Check access again
      </Link>
    </main>
  );
}
