import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Admin client using SUPABASE_SECRET_KEY — bypasses RLS entirely.
 *
 * Only use this for actions that genuinely need elevated privileges (e.g.
 * auth.admin.inviteUserByEmail, which the publishable-key client can't
 * call at all). Every call site using this MUST independently verify the
 * caller is authorized for the specific rows it's about to touch — RLS
 * isn't there to catch mistakes for you here the way it is everywhere
 * else in this app.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set to use " +
        "admin actions like sending invites."
    );
  }

  return createSupabaseClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
