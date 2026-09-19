"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";

export type CreateClientState = {
  status: "idle" | "error";
  message?: string;
};

export async function createClientRecord(
  _prevState: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "client") {
    return { status: "error", message: "Not authorized." };
  }

  const primary_contact_name = String(formData.get("primary_contact_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const client_type = String(formData.get("client_type") ?? "individual");

  if (!primary_contact_name || !email || !email.includes("@")) {
    return { status: "error", message: "Enter a name and a valid email." };
  }

  const supabase = await createSupabaseClient();
  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      firm_id: profile.firm_id,
      primary_contact_name,
      email,
      client_type,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) {
    // Most likely the unique (firm_id, email) constraint — a friendlier
    // message than the raw Postgres error for that specific, expected case.
    if (error.code === "23505") {
      return { status: "error", message: "A client with that email already exists." };
    }
    return { status: "error", message: error.message };
  }

  redirect(`/dashboard/clients/${client.id}`);
}
