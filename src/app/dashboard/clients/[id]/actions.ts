"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authEmailFailure } from "@/lib/auth-email-errors";

type ActionResult = { error?: string; success?: boolean; message?: string; cooldownSeconds?: number };

export async function inviteClient(clientId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "client") {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, email, primary_contact_name, firm_id")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return { error: "Client not found." };
  }

  // The query above is already RLS-scoped to this staff member's firm, but
  // the admin client below bypasses RLS entirely — re-check explicitly
  // rather than relying on that scoping surviving unchanged.
  if (client.firm_id !== profile.firm_id) {
    return { error: "Not authorized." };
  }

  const admin = createAdminClient();
  const { data: invitationMode, error: preparationError } = await supabase.rpc("prepare_client_invitation", {
    p_client_id: clientId,
  });
  if (preparationError) return { error: preparationError.message };

  if (invitationMode === "signin") {
    const { error } = await supabase.auth.signInWithOtp({
      email: client.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
      },
    });
    revalidatePath(`/dashboard/clients/${clientId}`);
    if (error) return authEmailFailure(error, "staff");
    return { success: true, message: "Sign-in link sent to the existing account.", cooldownSeconds: 60 };
  }
  if (invitationMode !== "invite") return { error: "Unable to prepare this invitation. Please try again." };

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(client.email, {
    data: {
      firm_id: client.firm_id,
      role: "client",
      full_name: client.primary_contact_name,
    },
  });

  if (inviteError) {
    return authEmailFailure(inviteError, "staff");
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  return { success: true, cooldownSeconds: 60 };
}

export async function sendOrganizerToClient(input: {
  clientId: string;
  templateId: string;
  taxYear: number;
  title: string;
}): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "client") {
    return { error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_organizer", {
    p_client_id: input.clientId,
    p_template_id: input.templateId,
    p_tax_year: input.taxYear,
    p_title: input.title,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/clients/${input.clientId}`);
  return { success: true };
}
