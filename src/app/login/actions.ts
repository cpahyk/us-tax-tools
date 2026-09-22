"use server";

import { createClient } from "@/lib/supabase/server";
import { authEmailFailure } from "@/lib/auth-email-errors";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type SignInState = {
  status: "idle" | "sent" | "error";
  message?: string;
  cooldownSeconds?: number;
};

export async function signIn(
  _prevState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!z.email().safeParse(email).success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  // An unauthenticated caller may only reserve a cooldown for this email.
  // The privileged RPC cannot read accounts or grant access. Fail closed.
  try {
    const { data: reserved, error } = await createAdminClient().rpc("reserve_otp_request", {
      p_email_hash: createHash("sha256").update(email).digest("hex"),
    });
    if (error) throw new Error("Cooldown unavailable");
    if (!reserved) return { status: "error", message: "Please wait before requesting another sign-in link.", cooldownSeconds: 60 };
  } catch {
    return { status: "error", message: "Sign-in emails are temporarily unavailable. Please try later.", cooldownSeconds: 60 };
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
