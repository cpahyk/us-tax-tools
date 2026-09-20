"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveResponse, submitOrganizerAction } from "./actions";

type DocRow = {
  id: string;
  file_name: string;
  storage_path: string;
  created_at: string;
  url: string | null;
};

export type ItemWithResponse = {
  id: string;
  sort_order: number;
  section_title: string | null;
  prompt: string;
  help_text: string | null;
  response_type: "text" | "number" | "boolean" | "select" | "file";
  options: { choices?: string[] } | null;
  is_required: boolean;
  value: unknown;
  documents: DocRow[];
};

export function OrganizerForm({
  organizerId,
  firmId,
  clientId,
  items,
  readOnly,
}: {
  organizerId: string;
  firmId: string;
  clientId: string;
  items: ItemWithResponse[];
  readOnly: boolean;
}) {
  const [submitPending, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {items.map((item, index) => {
        const previousSectionTitle = items[index - 1]?.section_title ?? null;
        const showSectionHeader = Boolean(item.section_title) && item.section_title !== previousSectionTitle;

        return (
          <div key={item.id} className="flex flex-col gap-2">
            {showSectionHeader && (
              <h2 className="mt-2 font-medium text-ink">{item.section_title}</h2>
            )}
            <ItemField
              item={item}
              organizerId={organizerId}
              firmId={firmId}
              clientId={clientId}
              readOnly={readOnly}
            />
          </div>
        );
      })}

      {!readOnly && (
        <div className="mt-4 flex flex-col items-start gap-2">
          <button
            onClick={() => {
              setSubmitError(null);
              startSubmit(async () => {
                const result = await submitOrganizerAction(organizerId);
                if (result.error) setSubmitError(result.error);
              });
            }}
            disabled={submitPending}
            className="rounded-md bg-ledger px-4 py-2 font-medium text-white hover:bg-ledger-dark disabled:opacity-60"
          >
            {submitPending ? "Submitting…" : "Submit organizer"}
          </button>
          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
        </div>
      )}
    </div>
  );
}

function ItemField({
  item,
  organizerId,
  firmId,
  clientId,
  readOnly,
}: {
  item: ItemWithResponse;
  organizerId: string;
  firmId: string;
  clientId: string;
  readOnly: boolean;
}) {
  const [value, setValue] = useState(item.value);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function commit(next: unknown) {
    setValue(next);
    setStatus("saving");
    startTransition(async () => {
      const result = await saveResponse(item.id, next);
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
      } else {
        setStatus("saved");
      }
    });
  }

  const label = (
    <label className="flex flex-col gap-1 text-sm text-ink">
      <span>
        {item.prompt}
        {item.is_required && <span className="text-red-600"> *</span>}
      </span>
      {item.help_text && <span className="text-xs text-ink-muted">{item.help_text}</span>}
    </label>
  );

  const statusLine = (
    <div className="h-4 text-xs">
      {status === "saving" && <span className="text-ink-muted">Saving…</span>}
      {status === "saved" && <span className="text-ledger">Saved</span>}
      {status === "error" && <span className="text-red-600">{errorMessage}</span>}
    </div>
  );

  if (readOnly) {
    return (
      <div className="rounded-md border border-hairline bg-white p-4">
        {label}
        {item.response_type === "file" ? (
          item.documents.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1">
              {item.documents.map((d) => (
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
          <p className="mt-1 text-ink-muted">{String(value ?? "—")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-hairline bg-white p-4">
      {label}
      <div className="mt-2">
        {item.response_type === "text" && (
          <input
            type="text"
            defaultValue={typeof value === "string" ? value : ""}
            onBlur={(e) => commit(e.target.value)}
            className="w-full rounded-md border border-hairline px-3 py-2 outline-none focus:border-ledger"
          />
        )}

        {item.response_type === "number" && (
          <input
            type="number"
            defaultValue={typeof value === "number" ? value : ""}
            onBlur={(e) => commit(e.target.value === "" ? null : Number(e.target.value))}
            className="w-full rounded-md border border-hairline px-3 py-2 outline-none focus:border-ledger"
          />
        )}

        {item.response_type === "boolean" && (
          <select
            defaultValue={value === true ? "true" : value === false ? "false" : ""}
            onChange={(e) => commit(e.target.value === "true")}
            className="w-full rounded-md border border-hairline px-3 py-2"
          >
            <option value="" disabled>
              Choose one
            </option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        )}

        {item.response_type === "select" &&
          (item.options?.choices?.length ? (
            <select
              defaultValue={typeof value === "string" ? value : ""}
              onChange={(e) => commit(e.target.value)}
              className="w-full rounded-md border border-hairline px-3 py-2"
            >
              <option value="" disabled>
                Choose one
              </option>
              {item.options.choices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          ) : (
            // No choices configured on this question yet — fall back to
            // free text rather than rendering a dropdown with nothing in it.
            <input
              type="text"
              defaultValue={typeof value === "string" ? value : ""}
              onBlur={(e) => commit(e.target.value)}
              className="w-full rounded-md border border-hairline px-3 py-2 outline-none focus:border-ledger"
            />
          ))}

        {item.response_type === "file" && (
          <FileField
            item={item}
            organizerId={organizerId}
            firmId={firmId}
            clientId={clientId}
          />
        )}
      </div>
      {item.response_type !== "file" && statusLine}
    </div>
  );
}

function FileField({
  item,
  organizerId,
  firmId,
  clientId,
}: {
  item: ItemWithResponse;
  organizerId: string;
  firmId: string;
  clientId: string;
}) {
  const [documents, setDocuments] = useState(item.documents);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const path = `${firmId}/${clientId}/${crypto.randomUUID()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("client-documents")
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: docRow, error: insertError } = await supabase
        .from("documents")
        .insert({
          firm_id: firmId,
          client_id: clientId,
          organizer_id: organizerId,
          organizer_item_id: item.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        })
        .select("id, file_name, storage_path, created_at")
        .single();

      if (insertError) throw insertError;

      const { data: signed } = await supabase.storage
        .from("client-documents")
        .createSignedUrl(path, 60 * 60);

      setDocuments((prev) => [...prev, { ...docRow, url: signed?.signedUrl ?? null }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {documents.length > 0 && (
        <ul className="text-sm text-ink-muted">
          {documents.map((d) => (
            <li key={d.id}>
              ✓{" "}
              {d.url ? (
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-ledger hover:underline">
                  {d.file_name}
                </a>
              ) : (
                d.file_name
              )}
            </li>
          ))}
        </ul>
      )}
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
          e.target.value = "";
        }}
        disabled={uploading}
        className="text-sm"
      />
      {uploading && <p className="text-xs text-ink-muted">Uploading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
