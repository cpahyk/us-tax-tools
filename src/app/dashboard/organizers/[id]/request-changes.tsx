"use client";
import { useState, useTransition } from "react";
import { requestChanges } from "./actions";

export function RequestChanges({ organizerId }: { organizerId: string }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return <details className="mt-3 rounded-md border border-hairline bg-white p-3">
    <summary className="cursor-pointer text-sm font-medium">Request corrections from client</summary>
    <form className="mt-3 flex flex-col gap-2" onSubmit={event => {
      event.preventDefault(); setError(undefined);
      startTransition(async () => {
        try {
          const result = await requestChanges(organizerId, reason);
          if (result.error) setError(result.error);
        } catch { setError("Unable to request changes. Please refresh and try again."); }
      });
    }}>
      <label htmlFor="change-reason" className="text-sm">Explain what needs to be corrected</label>
      <textarea id="change-reason" value={reason} onChange={e=>setReason(e.target.value)} required maxLength={5000} rows={3} disabled={pending} className="rounded border border-hairline p-2" />
      <p className="text-xs text-ink-muted">This reopens the organizer for editing and notifies the client.</p>
      <button disabled={pending || !reason.trim()} className="w-fit rounded bg-ledger px-3 py-2 text-sm text-white disabled:opacity-60">{pending ? "Sending…" : "Request changes"}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  </details>;
}
