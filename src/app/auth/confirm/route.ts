import type { Route } from "next";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const next = rawNext?.startsWith("/") ? rawNext : null;

  if (!code) {
    console.error(
      "[auth/confirm] Missing code:",
      request.url
    );

    redirect(
      `/auth/error?message=${encodeURIComponent(
        "That link is invalid or has expired."
      )}`
    );
  }

  const supabase = await createClient();

  const { error } =
    await supabase.auth.exchangeCodeForSession(code);

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

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "client") {
    redirect("/portal");
  }

  redirect("/dashboard");
}