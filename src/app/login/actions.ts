"use server";

import { createClient } from "@/lib/supabase/server";
import { authEmailFailure } from "@/lib/auth-email-errors";
import { z } from "zod";

export type SignInState = {
  status: "idle" | "sent" | "error";
  message?: string;
  cooldownSeconds?: number;
};

export async function signIn(
  _prevState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!z.email().safeParse(email).success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    const failure = authEmailFailure(error, "client");
    return { status: "error", message: failure.error, cooldownSeconds: failure.cooldownSeconds };
  }

  return { status: "sent", message: `Check ${email} for a sign-in link.` };
}
