import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth, requireAgencyAccess } from "@/lib/api-auth";
import {
  fetchGoogleAdsMetrics,
  forgetGoogleAdsAccessToken,
  getGoogleAdsAccessToken,
  type GoogleAdsRow,
} from "@/lib/google-ads/auth";
import { normalizeGoogleAdsCustomerId } from "@/lib/google-ads/format";
import { percentChange, resolveRange } from "@/lib/google-ads/date-range";
import { reportCacheKey, withReportCache } from "@/lib/google-ads/report-cache";
import { buildSampleRows, isSampleDataEnabled } from "@/lib/google-ads/sample-data";
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

function summarise(rows: GoogleAdsRow[]) {
  let impressions = 0;
  let clicks = 0;
  let cost = 0;
  let conversions = 0;

  for (const row of rows) {
    impressions += Number(row.metrics?.impressions ?? 0);
    clicks += Number(row.metrics?.clicks ?? 0);
    cost += Number(row.metrics?.cost_micros ?? 0) / 1_000_000;
    conversions += Number(row.metrics?.conversions ?? 0);
  }

  return {
    impressions: Math.round(impressions),
    clicks: Math.round(clicks),
    cost: Number(cost.toFixed(2)),
    conversions: Math.round(conversions),
    costPerConversion: conversions > 0 ? Number((cost / conversions).toFixed(2)) : 0,
  };
}

function dailySpend(rows: GoogleAdsRow[]) {
  const byDate = new Map<string, number>();

  for (const row of rows) {
    const date = row.segments?.date ?? "";
    if (!date) continue;
    byDate.set(date, (byDate.get(date) ?? 0) + Number(row.metrics?.cost_micros ?? 0) / 1_000_000);
  }

  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ label: date, value: Number(value.toFixed(2)) }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { profile, response: authError } = await requireApiAuth([
    "master_admin",
    "agency_admin",
  ]);
  if (authError) return authError;

  const { slug } = await params;

  const { data: agency } = await supabaseAdmin
    .from("agencies")
    .select("id, name, slug, google_ads_manager_customer_id, google_ads_connection_status")
    .eq("slug", slug)
    .maybeSingle();

  if (!agency) {
    return NextResponse.json({ error: "Agency not found." }, { status: 404 });
  }

  const denied = requireAgencyAccess(profile, agency.id);
  if (denied) return denied;

  const agencyId = agency.id;

  const { data: clientRows } = await supabaseAdmin
    .from("clients")
    .select("id, name, email, status, google_ads_customer_id")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });

  const clients = (clientRows ?? []) as ClientRow[];
  const range = resolveRange(request.nextUrl.searchParams.get("dateRange") ?? "last_7_days");
  const useSample = isSampleDataEnabled();
  const managerCustomerId = normalizeGoogleAdsCustomerId(
    agency.google_ads_manager_customer_id ?? ""
  );

  // Without a connection there are no figures to report, but the list of
  // clients is still the agency's own and should render.
  let accessToken: string | null = null;
  let connectionError: string | null = null;

  if (!useSample && clients.length > 0) {
    try {
      accessToken = await getGoogleAdsAccessToken(agencyId);
    } catch (error) {
      connectionError = error instanceof Error ? error.message : "Google Ads is unavailable.";
    }
  }

  async function loadClient(client: ClientRow) {
    const customerId = normalizeGoogleAdsCustomerId(client.google_ads_customer_id ?? "");

    if (!customerId || (!useSample && !accessToken)) {
      return { client, current: null, previous: null, spendSeries: [] };
    }

    const fetchWindow = async (startDate: string, endDate: string) => {
      if (useSample) return buildSampleRows({ customerId, startDate, endDate });

      return withReportCache(
        reportCacheKey([customerId, managerCustomerId, startDate, endDate]),
        () =>
          fetchGoogleAdsMetrics({
            clientCustomerId: customerId,
            managerCustomerId,
            startDate,
            endDate,
            accessToken: accessToken as string,
          })
      );
    };

    try {
      const [rows, previousRows] = await Promise.all([
        fetchWindow(range.start, range.end),
        fetchWindow(range.previousStart, range.previousEnd),
      ]);

      return {
        client,
        current: summarise(rows as GoogleAdsRow[]),
        previous: summarise(previousRows as GoogleAdsRow[]),
        spendSeries: dailySpend(rows as GoogleAdsRow[]),
      };
    } catch {
      // One client's account failing must not blank the whole agency's list.
      // The token is dropped in case Google refused it, so the next load
      // mints a new one and notices a revoked connection.
      forgetGoogleAdsAccessToken(agencyId);
      return { client, current: null, previous: null, spendSeries: [] };
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
    period: {
      label: range.label,
      start: range.start,
      end: range.end,
      previousStart: range.previousStart,
      previousEnd: range.previousEnd,
    },
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
