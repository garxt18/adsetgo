import { NextRequest, NextResponse } from "next/server";

import { requireAgency } from "@/lib/api-auth";
import {
  fetchReportRows,
  forgetGoogleAdsAccessToken,
  getGoogleAdsAccessToken,
} from "@/lib/google-ads/auth";
import { normalizeGoogleAdsCustomerId } from "@/lib/google-ads/format";
import { percentChange, periodOf, resolveRange } from "@/lib/google-ads/date-range";
import { groupByDay, summarize } from "@/lib/google-ads/report";
import { isSampleDataEnabled } from "@/lib/google-ads/sample-data";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * One row per client for the agency's list, with the figures that decide where
 * attention goes: spend, clicks, conversions and the direction of travel.
 *
 * Google reports metrics per customer, so a list of N clients costs N queries
 * per window. Three things keep that affordable against an Explorer token's
 * 2,880 operations a day: results are cached per customer and window, the two
 * windows for one client are fetched together, and clients are processed in
 * small batches rather than all at once so a large agency cannot open a
 * hundred sockets at a time.
 */

const BATCH_SIZE = 5;

type ClientRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  google_ads_customer_id: string | null;
};

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/agencies/[slug]/overview">
) {
  const { agency, response } = await requireAgency((await ctx.params).slug, [
    "master_admin",
    "agency_admin",
  ]);
  if (response) return response;

  const agencyId = agency.id;

  const { data: clientRows } = await supabaseAdmin
    .from("clients")
    .select("id, name, email, status, google_ads_customer_id")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });

  const clients = (clientRows ?? []) as ClientRow[];
  const range = resolveRange(request.nextUrl.searchParams.get("dateRange") ?? "last_7_days");
  const useSample = isSampleDataEnabled();
  const managerCustomerId = normalizeGoogleAdsCustomerId(agency.google_ads_manager_customer_id);

  // Asked once up front, so a broken connection is reported as one banner
  // rather than as every client quietly showing no figures. The token is
  // cached, so the per-client loads below reuse it.
  let connectionError: string | null = null;

  if (!useSample && clients.length > 0) {
    try {
      await getGoogleAdsAccessToken(agencyId);
    } catch (error) {
      connectionError = error instanceof Error ? error.message : "Google Ads is unavailable.";
    }
  }

  async function loadClient(client: ClientRow) {
    const customerId = normalizeGoogleAdsCustomerId(client.google_ads_customer_id);
    const empty = { client, current: null, previous: null, spendSeries: [] };

    if (!customerId || connectionError) return empty;

    try {
      const [rows, previousRows] = await fetchReportRows({
        agencyId,
        customerId,
        managerCustomerId,
        range,
      });

      // Only what the client list shows; the full report is a click away.
      const { impressions, clicks, cost, conversions, costPerConversion } = summarize(rows);
      const previous = summarize(previousRows);

      return {
        client,
        current: { impressions, clicks, cost, conversions, costPerConversion },
        previous,
        spendSeries: groupByDay(rows).map((day) => ({ label: day.date, value: day.cost })),
      };
    } catch {
      // One client's account failing must not blank the whole agency's list.
      // The token is dropped in case Google refused it, so the next load
      // mints a new one and notices a revoked connection.
      forgetGoogleAdsAccessToken(agencyId);
      return empty;
    }
  }

  const results: Array<Awaited<ReturnType<typeof loadClient>>> = [];

  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE);
    results.push(...(await Promise.all(batch.map(loadClient))));
  }

  const rows = results.map(({ client, current, previous, spendSeries }) => ({
    id: client.id,
    name: client.name,
    email: client.email,
    status: client.status,
    googleAdsCustomerId: client.google_ads_customer_id,
    metrics: current,
    change: current && previous ? percentChange(current.cost, previous.cost) : null,
    conversionChange:
      current && previous ? percentChange(current.conversions, previous.conversions) : null,
    spendSeries,
  }));

  const totals = rows.reduce(
    (acc, row) => {
      if (!row.metrics) return acc;
      acc.cost += row.metrics.cost;
      acc.clicks += row.metrics.clicks;
      acc.conversions += row.metrics.conversions;
      acc.impressions += row.metrics.impressions;
      return acc;
    },
    { cost: 0, clicks: 0, conversions: 0, impressions: 0 }
  );

  return NextResponse.json({
    agency: {
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      connectionStatus: agency.google_ads_connection_status,
      managerCustomerId: agency.google_ads_manager_customer_id,
    },
    period: periodOf(range),
    clients: rows,
    totals: {
      ...totals,
      cost: Number(totals.cost.toFixed(2)),
      costPerConversion:
        totals.conversions > 0 ? Number((totals.cost / totals.conversions).toFixed(2)) : 0,
    },
    connectionError,
    isSample: useSample,
  });
}
