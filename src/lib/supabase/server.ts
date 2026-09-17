import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 * Reads the caller's session from cookies, so RLS policies see the real
 * signed-in user (not a service role) — this is what keeps a client from
 * ever being able to read another client's data, even through a bug in
 * application code.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — src/proxy.ts handles session
            // refresh instead, so this can be safely ignored here.
          }
        },
      },
    }
  );
}
