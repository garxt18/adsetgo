import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth, requireAgencyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  // Resuming a campaign restarts spend, so it is limited to agency staff.
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

  // No Google Ads mutate call exists yet; fail honestly rather than report a
  // resume that never reached Google.
  return NextResponse.json(
    {
      success: false,
      campaignId,
      action: "resume",
      error: "Campaign resume is not implemented yet.",
    },
    { status: 501 }
  );
}
