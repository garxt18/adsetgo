import { NextRequest, NextResponse } from "next/server";

import { requireReportClient } from "@/lib/api-auth";
import {
  fetchCallActions,
  fetchCallRows,
  fetchConversionRows,
  forgetGoogleAdsAccessToken,
} from "@/lib/google-ads/auth";
import { buildCallReport } from "@/lib/google-ads/calls";
import { resolveRange } from "@/lib/google-ads/date-range";
import { isSampleDataEnabled } from "@/lib/google-ads/sample-data";

/**
 * One client's calls for a period, compared with the period before it.
 *
 * Its own route rather than part of the main report, so the Google queries it
 * costs are only spent when someone actually opens the Calls tab. The
 * conversion rows it reads are the Conversions tab's, cached, so opening both
 * tabs asks Google for them once.
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
    // How many calls counted as conversions, and by which rules, is extra:
    // if Google refuses it, the calls themselves still show.
    const [[rows, previousRows], conversions] = await Promise.all([
      fetchCallRows(query),
      Promise.all([fetchConversionRows(query), fetchCallActions(query)])
        .then(([[conversionRows], actions]) => ({ rows: conversionRows, actions }))
        .catch((error: unknown) => {
          console.error("Google Ads call conversions fetch failed:", error);
          return null;
        }),
    ]);

    return NextResponse.json(
      buildCallReport({ range, rows, previousRows, isSample: isSampleDataEnabled(), conversions })
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
