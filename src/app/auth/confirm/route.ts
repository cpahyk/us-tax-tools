import type { Route } from "next";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  // Only allow internal redirects.
  const next = nextParam?.startsWith("/") ? nextParam : null;

  const supabase = await createClient();

  /*
   * PKCE flow:
   *
   * Supabase redirects the user back to this route with:
   *
   * /auth/confirm?code=...
   *
   * Exchange that one-time code for a session.
   */
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error(
        "[auth/confirm] exchangeCodeForSession failed:",
        error.message
      );

      redirect(
        `/auth/error?message=${encodeURIComponent(
          "That link is invalid or has expired."
        )}`
      );
    }

    if (next) {
      redirect(next as Route);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "client") {
        redirect("/portal");
      }
    }

    redirect("/dashboard");
  }

  /*
   * If Supabase somehow sends us here without a code,
   * don't expose an invalid callback.
   */
  console.error(
    "[auth/confirm] Missing authorization code:",
    request.url
  );

  redirect(
    `/auth/error?message=${encodeURIComponent(
      "That link is invalid or has expired."
    )}`
  );
}