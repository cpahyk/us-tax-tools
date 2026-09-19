"use server";

import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function signIn(
  _prevState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !email.includes("@")) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    console.error("[auth/sign-in] signInWithOtp failed:", error.message);

    return {
      status: "error",
      message: error.message,
    };
  }

  return {
    status: "sent",
    message: `Check ${email} for a sign-in link.`,
  };
}