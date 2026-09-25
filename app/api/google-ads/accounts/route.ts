import { NextRequest, NextResponse } from "next/server";

import { requireAgency } from "@/lib/api-auth";
import {
  fetchAllGoogleAdsAccounts,
  forgetGoogleAdsAccessToken,
  getGoogleAdsAccessToken,
} from "@/lib/google-ads/auth";
import { reportCacheKey, withReportCache } from "@/lib/google-ads/report-cache";

/**
 * Every Google Ads account under an agency's manager account, for its Google
 * Ads view. Agency staff only: it exposes the agency's whole account tree.
 *
 * The agency is named by its address, the same way every other agency route
 * names it. This route used to also accept an id, or fall back to the caller's
 * own agency, and before that to "the first agency in the table" -- which
 * handed an arbitrary tenant's accounts to anyone who left both out.
 */
export async function GET(request: NextRequest) {
  const { agency, response } = await requireAgency(
    request.nextUrl.searchParams.get("agencySlug") ?? "",
    ["master_admin", "agency_admin"]
  );
  if (response) return response;

  try {
    const accessToken = await getGoogleAdsAccessToken(agency.id);

    // The account tree changes rarely, and every look at the Google Ads view
    // would otherwise spend quota re-reading it.
    const accounts = await withReportCache(
      reportCacheKey(["account-tree", agency.id, agency.google_ads_manager_customer_id]),
      () =>
        fetchAllGoogleAdsAccounts({
          accessToken,
          managerCustomerId: agency.google_ads_manager_customer_id,
        })
    );

    return NextResponse.json({ connected: true, accounts });
  } catch (error) {
    console.error("Google Ads account fetch failed:", error);
    forgetGoogleAdsAccessToken(agency.id);

    return NextResponse.json({
      connected: false,
      message: error instanceof Error ? error.message : "Unable to fetch Google Ads accounts.",
    });
  }
}
