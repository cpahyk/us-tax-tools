"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type TemplateItemInput = {
  prompt: string;
  help_text: string;
  response_type: "text" | "number" | "boolean" | "select" | "file";
  is_required: boolean;
};

type Result = { error?: string };

export async function createTemplate(input: {
  name: string;
  taxYear: number;
  items: TemplateItemInput[];
}): Promise<Result> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === "client") {
    return { error: "Not authorized." };
  }

  const name = input.name.trim();
  const items = input.items
    .map((item) => ({ ...item, prompt: item.prompt.trim() }))
    .filter((item) => item.prompt.length > 0);

  if (!name) {
    return { error: "Give the template a name." };
  }
  if (items.length === 0) {
    return { error: "Add at least one question." };
  }

  const supabase = await createClient();
  const { data: template, error } = await supabase
    .from("organizer_templates")
    .insert({
      firm_id: profile.firm_id,
      name,
      tax_year: input.taxYear,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !template) {
    return { error: error?.message ?? "Couldn't create the template." };
  }

  const rows = items.map((item, index) => ({
    template_id: template.id,
    sort_order: index,
    prompt: item.prompt,
    help_text: item.help_text.trim() || null,
    response_type: item.response_type,
    is_required: item.is_required,
  }));

  const { error: itemsError } = await supabase.from("organizer_template_items").insert(rows);

  if (itemsError) {
    return { error: itemsError.message };
  }

  redirect("/dashboard/templates");
}
