import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data: templates, error } = await supabase
    .from("organizer_templates")
    .select("id, name, tax_year, organizer_template_items(count)")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Organizer templates</h1>
        <Link
          href="/dashboard/templates/new"
          className="rounded-md bg-ledger px-3 py-2 text-sm font-medium text-white hover:bg-ledger-dark"
        >
          New template
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600">Couldn&apos;t load templates: {error.message}</p>
      )}

      {!error && (!templates || templates.length === 0) && (
        <p className="rounded-md border border-hairline bg-white px-4 py-6 text-center text-sm text-ink-muted">
          No templates yet. Create one to start sending organizers.
        </p>
      )}

      {templates && templates.length > 0 && (
        <ul className="flex flex-col gap-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-md border border-hairline bg-white px-4 py-3"
            >
              <span className="text-ink">{t.name}</span>
              <span className="text-sm text-ink-muted">
                {t.tax_year} · {t.organizer_template_items[0]?.count ?? 0} questions
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
