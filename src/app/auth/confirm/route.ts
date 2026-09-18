import { type EmailOtpType } from "@supabase/supabase-js";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles every email-link auth flow (magic link sign-in, invite
 * acceptance, signup confirmation, password recovery) — they all arrive
 * here as a token_hash + type pair, per Supabase's server-side auth
 * pattern for Next.js. This is *not* the OAuth/PKCE `code` flow; those are
 * separate.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next");
  // Only ever follow a same-site relative path — never redirect to a
  // caller-supplied absolute URL (open-redirect guard).
  const next = rawNext?.startsWith("/") ? rawNext : null;

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      if (next) {
        redirect(next as Route);
      }

      // No specific destination requested — send them to their own area.
      const { data } = await supabase.auth.getClaims();
      const userId = data?.claims?.sub;

      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();

        if (profile?.role === "client") {
          redirect("/portal");
        }
      }

      redirect("/dashboard");
    }
  }

  redirect(
    `/auth/error?message=${encodeURIComponent("That link is invalid or has expired.")}`
  );
}
