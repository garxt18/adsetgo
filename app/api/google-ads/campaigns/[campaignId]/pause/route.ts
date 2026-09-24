import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth, requireAgencyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  // Pausing a campaign changes what a client spends, so it is limited to agency
  // staff rather than every signed-in user.
  const { profile, response: authError } = await requireApiAuth([
    "master_admin",
    "agency_admin",
  ]);
  if (authError) return authError;

  const campaignId = request.nextUrl.pathname.split("/").at(-2) ?? "";
  const clientId = request.nextUrl.searchParams.get("clientId");

  // A campaign id alone says nothing about which tenant owns it, so the caller
  // must name the client and prove they may act on it.
  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("id, agency_id")
    .eq("id", clientId)
    .maybeSingle();

  if (clientError || !client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  const denied = requireAgencyAccess(profile, client.agency_id);
  if (denied) return denied;

  // No Google Ads mutate call exists yet. Reporting success here told the UI a
  // campaign had been paused while it kept spending, so fail honestly instead.
  return NextResponse.json(
    {
      success: false,
      campaignId,
      action: "pause",
      error: "Campaign pause is not implemented yet.",
    },
    { status: 501 }
  );
}
