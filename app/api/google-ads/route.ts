import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth, requireClientAccess } from "@/lib/api-auth";
import { fetchReportRows, forgetGoogleAdsAccessToken } from "@/lib/google-ads/auth";
import { resolveRange } from "@/lib/google-ads/date-range";
import { normalizeGoogleAdsCustomerId } from "@/lib/google-ads/format";
import { buildReport } from "@/lib/google-ads/report";
import { isSampleDataEnabled } from "@/lib/google-ads/sample-data";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** One client's report for a period, compared with the period before it. */
export async function GET(request: NextRequest) {
  // Authentication comes from the session cookie only. A `?userId=` fallback
  // previously accepted any profile id from the query string, which let a caller
  // impersonate any user by guessing a UUID.
  const { profile, response: authError } = await requireApiAuth();
  if (authError) return authError;

  // A client only ever gets their own report, whatever id they send.
  const clientId =
    profile.role === "client" ? profile.client_id : request.nextUrl.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  // Only the columns the report needs: the agency row also holds the Google
  // refresh token, which has no reason to be loaded here.
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, agency_id, google_ads_customer_id, agencies:agency_id(google_ads_manager_customer_id)")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  // Denies unless a rule allows. The inline checks this replaced only refused
  // the cases they named, so any other role would have been let through.
  const denied = requireClientAccess(profile, client);
  if (denied) return denied;

  const customerId = normalizeGoogleAdsCustomerId(client.google_ads_customer_id);

  if (!customerId) {
    return NextResponse.json({
      status: "not_configured",
      message: "Google Ads Customer ID is missing for this client.",
    });
  }

  // A to-one join arrives as one object; without generated database types the
  // client library cannot know that and types it as a list.
  const agency = client.agencies as unknown as { google_ads_manager_customer_id: string | null } | null;
  const range = resolveRange(request.nextUrl.searchParams.get("dateRange") ?? "last_7_days");

  try {
    const [rows, previousRows] = await fetchReportRows({
      agencyId: client.agency_id,
      customerId,
      managerCustomerId: normalizeGoogleAdsCustomerId(agency?.google_ads_manager_customer_id),
      range,
    });

    return NextResponse.json(
      buildReport({ range, rows, previousRows, isSample: isSampleDataEnabled() })
    );
  } catch (error: unknown) {
    console.error("Google Ads metrics fetch failed:", error);
    forgetGoogleAdsAccessToken(client.agency_id);

    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Google Ads account unavailable.",
    });
  }
}
