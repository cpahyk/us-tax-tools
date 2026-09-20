"use server";

import { getCurrentProfile } from "@/lib/auth";
import { sendNotificationEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

export type PostedMessage = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name: string;
  author_role: string;
};

export async function postOrganizerMessage(
  organizerId: string,
  body: string
): Promise<{ error?: string; message?: PostedMessage }> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { error: "Not authorized." };
  }

  const trimmed = body.trim();
  if (!trimmed) {
    return { error: "Message can't be empty." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizer_messages")
    .insert({ organizer_id: organizerId, author_id: profile.id, body: trimmed })
    .select("id, author_id, body, created_at")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Couldn't send the message." };
  }

  await notifyOtherParty(organizerId, profile, trimmed);

  return {
    message: {
      ...data,
      author_name: profile.full_name,
      author_role: profile.role,
    },
  };
}

async function notifyOtherParty(
  organizerId: string,
  author: { id: string; role: string; full_name: string },
  body: string
) {
  const supabase = await createClient();
  const { data: organizer } = await supabase
    .from("organizers")
    .select("title, created_by, client_id")
    .eq("id", organizerId)
    .single();

  if (!organizer) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const preview = body.length > 200 ? `${body.slice(0, 200)}…` : body;

  if (author.role === "client") {
    // Client posted — notify the assigned staff member.
    const { data: staffProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", organizer.created_by)
      .single();

    if (staffProfile) {
      await sendNotificationEmail({
        to: staffProfile.email,
        subject: `New message on "${organizer.title}"`,
        text: `${author.full_name} wrote:\n\n${preview}\n\n${siteUrl}/dashboard/organizers/${organizerId}`,
      });
    }
  } else {
    // Staff posted — notify the client.
    const { data: client } = await supabase
      .from("clients")
      .select("email")
      .eq("id", organizer.client_id)
      .single();

    if (client) {
      await sendNotificationEmail({
        to: client.email,
        subject: `New message about your ${organizer.title}`,
        text: `${author.full_name} wrote:\n\n${preview}\n\n${siteUrl}/portal/organizers/${organizerId}`,
      });
    }
  }
}
