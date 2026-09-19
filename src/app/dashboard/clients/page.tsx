import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type ClientRow = {
  id: string;
  primary_contact_name: string;
  email: string;
  client_type: string;
  status: string;
};

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, primary_contact_name, email, client_type, status")
    .order("primary_contact_name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Clients</h1>
        <Link
          href="/dashboard/clients/new"
          className="rounded-md bg-ledger px-3 py-2 text-sm font-medium text-white hover:bg-ledger-dark"
        >
          Add client
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600">Couldn&apos;t load clients: {error.message}</p>
      )}

      {!error && (!clients || clients.length === 0) && (
        <p className="rounded-md border border-hairline bg-white px-4 py-6 text-center text-sm text-ink-muted">
          No clients yet. Add your first one to get started.
        </p>
      )}

      {clients && clients.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-hairline bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-hairline text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(clients as ClientRow[]).map((c) => (
                <tr key={c.id} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/dashboard/clients/${c.id}`}
                      className="text-ledger hover:underline"
                    >
                      {c.primary_contact_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{c.email}</td>
                  <td className="px-4 py-2 text-ink-muted capitalize">{c.client_type}</td>
                  <td className="px-4 py-2 text-ink-muted capitalize">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
