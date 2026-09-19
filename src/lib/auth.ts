import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  firm_id: string;
  role: "firm_admin" | "firm_staff" | "client";
  full_name: string;
  email: string;
};

/**
 * The signed-in user's profile row, or null if signed out.
 *
 * Uses getClaims() to verify identity — it checks the JWT locally against
 * the project's cached JWKS instead of getUser()'s network round-trip to
 * the Auth server (see src/proxy.ts for the same choice). Either way, the
 * actual row this returns is still gated by the profiles_select_same_firm
 * RLS policy, not by anything in this function.
 *
 * Wrapped in cache() so a layout and the pages under it can each call this
 * for their own auth check without turning into N DB round-trips per
 * request — React memoizes it per-request automatically.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, firm_id, role, full_name, email")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return null;
  }

  return profile as Profile;
});
