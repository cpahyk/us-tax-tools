"use server";

import { revalidatePath } from "next/cache";
import { sendNotificationEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string; success?: boolean };

export async function saveResponse(
  organizerItemId: string,
  value: unknown
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_organizer_response", {
    p_organizer_item_id: organizerItemId,
    p_value: value,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function submitOrganizerAction(organizerId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_organizer", {
    p_organizer_id: organizerId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/portal/organizers/${organizerId}`);
  await notifyStaffOfSubmission(organizerId);
  return { success: true };
}

async function notifyStaffOfSubmission(organizerId: string) {
  const supabase = await createClient();
  const { data: organizer } = await supabase
    .from("organizers")
    .select("title, tax_year, created_by, client_id")
    .eq("id", organizerId)
    .single();

  if (!organizer) return;

  const [{ data: staffProfile }, { data: client }] = await Promise.all([
    supabase.from("profiles").select("email").eq("id", organizer.created_by).single(),
    supabase.from("clients").select("primary_contact_name").eq("id", organizer.client_id).single(),
  ]);

  if (!staffProfile) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await sendNotificationEmail({
    to: staffProfile.email,
    subject: `${client?.primary_contact_name ?? "A client"} submitted their ${organizer.tax_year} organizer`,
    text:
      `${client?.primary_contact_name ?? "A client"} just submitted "${organizer.title}".\n\n` +
      `Review it: ${siteUrl}/dashboard/organizers/${organizerId}`,
  });
}
