import { NextRequest, NextResponse } from "next/server";

import { requireReportClient } from "@/lib/api-auth";
import { buildAdsReport } from "@/lib/google-ads/ads";
import {
  fetchAccountCurrency,
  fetchAdRows,
  fetchCallRows,
  fetchKeywordRows,
  fetchReportRows,
  forgetGoogleAdsAccessToken,
} from "@/lib/google-ads/auth";
import { buildCallReport } from "@/lib/google-ads/calls";
import { resolveRange } from "@/lib/google-ads/date-range";
import { buildReport } from "@/lib/google-ads/report";
import { isSampleDataEnabled } from "@/lib/google-ads/sample-data";
import { ClientReportPdf } from "@/lib/pdf/client-report";
import { fileSlug } from "@/lib/export";
import { pdfResponse } from "@/lib/pdf/kit";

/**
 * One client's report for a period as a PDF download: everything on their
 * dashboard, calls, ads and keywords included. A client always gets their own, whatever id they
 * send; agency staff name one of their clients, as with /api/google-ads.
 */
export async function GET(request: NextRequest) {
  const { client, response } = await requireReportClient(request.nextUrl.searchParams.get("clientId"));
  if (response) return response;

  if (!client.customerId) {
    return NextResponse.json(
      { error: "This client has no Google Ads account linked yet, so there is nothing to report." },
      { status: 409 }
    );
  }

  const range = resolveRange(request.nextUrl.searchParams.get("dateRange") ?? "last_7_days");
  const query = {
    agencyId: client.agencyId,
    customerId: client.customerId,
    managerCustomerId: client.managerCustomerId,
    range,
  };

  // All through the same cache as the dashboard, so a report already on
  // screen costs no further Google quota. Calls and ads are optional: if only
  // they fail, the report still prints and says so.
  const [main, calls, ads] = await Promise.allSettled([
    Promise.all([fetchReportRows(query), fetchAccountCurrency(query)]),
    fetchCallRows(query),
    Promise.all([fetchAdRows(query), fetchKeywordRows(query)]),
  ]);

  if (main.status === "rejected") {
    console.error("PDF report fetch failed:", main.reason);
    forgetGoogleAdsAccessToken(client.agencyId);
    return NextResponse.json(
      { error: "Google Ads could not be reached, so the report could not be made. Try again in a moment." },
      { status: 502 }
    );
  }

  const isSample = isSampleDataEnabled();
  const [[rows, previousRows], currency] = main.value;

  return pdfResponse(
    <ClientReportPdf
      client={{ name: client.name, agencyName: client.agencyName, customerId: client.customerId }}
      report={buildReport({ range, rows, previousRows, isSample, currency })}
      calls={
        calls.status === "fulfilled"
          ? buildCallReport({ range, rows: calls.value[0], previousRows: calls.value[1], isSample })
          : null
      }
      ads={
        ads.status === "fulfilled"
          ? buildAdsReport({ range, adRows: ads.value[0], keywordRows: ads.value[1], isSample, currency })
          : null
      }
    />,
    `${fileSlug(client.name)}-google-ads-report-${range.start}-to-${range.end}.pdf`
  );
}
