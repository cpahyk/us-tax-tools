import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components. Reads/writes the session via
 * cookies so it stays in sync with the server client below. Every query made
 * with this client is subject to the Row Level Security policies in
 * supabase/migrations/0001_init.sql — there is no separate app-level
 * authorization layer to keep in sync.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
