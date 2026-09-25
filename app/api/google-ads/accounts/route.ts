import { NextRequest, NextResponse } from "next/server";

import {
  fetchAllGoogleAdsAccounts,
  forgetGoogleAdsAccessToken,
  getGoogleAdsAccessToken,
  type FullGoogleAdsAccount,
} from "@/lib/google-ads/auth";
import { reportCacheKey, withReportCache } from "@/lib/google-ads/report-cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireApiAuth, requireAgencyAccess } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  // This route exposes an agency's Google Ads account tree, so it is restricted
  // to agency staff rather than every signed-in user.
  const { profile, response: authError } = await requireApiAuth([
    "master_admin",
    "agency_admin",
  ]);
  if (authError) return authError;

  const agencyId = request.nextUrl.searchParams.get("agencyId");
  const agencySlug = request.nextUrl.searchParams.get("agencySlug");

  // Look up the agency by ID or slug, else fall back to the caller's own agency.
  // There is deliberately no "first agency in the table" fallback: it returned
  // an arbitrary tenant's accounts to anyone who omitted both parameters.
  let agencyQuery = supabaseAdmin.from("agencies").select("*");

  if (agencyId) {
    agencyQuery = agencyQuery.eq("id", agencyId);
  } else if (agencySlug) {
    agencyQuery = agencyQuery.eq("slug", agencySlug);
  } else if (profile.agency_id) {
    agencyQuery = agencyQuery.eq("id", profile.agency_id);
  } else {
    return NextResponse.json(
      { error: "agencyId or agencySlug is required." },
      { status: 400 }
    );
  }

  const { data: agency, error: agencyError } = await agencyQuery.maybeSingle();

  if (agencyError) {
    return NextResponse.json({ error: agencyError.message }, { status: 500 });
  }

  if (!agency) {
    return NextResponse.json({ error: "Agency not found." }, { status: 404 });
  }

  const denied = requireAgencyAccess(profile, agency.id);
  if (denied) return denied;

  try {
    const accessToken = await getGoogleAdsAccessToken(agency.id);

    // fetchAllGoogleAdsAccounts already asks Google which customers the token
    // can see; asking again here spent a second operation on every load for a
    // list no page used. The result is cached because the account tree changes
    // rarely and every look at the Google Ads view would otherwise re-query it.
    let accounts: FullGoogleAdsAccount[] = [];
    let accountsError: string | null = null;
    try {
      accounts = await withReportCache(
        reportCacheKey(["account-tree", agency.id, agency.google_ads_manager_customer_id]),
        () =>
          fetchAllGoogleAdsAccounts({
            accessToken,
            managerCustomerId: agency?.google_ads_manager_customer_id,
          })
      );
    } catch (err) {
      accountsError = err instanceof Error ? err.message : String(err);
      forgetGoogleAdsAccessToken(agency.id);
    }

    const summary = {
      total: accounts.length,
      active: accounts.filter((a) => a.status === "ENABLED").length,
      canceled: accounts.filter((a) => a.status === "CANCELED").length,
      hidden: accounts.filter((a) => a.hidden).length,
      managers: accounts.filter((a) => a.manager).length,
    };

    return NextResponse.json({
      connected: true,
      status: "connected",
      message: "Fetched all Google Ads accounts successfully.",
      agency: agency
        ? {
            id: agency.id,
            name: agency.name,
            slug: agency.slug,
            google_ads_connection_status: agency.google_ads_connection_status,
            google_ads_manager_customer_id:
              agency.google_ads_manager_customer_id,
            hasRefreshToken: Boolean(agency.google_ads_refresh_token),
          }
        : null,
      summary,
      accounts,
      accountsError,
    });
  } catch (error) {
    console.error("Google Ads account fetch failed:", error);
    forgetGoogleAdsAccessToken(agency.id);

    return NextResponse.json({
      connected: false,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to fetch Google Ads accounts.",
      agency: agency
        ? {
            id: agency.id,
            name: agency.name,
            slug: agency.slug,
            google_ads_connection_status: agency.google_ads_connection_status,
            hasRefreshToken: Boolean(agency.google_ads_refresh_token),
          }
        : null,
      summary: { total: 0, active: 0, canceled: 0, hidden: 0, managers: 0 },
      accounts: [],
      error: error instanceof Error ? error.message : String(error),
    }, { status: 200 });
  }
}
