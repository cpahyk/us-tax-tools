"use server";

import { revalidatePath } from "next/cache";
import { scheduleNotificationEmails } from "@/lib/notifications";
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

  scheduleNotificationEmails();
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
  scheduleNotificationEmails(organizerId);
  return { success: true };
}
