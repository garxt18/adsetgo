import { NextRequest, NextResponse } from "next/server";

import {
  fetchGoogleAdsMetrics,
  getGoogleAdsAccessToken,
  type GoogleAdsRow,
} from "@/lib/google-ads/auth";
import { normalizeGoogleAdsCustomerId } from "@/lib/google-ads/format";
import { percentChange, resolveRange } from "@/lib/google-ads/date-range";
import { reportCacheKey, withReportCache } from "@/lib/google-ads/report-cache";
import { buildSampleRows, isSampleDataEnabled } from "@/lib/google-ads/sample-data";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/server";

function summarizeGoogleAdsRows(rows: GoogleAdsRow[]) {
  const metrics = rows.reduce<{
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    conversionValue: number;
  }>(
    (acc, row) => {
      const payload = row?.metrics ?? {};
      const impressions = Number(payload.impressions ?? 0);
      const clicks = Number(payload.clicks ?? 0);
      const cost = Number(payload.cost_micros ?? 0) / 1_000_000;
      const conversions = Number(payload.conversions ?? 0);
      const conversionValue = Number(payload.conversions_value ?? 0);

      acc.impressions += impressions;
      acc.clicks += clicks;
      acc.cost += cost;
      acc.conversions += conversions;
      acc.conversionValue += conversionValue;
      return acc;
    },
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 }
  );

  const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
  const averageCpc = metrics.clicks > 0 ? metrics.cost / metrics.clicks : 0;
  const costPerConversion = metrics.conversions > 0 ? metrics.cost / metrics.conversions : 0;
  const conversionRate = metrics.clicks > 0 ? (metrics.conversions / metrics.clicks) * 100 : 0;
  const roas = metrics.cost > 0 ? metrics.conversionValue / metrics.cost : 0;

  return {
    impressions: Math.round(metrics.impressions),
    clicks: Math.round(metrics.clicks),
    cost: Number(metrics.cost.toFixed(2)),
    conversions: Math.round(metrics.conversions),
    ctr: Number(ctr.toFixed(2)),
    averageCpc: Number(averageCpc.toFixed(2)),
    costPerConversion: Number(costPerConversion.toFixed(2)),
    conversionRate: Number(conversionRate.toFixed(2)),
    conversionValue: Number(metrics.conversionValue.toFixed(2)),
    roas: Number(roas.toFixed(2)),
  };
}

/**
 * Daily series for one window.
 *
 * Every figure on the dashboard has a tile and every tile shows its own trend,
 * so this carries impressions as well and derives the rates per day rather
 * than leaving those tiles without a shape.
 */
function groupByDay(rows: GoogleAdsRow[]) {
  const byDate = new Map<
    string,
    { date: string; impressions: number; clicks: number; conversions: number; cost: number }
  >();

  for (const row of rows) {
    const date = row?.segments?.date ?? "N/A";
    const existing =
      byDate.get(date) ?? { date, impressions: 0, clicks: 0, conversions: 0, cost: 0 };

    existing.impressions += Number(row?.metrics?.impressions ?? 0);
    existing.clicks += Number(row?.metrics?.clicks ?? 0);
    existing.conversions += Number(row?.metrics?.conversions ?? 0);
    existing.cost += Number(row?.metrics?.cost_micros ?? 0) / 1_000_000;
    byDate.set(date, existing);
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => ({
      date: item.date,
      impressions: Math.round(item.impressions),
      clicks: Math.round(item.clicks),
      conversions: Math.round(item.conversions),
      cost: Number(item.cost.toFixed(2)),
      ctr:
        item.impressions > 0 ? Number(((item.clicks / item.impressions) * 100).toFixed(2)) : 0,
      averageCpc: item.clicks > 0 ? Number((item.cost / item.clicks).toFixed(2)) : 0,
      costPerConversion:
        item.conversions > 0 ? Number((item.cost / item.conversions).toFixed(2)) : 0,
      conversionRate:
        item.clicks > 0 ? Number(((item.conversions / item.clicks) * 100).toFixed(2)) : 0,
    }));
}

/** Per-campaign totals for one window, used for the table and for attribution. */
function groupByCampaign(rows: GoogleAdsRow[]) {
  const byCampaign = new Map<
    string,
    {
      id: string;
      name: string;
      status: string;
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
      ctr: number;
      averageCpc: number;
    }
  >();

  for (const row of rows) {
    const id = String(row.campaign?.id ?? "unknown");
    const existing = byCampaign.get(id) ?? {
      id,
      name: row.campaign?.name ?? "Campaign",
      status: row.campaign?.status ?? "ENABLED",
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      ctr: 0,
      averageCpc: 0,
    };

    existing.impressions += Number(row.metrics?.impressions ?? 0);
    existing.clicks += Number(row.metrics?.clicks ?? 0);
    existing.cost += Number(row.metrics?.cost_micros ?? 0) / 1_000_000;
    existing.conversions += Number(row.metrics?.conversions ?? 0);
    byCampaign.set(id, existing);
  }

  return Array.from(byCampaign.values()).map((c) => ({
    ...c,
    cost: Number(c.cost.toFixed(2)),
    conversions: Math.round(c.conversions),
    impressions: Math.round(c.impressions),
    clicks: Math.round(c.clicks),
    ctr: c.impressions > 0 ? Number(((c.clicks / c.impressions) * 100).toFixed(2)) : 0,
    averageCpc: c.clicks > 0 ? Number((c.cost / c.clicks).toFixed(2)) : 0,
  }));
}

type ReportClient = {
  id: string;
  name: string;
  google_ads_customer_id: string | null;
};

/**
 * Shapes one report from two windows of rows.
 *
 * Live and generated figures both come through here, so sample mode exercises
 * the same summarising, trend grouping and comparison the real data uses.
 */
function buildReport({
  client,
  range,
  rows,
  previousRows,
  isSample = false,
}: {
  client: ReportClient;
  range: ReturnType<typeof resolveRange>;
  rows: GoogleAdsRow[];
  previousRows: GoogleAdsRow[];
  isSample?: boolean;
}) {
  const summary = summarizeGoogleAdsRows(rows);
  const previousSummary = summarizeGoogleAdsRows(previousRows);

  const changes = {
    cost: percentChange(summary.cost, previousSummary.cost),
    clicks: percentChange(summary.clicks, previousSummary.clicks),
    impressions: percentChange(summary.impressions, previousSummary.impressions),
    conversions: percentChange(summary.conversions, previousSummary.conversions),
    ctr: percentChange(summary.ctr, previousSummary.ctr),
    averageCpc: percentChange(summary.averageCpc, previousSummary.averageCpc),
    costPerConversion: percentChange(
      summary.costPerConversion,
      previousSummary.costPerConversion
    ),
    conversionRate: percentChange(summary.conversionRate, previousSummary.conversionRate),
  };

  const trend = groupByDay(rows);
  const campaigns = groupByCampaign(rows);

  const previousTrend = groupByDay(previousRows);
  const previousCampaigns = groupByCampaign(previousRows);

  return {
    clientId: client.id,
    customerGoogleAdsId: client.google_ads_customer_id,
    clientName: client.name,
    dateRange: range.key,
    period: {
      label: range.label,
      start: range.start,
      end: range.end,
      previousStart: range.previousStart,
      previousEnd: range.previousEnd,
    },
    metrics: summary,
    previousMetrics: previousSummary,
    changes,
    trend,
    previousTrend,
    campaigns,
    previousCampaigns,
    status: "connected",
    isLive: !isSample,
    isSample,
  };
}

export async function GET(request: NextRequest) {
  // Authentication comes from the session cookie only. A `?userId=` fallback
  // previously accepted any profile id from the query string, which let a caller
  // impersonate any user by guessing a UUID.
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  // Determine target client ID with strict data isolation
  let clientId = request.nextUrl.searchParams.get("clientId");
  if (profile.role === "client") {
    // Clients can only access their own data
    clientId = profile.client_id;
  }

  const range = resolveRange(request.nextUrl.searchParams.get("dateRange") ?? "last_7_days");
  const debugMode = request.nextUrl.searchParams.get("debug") === "1";

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const { data: client, error: clientError } = await supabaseAdmin
    .from("clients")
    .select("*, agencies:agency_id(*)")
    .eq("id", clientId)
    .maybeSingle();

  if (clientError || !client) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  // Strict tenant checks
  if (profile.role === "client" && profile.client_id !== client.id) {
    return NextResponse.json({ error: "Forbidden. You can only view your own client data." }, { status: 403 });
  }

  if (profile.role === "agency_admin" && profile.agency_id !== client.agency_id) {
    return NextResponse.json({ error: "You do not have access to this client." }, { status: 403 });
  }

  const agency = client.agencies as { id: string; google_ads_manager_customer_id: string | null } | null;
  const customerId = normalizeGoogleAdsCustomerId(client.google_ads_customer_id);
  const managerCustomerId = normalizeGoogleAdsCustomerId(agency?.google_ads_manager_customer_id ?? "");

  if (debugMode) {
    console.log("[api/google-ads] request", { clientId, customerId, managerCustomerId });
  }

  if (!customerId) {
    return NextResponse.json({
      status: "not_configured",
      message: "Google Ads Customer ID is missing for this client.",
      metrics: { impressions: 0, clicks: 0, cost: 0, conversions: 0, ctr: 0, averageCpc: 0, costPerConversion: 0, conversionRate: 0, roas: 0 },
      trend: [],
      campaigns: [],
      isLive: false,
    }, { status: 200 });
  }

  try {
    // Get access token (uses per-agency token if stored, or global fallback)
    const useSample = isSampleDataEnabled();

    // Generated figures never touch Google, so no token is minted and no quota
    // is spent; the response says plainly that they are not real.
    if (useSample) {
      const sampleRows = buildSampleRows({ customerId, startDate: range.start, endDate: range.end });
      const samplePrevious = buildSampleRows({
        customerId,
        startDate: range.previousStart,
        endDate: range.previousEnd,
      });

      return NextResponse.json(
        buildReport({
          client,
          range,
          rows: sampleRows,
          previousRows: samplePrevious,
          isSample: true,
        })
      );
    }

    const accessToken = await getGoogleAdsAccessToken({ agencyId: agency?.id });

    const load = (startDate: string, endDate: string) =>
      withReportCache(reportCacheKey([customerId, managerCustomerId, startDate, endDate]), () =>
        fetchGoogleAdsMetrics({
          clientCustomerId: customerId,
          managerCustomerId,
          startDate,
          endDate,
          accessToken,
        })
      );

    // Both windows are requested together so the comparison always matches the
    // period on screen; the cache keeps a refresh from spending quota twice.
    const [rows, previousRows] = await Promise.all([
      load(range.start, range.end),
      load(range.previousStart, range.previousEnd),
    ]);

    return NextResponse.json(
      buildReport({
        client,
        range,
        rows: rows as GoogleAdsRow[],
        previousRows: previousRows as GoogleAdsRow[],
      })
    );
  } catch (error: unknown) {
    console.error("Google Ads metrics fetch failed:", error);
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Google Ads account unavailable.",
      metrics: { impressions: 0, clicks: 0, cost: 0, conversions: 0, ctr: 0, averageCpc: 0, costPerConversion: 0, conversionRate: 0, roas: 0 },
      trend: [],
      campaigns: [],
      isLive: false,
    }, { status: 200 });
  }
}
