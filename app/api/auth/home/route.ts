import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Where the signed-in person belongs.
 *
 * Answered here rather than in the browser because row level security stops a
 * client from reading the `agencies` table, so a page working it out itself
 * could not find a client's agency and sent them back to sign in. The server
 * reads with the service role, and still answers only for the caller's own
 * profile.
 */
export async function GET() {
  const { profile, response: authError } = await requireApiAuth();
  if (authError) return authError;

  if (profile.role === "master_admin") {
    return NextResponse.json({ path: "/dashboard" });
  }

  if (!profile.agency_id) {
    return NextResponse.json({ path: null }, { status: 404 });
  }

  const { data: agency } = await supabaseAdmin
    .from("agencies")
    .select("slug")
    .eq("id", profile.agency_id)
    .maybeSingle();

  if (!agency) {
    return NextResponse.json({ path: null }, { status: 404 });
  }

  if (profile.role === "client" && profile.client_id) {
    // Arriving here signed in means the client has accepted their invitation,
    // so their record stops saying "invited". Nothing else marks it: the only
    // code that did was the public sign-up route removed for letting anyone
    // register as any agency's client, and since then every client stayed
    // "invited" for good. Only the caller's own record, and only once.
    await supabaseAdmin
      .from("clients")
      .update({ status: "active" })
      .eq("id", profile.client_id)
      .eq("agency_id", profile.agency_id)
      .eq("status", "invited");
  }

  return NextResponse.json({
    path:
      profile.role === "client"
        ? `/agencies/${agency.slug}/client-dashboard`
        : `/agencies/${agency.slug}/dashboard`,
  });
}
