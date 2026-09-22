import { type EmailOtpType } from "@supabase/supabase-js";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

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
  const next = safeRedirectPath(rawNext);

  if (!token_hash || !type) {
    // No usable params at all almost always means the Magic Link / Invite
    // email template in Supabase still points at the default
    // {{ .ConfirmationURL }} (Supabase's own verify endpoint) instead of
    // straight at this route. That endpoint verifies the token itself and
    // redirects back here with the session in the URL *fragment*
    // (#access_token=...), which never reaches the server — so this
    // route sees no query params and lands here. See README
    // "Configure email templates".
    console.error(
      "[auth/confirm] Missing token_hash/type on the callback URL " +
        "Check Authentication \u2192 Email Templates " +
        "in Supabase — see README 'Configure email templates'."
    );
    redirect(
      `/auth/error?message=${encodeURIComponent("That link is invalid or has expired.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    // verifyOtp's messages (expired, already used, malformed) are already
    // written to be shown to a user, so pass this one through directly
    // instead of a generic string — it tells you which of those it was.
    console.error("[auth/confirm] verifyOtp failed:", error.message);
    redirect(`/auth/error?message=${encodeURIComponent(error.message)}`);
  }

  if (next) {
    redirect(next as Route);
  }

  // The home route resolves the role and handles incomplete account setup.
  redirect("/");
}
