import { NextRequest, NextResponse } from "next/server";

import { requireReportClient } from "@/lib/api-auth";
import {
  fetchAccountCurrency,
  fetchCallActions,
  fetchConversionRows,
  fetchReportRows,
  forgetGoogleAdsAccessToken,
} from "@/lib/google-ads/auth";
import { buildConversionReport } from "@/lib/google-ads/conversions";
import { resolveRange } from "@/lib/google-ads/date-range";
import { isSampleDataEnabled } from "@/lib/google-ads/sample-data";

/**
 * One client's conversions for a period, by conversion type and by campaign
 * type, compared with the period before it.
 *
 * Its own route, like Calls and Ads, so the conversion query is only spent
 * when someone opens the Conversions tab. Spend by campaign type comes from
 * the campaign rows the main report has already cached, and the currency
 * likewise, so those cost nothing more.
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
    const [[rows, previousRows], [campaignRows, previousCampaignRows], currency, callActionRows] = await Promise.all([
      fetchConversionRows(query),
      fetchReportRows(query),
      fetchAccountCurrency(query),
      // Only the call actions' rules hang on this: without them the tab still loads.
      fetchCallActions(query).catch((error: unknown) => {
        console.error("Google Ads call actions fetch failed:", error);
        return [];
      }),
    ]);

    return NextResponse.json(
      buildConversionReport({
        range,
        rows,
        previousRows,
        campaignRows,
        previousCampaignRows,
        isSample: isSampleDataEnabled(),
        currency,
        callActionRows,
      })
    );
  } catch (error: unknown) {
    console.error("Google Ads conversions fetch failed:", error);
    forgetGoogleAdsAccessToken(client.agencyId);

    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Google Ads account unavailable.",
    });
  }
}
