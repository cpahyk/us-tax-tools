import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificationEmailConfigured, sendNotificationEmail } from "@/lib/email";
import { notificationContent } from "@/lib/notification-content";

export async function dispatchNotificationEmails(organizerId?: string) {
  if (!notificationEmailConfigured()) return { configured: false, processed: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_notification_emails", { p_organizer_id: organizerId ?? null });
  if (error) throw new Error("Unable to claim notification emails");
  let processed = 0;
  for (const row of data ?? []) {
    const content = notificationContent(row.kind, row.organizer_id, Boolean(row.target_client_id), process.env.NEXT_PUBLIC_SITE_URL!);
    const sent = await sendNotificationEmail({ to: row.recipient_email, ...content, idempotencyKey: `notification/${row.id}` });
    const { error: finishError } = await admin.rpc("finish_notification_email", { p_id: row.id, p_lease_id: row.lease_id, p_sent: sent });
    if (finishError) throw new Error("Unable to finish notification email");
    processed++;
  }
  return { configured: true, processed };
}

export function scheduleNotificationEmails(organizerId?: string) {
  after(async () => {
    try { await dispatchNotificationEmails(organizerId); }
    catch { console.error("[notifications] Delivery deferred; queued events retained for retry"); }
  });
}
