"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getOrganizerMessages, markOrganizerMessagesRead, postOrganizerMessage, type PostedMessage } from "@/lib/actions/messages";

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
  const [refreshError, setRefreshError] = useState<string>();
  const request = useRef<{ body: string; id: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    async function refresh() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const result = await getOrganizerMessages(organizerId);
        if (!cancelled) {
          setRefreshError(result.error);
          if (result.messages) setMessages(previous => {
            const merged = new Map(previous.map(m => [m.id, m]));
            result.messages!.forEach(m => merged.set(m.id, m));
            return [...merged.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
          });
        }
      } catch { if (!cancelled) setRefreshError("Messages could not be refreshed. Your draft is saved here."); }
      finally { busy = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [organizerId]);

  const latestTime = messages.at(-1)?.created_at;
  useEffect(() => {
    if (!bottom.current || !latestTime) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && document.visibilityState === "visible") {
        void markOrganizerMessagesRead(organizerId, latestTime).then(result => {
          if (!result.error) window.dispatchEvent(new Event("notifications-refresh"));
        }).catch(() => {});
      }
    });
    observer.observe(bottom.current);
    return () => observer.disconnect();
  }, [organizerId, latestTime]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = draft;
    if (!request.current || request.current.body !== body) request.current = { body, id: crypto.randomUUID() };
    const requestId = request.current.id;
    startTransition(async () => {
      let result;
      try { result = await postOrganizerMessage(organizerId, body, requestId); }
      catch { setError("Connection interrupted. Retry to confirm the message; your draft is preserved."); return; }
      if (result.error || !result.message) {
        setError(result.error ?? "Couldn't send the message.");
        return;
      }
      setMessages((prev) => prev.some(m => m.id === result.message!.id) ? prev : [...prev, result.message as PostedMessage]);
      setDraft("");
      request.current = null;
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
                  {new Date(m.created_at).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={bottom} className="h-px" />
      <p className="text-xs text-ink-muted">Messages refresh automatically while this page is open.</p>
      {refreshError && <p role="status" className="text-sm text-red-600">{refreshError}</p>}
      <form onSubmit={handleSend} className="flex items-end gap-2">
        <textarea
          aria-label="Message"
          rows={3}
          maxLength={5000}
          disabled={pending}
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
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
