import Link from "next/link";
import { redirect } from "next/navigation";

import { AgencySignupForm } from "@/components/agency-signup-form";
import { AuthShell } from "@/components/ui/auth-shell";
import { agencySignupOpen } from "@/lib/agency-signup";
import { homeFor } from "@/lib/home";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser, type AppProfile } from "@/lib/supabase/server";

export const metadata = { title: "Name your agency — AdSetGo" };

/**
 * The second step of agency sign-up, reached from /auth/callback once Google
 * has confirmed who this is. Someone who already has a workspace is taken
 * to it; the agency itself is created only when the form is sent.
 */
export default async function AgencySignupPage() {
  if (!agencySignupOpen()) redirect("/signup");

  const user = await getSessionUser();
  if (!user) redirect("/signup");

  const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (profile) {
    const home = await homeFor(profile as AppProfile);
    if (home) redirect(home);
  }

  if (!user.viaGoogle) {
    return (
      <AuthShell eyebrow="Create an agency" title="Sign in with Google first">
        <p className="text-sm text-ink-soft">A new agency is created from a Google sign-in.</p>
        <Link href="/signup" className="mt-4 inline-block text-sm text-brand underline-offset-4 hover:underline">
          Continue with Google
        </Link>
      </AuthShell>
    );
  }

  return <AgencySignupForm email={user.email} />;
}
