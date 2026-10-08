import { NextResponse, type NextRequest } from "next/server";

import { agencySignupOpen } from "@/lib/agency-signup";
import { homeFor } from "@/lib/home";
import { resolveAppOrigin } from "@/lib/invites";
import { signInPage, type SignInError } from "@/lib/sign-in-page";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient, type AppProfile } from "@/lib/supabase/server";

/**
 * A login that only Google ever made. Invitations make an email login first,
 * so this is never an invited person, only someone who arrived with Google
 * and has no role: an uninvited account, or an agency sign-up left unfinished.
 */
function isGoogleOnlyLogin(user: { app_metadata?: { providers?: string[] } }) {
  const providers = user.app_metadata?.providers ?? [];
  return providers.length === 1 && providers[0] === "google";
}

/**
 * Where Google sends the browser after "Continue with Google".
 *
 * Signing in with Google proves who someone is, not that they belong here.
 * A role comes from an invitation (the invite creates the login for the
 * invited address, and Google attaches to it because the addresses match) or
 * from creating an agency on /signup. So a Google account that arrives with
 * no profile goes on to name its agency if it started from /signup, and is
 * turned away from every other screen: someone trying a client's sign-in
 * page with the wrong Google account must not be steered into making an
 * agency.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = resolveAppOrigin(request);
  const back = signInPage(params.get("from"));
  const fail = (reason: SignInError) => NextResponse.redirect(`${origin}${back}?error=${reason}`);

  const code = params.get("code");
  // Google or Supabase refused before we got a code. With sign-ups off, an
  // uninvited Google account ends here ("Signups not allowed").
  if (!code) {
    const refused = /signup|not allowed/i.test(params.get("error_description") ?? "");
    return fail(refused ? (back === "/signup" ? "signup_closed" : "not_invited") : "failed");
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const user = data?.user;
  if (error || !user) return fail("failed");

  const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", user.id).maybeSingle();

  if (!profile) {
    // Signed in to create an agency: keep the session for the next step,
    // where they name it. The agency is only made when they do.
    if (back === "/signup") {
      if (agencySignupOpen()) return NextResponse.redirect(`${origin}/signup/agency`);
      await supabase.auth.signOut();
      return fail("signup_closed");
    }

    await supabase.auth.signOut();
    // A Google-only login with no role holds nothing, but it would keep that
    // address taken, so an invitation for it later would fail. Removed here;
    // a login made any other way is left alone.
    if (isGoogleOnlyLogin(user)) await supabaseAdmin.auth.admin.deleteUser(user.id);
    return fail("not_invited");
  }

  const home = await homeFor(profile as AppProfile);
  if (!home) {
    await supabase.auth.signOut();
    return fail("not_set_up");
  }

  return NextResponse.redirect(`${origin}${home}`);
}
