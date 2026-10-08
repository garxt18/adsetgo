import { NextResponse } from "next/server";

import { agencySignupOpen, checkAgencySignup } from "@/lib/agency-signup";
import { recordAudit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";

/**
 * An agency creating its own workspace, straight after signing in with Google.
 *
 * Who owns the new agency is taken from the session, never from the request,
 * so nobody can create an agency in someone else's name. A login that already
 * has a role gets nothing here: one agency per Google account, and a client or
 * an existing agency owner cannot turn themselves into another agency's owner.
 */
export async function POST(request: Request) {
  if (!agencySignupOpen()) {
    return NextResponse.json({ error: "New agency sign-ups are closed at the moment." }, { status: 403 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  // A password or reset-link session cannot become an agency owner: only Google.
  if (!user.viaGoogle) {
    return NextResponse.json({ error: "Sign in with Google to create an agency." }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "This Google account already belongs to a workspace." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const checked = checkAgencySignup({ name: body?.name, slug: body?.slug });
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }

  const { data: agency, error: agencyError } = await supabaseAdmin
    .from("agencies")
    .insert({ name: checked.name, slug: checked.slug, google_ads_connection_status: "disconnected" })
    .select("id, slug")
    .single();

  if (agencyError || !agency) {
    const taken = agencyError?.code === "23505";
    if (!taken) console.error("Agency sign-up failed:", agencyError);
    return NextResponse.json(
      { error: taken ? "That web address is taken. Choose another." : "Your agency could not be created." },
      { status: taken ? 409 : 500 }
    );
  }

  // The profile's primary key is the login's id, so two sign-ups racing for
  // the same login cannot both succeed: the loser's agency is removed.
  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: user.id,
    email: user.email,
    role: "agency_admin",
    agency_id: agency.id,
    client_id: null,
  });

  if (profileError) {
    await supabaseAdmin.from("agencies").delete().eq("id", agency.id);
    const duplicate = profileError.code === "23505";
    if (!duplicate) console.error("Agency sign-up profile failed:", profileError);
    return NextResponse.json(
      { error: duplicate ? "This Google account already belongs to a workspace." : "Your agency could not be created." },
      { status: duplicate ? 409 : 500 }
    );
  }

  await recordAudit({
    agencyId: agency.id,
    actorId: user.id,
    action: "agency_self_signup",
    resourceType: "agency",
    resourceId: agency.id,
  });

  return NextResponse.json({ path: `/agencies/${agency.slug}/dashboard` }, { status: 201 });
}
