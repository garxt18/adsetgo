import { NextRequest, NextResponse } from "next/server";

import { requireReportClient } from "@/lib/api-auth";
import { buildAdsReport } from "@/lib/google-ads/ads";
import {
  fetchAccountCurrency,
  fetchAdRows,
  fetchKeywordRows,
  forgetGoogleAdsAccessToken,
} from "@/lib/google-ads/auth";
import { resolveRange } from "@/lib/google-ads/date-range";
import { isSampleDataEnabled } from "@/lib/google-ads/sample-data";

/**
 * One client's ads and best keywords for a period.
 *
 * Its own route, like Calls, so its two Google queries are only spent when
 * someone opens the Ads tab. The currency is the one the report already
 * cached, so it costs nothing more.
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
  const query = {
    agencyId: client.agencyId,
    customerId: client.customerId,
    managerCustomerId: client.managerCustomerId,
    range,
  };

  try {
    const [adRows, keywordRows, currency] = await Promise.all([
      fetchAdRows(query),
      fetchKeywordRows(query),
      fetchAccountCurrency(query),
    ]);

    return NextResponse.json(
      buildAdsReport({ range, adRows, keywordRows, isSample: isSampleDataEnabled(), currency })
    );
  } catch (error: unknown) {
    console.error("Google Ads ads fetch failed:", error);
    forgetGoogleAdsAccessToken(client.agencyId);

    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Google Ads account unavailable.",
    });
  }
}
