"use client";

import { useState, useTransition } from "react";
import { inviteClient, sendOrganizerToClient } from "./actions";
import { useEmailCooldown } from "@/lib/use-email-cooldown";

type Template = { id: string; name: string; tax_year: number };

export function InviteButton({ clientId, status }: { clientId: string; status: string }) {
  const { seconds, startCooldown } = useEmailCooldown();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (status === "archived") {
    return <span className="text-sm text-ink-muted">Restore this client before sending a portal link.</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() =>
          startTransition(async () => {
            const result = await inviteClient(clientId);
            startCooldown(result.cooldownSeconds ?? 0);
            setMessage(result.error ?? result.message ?? "Invite sent.");
          })
        }
        disabled={pending || seconds > 0}
        className="w-fit rounded-md bg-ledger px-3 py-2 text-sm font-medium text-white hover:bg-ledger-dark disabled:opacity-60"
      >
        {pending ? "Sending…" : seconds > 0 ? `Retry in ${seconds}s` : status === "active" ? "Send sign-in link" : "Send portal invite"}
      </button>
      {message && <p role="status" className="text-sm text-ink-muted">{message}</p>}
    </div>
  );
}

export function SendOrganizerForm({
  clientId,
  templates,
}: {
  clientId: string;
  templates: Template[];
}) {
  const currentYear = new Date().getFullYear();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [taxYear, setTaxYear] = useState(currentYear);
  const [title, setTitle] = useState(`${currentYear} Tax Organizer`);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (templates.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No organizer templates yet — create one under Templates first.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await sendOrganizerToClient({ clientId, templateId, taxYear, title });
          setMessage(result.error ?? "Organizer sent.");
        });
      }}
      className="flex flex-col gap-3 rounded-md border border-hairline bg-white p-4"
    >
      <label className="flex flex-col gap-1 text-sm text-ink">
        Template
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="rounded-md border border-hairline px-3 py-2"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.tax_year})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Tax year
        <input
          type="number"
          value={taxYear}
          onChange={(e) => setTaxYear(Number(e.target.value))}
          className="rounded-md border border-hairline px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-hairline px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-ledger px-3 py-2 text-sm font-medium text-white hover:bg-ledger-dark disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send organizer"}
      </button>
      {message && <p className="text-sm text-ink-muted">{message}</p>}
    </form>
  );
}
