import { NextRequest, NextResponse } from "next/server";

import { requireReportClient } from "@/lib/api-auth";
import { fetchCallRows, forgetGoogleAdsAccessToken } from "@/lib/google-ads/auth";
import { buildCallReport } from "@/lib/google-ads/calls";
import { resolveRange } from "@/lib/google-ads/date-range";
import { isSampleDataEnabled } from "@/lib/google-ads/sample-data";

/**
 * One client's calls for a period, compared with the period before it.
 *
 * Its own route rather than part of the main report, so the Google queries it
 * costs are only spent when someone actually opens the Calls tab.
 */
export async function GET(request: NextRequest) {
  const { client, response } = await requireReportClient(request.nextUrl.searchParams.get("clientId"));
  if (response) return response;

  if (!client.customerId) {
    return NextResponse.json({
      status: "not_configured",
      message: "Google Ads Customer ID is missing for this client.",
    });
  }

  const range = resolveRange(request.nextUrl.searchParams.get("dateRange") ?? "last_7_days");

  try {
    const [rows, previousRows] = await fetchCallRows({
      agencyId: client.agencyId,
      customerId: client.customerId,
      managerCustomerId: client.managerCustomerId,
      range,
    });

    return NextResponse.json(
      buildCallReport({ range, rows, previousRows, isSample: isSampleDataEnabled() })
    );
  } catch (error: unknown) {
    console.error("Google Ads calls fetch failed:", error);
    forgetGoogleAdsAccessToken(client.agencyId);

    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Google Ads account unavailable.",
    });
  }
}
