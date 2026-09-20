"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markReviewed(organizerId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "client") {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();

  // The .eq("status", "submitted") makes this an atomic "only if still
  // submitted" transition rather than a read-then-write — if two staff
  // members click this at once, or it's already been reviewed, the second
  // call just affects zero rows instead of double-processing anything.
  const { data, error } = await supabase
    .from("organizers")
    .update({ status: "reviewed" })
    .eq("id", organizerId)
    .eq("status", "submitted")
    .select("id, firm_id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "This organizer isn't awaiting review." };
  }

  await supabase.from("audit_log").insert({
    firm_id: data.firm_id,
    actor_id: profile.id,
    action: "organizer.reviewed",
    target_type: "organizer",
    target_id: organizerId,
  });

  revalidatePath(`/dashboard/organizers/${organizerId}`);
  return {};
}
