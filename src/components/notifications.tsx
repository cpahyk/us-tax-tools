"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { getNotifications, markNotificationRead, type NotificationRow } from "@/lib/actions/notifications";
import { notificationLabels } from "@/lib/notification-content";

export function Notifications({ area, emailConfigured }: { area: "dashboard" | "portal"; emailConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const panelId = useId();
  useEffect(() => {
    let stopped = false;
    let busy = false;
    async function refresh() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const result = await getNotifications();
        if (!stopped) {
          if (!result.error) { setRows(result.rows); setUnread(result.unread); }
          setError(result.error); setLoaded(true);
        }
      } catch { if (!stopped) setError("Notifications could not be refreshed."); }
      finally { busy = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("notifications-refresh", refresh);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("notifications-refresh", refresh); };
  }, []);
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} aria-controls={panelId}
        onClick={() => { setOpen(!open); window.dispatchEvent(new Event("notifications-refresh")); }}
        className="rounded-md border border-hairline px-3 py-2 text-ink">
        Notifications{unread > 0 ? ` (${unread})` : ""}
      </button>
      {open && <section id={panelId} aria-label="Notifications" onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
        className="absolute right-0 z-30 mt-2 max-h-96 w-80 max-w-[90vw] overflow-auto rounded-md border border-hairline bg-white p-3 shadow-lg">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold text-ink">Notifications</h2><button onClick={() => setOpen(false)} aria-label="Close notifications">Close</button></div>
        {!emailConfigured && <p className="mb-2 text-xs text-ink-muted">Email alerts are currently unavailable. Check this inbox for updates.</p>}
        {error && <p role="status" className="text-sm text-red-600">{error}</p>}
        {!loaded && !error && <p>Loading…</p>}
        {loaded && rows.length === 0 && !error && <p>No notifications yet.</p>}
        <ul className="flex flex-col gap-2">{rows.map(row => (
          <li key={row.id} className={`rounded p-2 ${row.read_at ? "bg-white" : "bg-stone-100"}`}>
            <Link href={`/${area}/organizers/${row.organizer_id}`} onClick={() => {
              setOpen(false);
              void markNotificationRead(row.id).then(result => {
                if (!result.error) window.dispatchEvent(new Event("notifications-refresh"));
              }).catch(() => {});
            }} className="text-ledger hover:underline">
              {!row.read_at && <span className="mr-1" aria-label="Unread">●</span>}{notificationLabels[row.kind] ?? "Organizer update"}
            </Link>
            <p className="mt-1 text-xs text-ink-muted">{new Date(row.created_at).toLocaleString()}</p>
          </li>
        ))}</ul>
        {rows.length === 30 && <p className="mt-2 text-xs">Showing up to 30 notifications, unread first.</p>}
      </section>}
    </div>
  );
}
