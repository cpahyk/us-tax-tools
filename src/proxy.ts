import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request so it doesn't expire
 * mid-visit. This does NOT gate access to pages — that's intentional: real
 * access control lives in RLS (data) and in each page/action checking
 * supabase.auth.getUser() (routing). Treat this purely as session upkeep.
 *
 * Named `proxy` (not `middleware`) per the Next.js 16 file convention —
 * see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */
export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Runs on every route, including ones that don't need auth yet — so a
  // missing .env.local should degrade to "no session refresh" rather than
  // taking down every page in the app with an opaque SDK crash.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[proxy] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — " +
        "skipping session refresh. Copy .env.example to .env.local and fill these in."
    );
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
