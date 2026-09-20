import { NextRequest, NextResponse } from "next/server";

import {
  fetchAllGoogleAdsAccounts,
  fetchAccessibleGoogleAdsCustomers,
  getGoogleAdsAccessToken,
  type FullGoogleAdsAccount,
} from "@/lib/google-ads/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentProfile } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  const agencyId = request.nextUrl.searchParams.get("agencyId");
  const agencySlug = request.nextUrl.searchParams.get("agencySlug");

  // Lookup agency by ID or slug, or fallback to profile agency/first agency
  let agencyQuery = supabaseAdmin.from("agencies").select("*");

  if (agencyId) {
    agencyQuery = agencyQuery.eq("id", agencyId);
  } else if (agencySlug) {
    agencyQuery = agencyQuery.eq("slug", agencySlug);
  } else if (profile?.agency_id) {
    agencyQuery = agencyQuery.eq("id", profile.agency_id);
  } else {
    agencyQuery = agencyQuery.limit(1);
  }

  const { data: agency, error: agencyError } = await agencyQuery.maybeSingle();

  if (agencyError) {
    return NextResponse.json({ error: agencyError.message }, { status: 500 });
  }

  try {
    // 1. Get access token
    const accessToken = await getGoogleAdsAccessToken({
      agencyId: agency?.id,
    });

    // 2. Fetch accessible customer IDs
    let accessibleCustomerIds: string[] = [];
    try {
      accessibleCustomerIds = await fetchAccessibleGoogleAdsCustomers({
        accessToken,
      });
    } catch (err) {
      console.warn("fetchAccessibleGoogleAdsCustomers error:", err);
    }

    // 3. Fetch all accounts (active, canceled, hidden, managers, and all customer IDs)
    let accounts: FullGoogleAdsAccount[] = [];
    let accountsError: string | null = null;
    try {
      accounts = await fetchAllGoogleAdsAccounts({
        accessToken,
        managerCustomerId: agency?.google_ads_manager_customer_id,
      });
    } catch (err) {
      accountsError = err instanceof Error ? err.message : String(err);
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
      accessibleCustomerIds,
      accountsError,
    });
  } catch (error) {
    console.error("Google Ads account fetch failed:", error);

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
      accessibleCustomerIds: [],
      error: error instanceof Error ? error.message : String(error),
    }, { status: 200 });
  }
}
