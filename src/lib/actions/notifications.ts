"use server";
import { scheduleNotificationEmails } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

export type NotificationRow = { id: string; organizer_id: string; kind: string; created_at: string; read_at: string | null };

export async function getNotifications(): Promise<{ rows: NotificationRow[]; unread: number; error?: string }> {
  const supabase = await createClient();
  const [list, count] = await Promise.all([
    supabase.from("notifications").select("id,organizer_id,kind,created_at,read_at").order("read_at", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false }).limit(30),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (list.error || count.error) return { rows: [], unread: 0, error: "Notifications could not be loaded." };
  scheduleNotificationEmails();
  return { rows: list.data ?? [], unread: count.count ?? 0 };
}

export async function markNotificationRead(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
  return { error: error ? "Unable to mark notification read." : undefined };
}
