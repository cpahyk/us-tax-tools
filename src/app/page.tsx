import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

// Now that auth exists, "/" is just a router: send people to the area for
// their role, or to sign in if they're not authenticated. There's no
// marketing/landing content yet — that's a separate, later concern from
// the app itself.
export default async function Home() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  redirect(profile.role === "client" ? "/portal" : "/dashboard");
}
