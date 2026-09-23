import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { withSignedUrls } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/message-thread";
import type { PostedMessage } from "@/lib/actions/messages";
import { OrganizerForm, type ItemWithResponse } from "./organizer-form";

export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, title, tax_year, status, firm_id, client_id, submitted_at, change_request_reason")
    .eq("id", id)
    .single();

  if (!organizer || !profile) {
    notFound();
  }

  const { data: items } = await supabase
    .from("organizer_items")
    .select("id, sort_order, section_title, prompt, help_text, response_type, options, is_required")
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
      .select("id, organizer_item_id, file_name, storage_path, created_at")
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

  const itemsWithData: ItemWithResponse[] = (items ?? []).map((item) => ({
    ...item,
    value: responseByItem.get(item.id) ?? null,
    documents: documentsByItem.get(item.id) ?? [],
  }));

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

  const readOnly = organizer.status === "submitted" || organizer.status === "reviewed";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{organizer.title}</h1>
        <p className="text-ink-muted">
          Tax year {organizer.tax_year} ·{" "}
          <span className="capitalize">{organizer.status.replace("_", " ")}</span>
        </p>
      </div>

      {!readOnly && organizer.change_request_reason && <section className="rounded border border-amber-300 bg-amber-50 p-4">
        <h2 className="font-semibold">Your preparer requested changes</h2>
        <p className="mt-2 whitespace-pre-wrap">{organizer.change_request_reason}</p>
        <p className="mt-2 text-sm">Update your answers below, then submit again.</p>
      </section>}
      {readOnly && (
        <p className="rounded-md border border-hairline bg-white px-4 py-3 text-sm text-ink-muted">
          This organizer was submitted
          {organizer.submitted_at
            ? ` on ${new Date(organizer.submitted_at).toLocaleDateString()}`
            : ""}{" "}
          and can no longer be edited here — contact your preparer if something needs to
          change.
        </p>
      )}

      <OrganizerForm
        organizerId={organizer.id}
        firmId={organizer.firm_id}
        clientId={organizer.client_id}
        items={itemsWithData}
        readOnly={readOnly}
      />

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
