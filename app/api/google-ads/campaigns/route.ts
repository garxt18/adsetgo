import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { getCurrentProfile } from "../../../../lib/supabase-server";

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const clientId = request.nextUrl.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const { data: client, error } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();

  if (error || !client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  if (profile.role === "client" && profile.client_id !== client.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (profile.role === "agency_admin" && profile.agency_id !== client.agency_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({
    campaigns: [],
    status: "connected",
    message: "Campaign data is ready for a connected Google Ads account.",
  });
}
