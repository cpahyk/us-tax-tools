import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteButton, SendOrganizerForm } from "./client-actions";

type OrganizerRow = {
  id: string;
  title: string;
  tax_year: number;
  status: string;
  sent_at: string | null;
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, primary_contact_name, email, client_type, status")
    .eq("id", id)
    .single();

  if (!client) {
    notFound();
  }

  const [{ data: organizers }, { data: templates }] = await Promise.all([
    supabase
      .from("organizers")
      .select("id, title, tax_year, status, sent_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("organizer_templates").select("id, name, tax_year").order("name"),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{client.primary_contact_name}</h1>
        <p className="text-ink-muted">
          {client.email} · <span className="capitalize">{client.client_type}</span>
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-ink">Portal access</h2>
        <InviteButton clientId={client.id} status={client.status} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-ink">Send an organizer</h2>
        <SendOrganizerForm clientId={client.id} templates={templates ?? []} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-ink">Organizers</h2>
        {!organizers || organizers.length === 0 ? (
          <p className="text-sm text-ink-muted">None sent yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-hairline bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Tax year</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(organizers as OrganizerRow[]).map((o) => (
                  <tr key={o.id} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/dashboard/organizers/${o.id}`}
                        className="text-ledger hover:underline"
                      >
                        {o.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-ink-muted">{o.tax_year}</td>
                    <td className="px-4 py-2 text-ink-muted capitalize">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
