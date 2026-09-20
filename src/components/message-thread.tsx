"use client";

import { useState, useTransition } from "react";
import { postOrganizerMessage, type PostedMessage } from "@/lib/actions/messages";

export function MessageThread({
  organizerId,
  initialMessages,
  currentProfileId,
}: {
  organizerId: string;
  initialMessages: PostedMessage[];
  currentProfileId: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = draft;
    startTransition(async () => {
      const result = await postOrganizerMessage(organizerId, body);
      if (result.error || !result.message) {
        setError(result.error ?? "Couldn't send the message.");
        return;
      }
      setMessages((prev) => [...prev, result.message as PostedMessage]);
      setDraft("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <p className="text-sm text-ink-muted">No messages yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((m) => {
            const isMe = m.author_id === currentProfileId;
            return (
              <li
                key={m.id}
                className={`max-w-[85%] rounded-md border border-hairline px-3 py-2 text-sm ${
                  isMe ? "self-end bg-ledger text-white" : "self-start bg-white text-ink"
                }`}
              >
                <p className={isMe ? "text-white/80" : "text-ink-muted"}>
                  {isMe ? "You" : m.author_name} ·{" "}
                  {new Date(m.created_at).toLocaleDateString()}
                </p>
                <p>{m.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          className="flex-1 rounded-md border border-hairline px-3 py-2 text-sm outline-none focus:border-ledger"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-md bg-ledger px-3 py-2 text-sm font-medium text-white hover:bg-ledger-dark disabled:opacity-60"
        >
          Send
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
