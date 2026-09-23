import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { withSignedUrls } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/message-thread";
import type { PostedMessage } from "@/lib/actions/messages";
import { MarkReviewedButton } from "./mark-reviewed-button";

export default async function StaffOrganizerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id, title, tax_year, status, submitted_at, client_id, clients!organizers_client_firm_fk(primary_contact_name)")
    .eq("id", id)
    .maybeSingle();

  if (organizerError) {
    console.error("[staff/organizer] Lookup failed", { code: organizerError.code });
    throw new Error("Unable to load this organizer. Please try again.");
  }

  if (!organizer || !profile) {
    notFound();
  }

  const { data: items } = await supabase
    .from("organizer_items")
    .select("id, sort_order, section_title, prompt, help_text, response_type")
    .eq("organizer_id", id)
    .order("sort_order");

  const itemIds = (items ?? []).map((item) => item.id);

  const [{ data: responses }, { data: rawDocuments }, { data: rawMessages }] = await Promise.all([
    supabase
      .from("organizer_responses")
      .select("organizer_item_id, value")
      .in("organizer_item_id", itemIds),
    supabase
      .from("documents")
      .select("id, organizer_item_id, file_name, storage_path")
      .eq("organizer_id", id),
    supabase
      .from("organizer_messages")
      .select("id, author_id, body, created_at, profiles(full_name, role)")
      .eq("organizer_id", id)
      .order("created_at"),
  ]);

  const responseByItem = new Map((responses ?? []).map((r) => [r.organizer_item_id, r.value]));
  const documentsWithUrls = await withSignedUrls(supabase, rawDocuments ?? []);
  const documentsByItem = new Map<string, typeof documentsWithUrls>();
  for (const doc of documentsWithUrls) {
    const key = doc.organizer_item_id ?? "";
    documentsByItem.set(key, [...(documentsByItem.get(key) ?? []), doc]);
  }

  const initialMessages: PostedMessage[] = (rawMessages ?? []).map((m) => {
    const author = m.profiles as unknown as { full_name: string; role: string } | null;
    return {
      id: m.id,
      author_id: m.author_id,
      body: m.body,
      created_at: m.created_at,
      author_name: author?.full_name ?? "Unknown",
      author_role: author?.role ?? "",
    };
  });

  const clientName =
    (organizer.clients as unknown as { primary_contact_name: string } | null)
      ?.primary_contact_name ?? "";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/dashboard/clients/${organizer.client_id}`}
          className="text-sm text-ledger hover:underline"
        >
          ← {clientName}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{organizer.title}</h1>
        <p className="text-ink-muted">
          Tax year {organizer.tax_year} ·{" "}
          <span className="capitalize">{organizer.status.replace("_", " ")}</span>
          {organizer.submitted_at &&
            ` · submitted ${new Date(organizer.submitted_at).toLocaleDateString()}`}
        </p>
        {organizer.status === "submitted" && (
          <div className="mt-3">
            <MarkReviewedButton organizerId={organizer.id} />
          </div>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-ink">Responses</h2>
        {(items ?? []).map((item) => {
          const docs = documentsByItem.get(item.id) ?? [];
          return (
            <div key={item.id} className="rounded-md border border-hairline bg-white p-4">
              <p className="text-sm text-ink">{item.prompt}</p>
              {item.response_type === "file" ? (
                docs.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-1">
                    {docs.map((d) => (
                      <li key={d.id} className="text-sm">
                        {d.url ? (
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ledger hover:underline"
                          >
                            {d.file_name}
                          </a>
                        ) : (
                          d.file_name
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-ink-muted">No file uploaded</p>
                )
              ) : (
                <p className="mt-1 text-sm text-ink-muted">
                  {String(responseByItem.get(item.id) ?? "—")}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-ink">Messages</h2>
        <MessageThread
          organizerId={organizer.id}
          initialMessages={initialMessages}
          currentProfileId={profile.id}
        />
      </section>
    </div>
  );
}
