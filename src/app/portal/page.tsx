import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type OrganizerRow = {
  id: string;
  title: string;
  tax_year: number;
  status: string;
};

export default async function PortalPage() {
  const supabase = await createClient();
  const { data: organizers, error } = await supabase
    .from("organizers")
    .select("id, title, tax_year, status")
    .order("tax_year", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-ink">Your organizers</h1>

      {error && (
        <p className="text-sm text-red-600">Couldn&apos;t load your organizers: {error.message}</p>
      )}

      {!error && (!organizers || organizers.length === 0) && (
        <p className="rounded-md border border-hairline bg-white px-4 py-6 text-center text-sm text-ink-muted">
          Nothing here yet. Your organizer will show up once your firm sends one.
        </p>
      )}

      {organizers && organizers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {(organizers as OrganizerRow[]).map((o) => (
            <li key={o.id}>
              <Link
                href={`/portal/organizers/${o.id}`}
                className="flex items-center justify-between rounded-md border border-hairline bg-white px-4 py-3 hover:border-ledger"
              >
                <span className="text-ink">{o.title}</span>
                <span className="text-sm capitalize text-ink-muted">
                  {o.tax_year} · {o.status.replace("_", " ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
