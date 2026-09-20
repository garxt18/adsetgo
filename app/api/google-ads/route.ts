import { NextRequest, NextResponse } from "next/server";

import { getGoogleAdsAccessToken, normalizeGoogleAdsCustomerId } from "../../../lib/google-ads/auth";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { getCurrentProfile } from "../../../lib/supabase-server";

type GoogleAdsRow = {
  campaign?: {
    id?: string | number;
    name?: string;
    status?: string;
  };
  metrics?: {
    impressions?: number | string;
    clicks?: number | string;
    cost_micros?: number | string;
    conversions?: number | string;
    conversions_value?: number | string;
    ctr?: number | string;
    average_cpc?: number | string;
    average_cpm?: number | string;
  };
  segments?: {
    date?: string;
  };
};

type GoogleAdsPayload =
  | {
      results?: GoogleAdsRow[];
      error?: {
        message?: string;
      };
    }
  | Array<{
      results?: GoogleAdsRow[];
      error?: {
        message?: string;
      };
    }>;

function buildRangeFilter(dateRange: string): string {
  const normalized = dateRange.toLowerCase().replace(/\s+/g, "_");

  const map: Record<string, string> = {
    today: "TODAY",
    yesterday: "YESTERDAY",
    last_7_days: "LAST_7_DAYS",
    last_14_days: "LAST_14_DAYS",
    last_30_days: "LAST_30_DAYS",
    this_month: "THIS_MONTH",
    last_month: "LAST_MONTH",
  };

  return map[normalized] ?? "LAST_7_DAYS";
}

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

  const dateRange = request.nextUrl.searchParams.get("dateRange") ?? "Last 7 Days";
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
    const accessToken = await getGoogleAdsAccessToken({ agencyId: agency?.id });
    const googleAdsQueryRange = buildRangeFilter(dateRange);
    const apiVersion = process.env.GOOGLE_ADS_API_VERSION || "v18";

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      "Content-Type": "application/json",
    };

    // If manager ID is present, pass login-customer-id header
    if (managerCustomerId) {
      requestHeaders["login-customer-id"] = managerCustomerId;
    }

    const response = await fetch(
      `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({
          query: `
            SELECT
              segments.date,
              campaign.id,
              campaign.name,
              campaign.status,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr,
              metrics.average_cpc,
              metrics.average_cpm
            FROM campaign
            WHERE segments.date DURING ${googleAdsQueryRange}
            ORDER BY segments.date ASC
          `,
        }),
      }
    );

    const responseText = await response.text();
    let payload: GoogleAdsPayload | null = null;

    try {
      payload = responseText ? (JSON.parse(responseText) as GoogleAdsPayload) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      console.warn("[api/google-ads] Google API error status:", response.status, responseText.slice(0, 500));
      return NextResponse.json({
        status: "error",
        message: "Google Ads account unavailable or permission denied.",
        metrics: { impressions: 0, clicks: 0, cost: 0, conversions: 0, ctr: 0, averageCpc: 0, costPerConversion: 0, conversionRate: 0, roas: 0 },
        trend: [],
        campaigns: [],
        isLive: false,
        _debug: debugMode ? { googleStatus: response.status, errorSnippet: responseText.slice(0, 500) } : undefined,
      }, { status: 200 });
    }

    // Correctly extract rows whether Google returns stream batch array or single results object
    let rows: GoogleAdsRow[] = [];
    if (Array.isArray(payload)) {
      rows = payload.flatMap((chunk) => chunk.results ?? []);
    } else if (payload && Array.isArray(payload.results)) {
      rows = payload.results;
    }

    const summary = summarizeGoogleAdsRows(rows);

    // Group daily trend data
    const dateMap = new Map<string, { date: string; clicks: number; conversions: number; cost: number }>();
    for (const row of rows) {
      const date = row?.segments?.date ?? "N/A";
      const clicks = Number(row?.metrics?.clicks ?? 0);
      const conversions = Number(row?.metrics?.conversions ?? 0);
      const cost = Number(row?.metrics?.cost_micros ?? 0) / 1_000_000;

      const existing = dateMap.get(date) ?? { date, clicks: 0, conversions: 0, cost: 0 };
      existing.clicks += clicks;
      existing.conversions += conversions;
      existing.cost += cost;
      dateMap.set(date, existing);
    }

    const trend = Array.from(dateMap.values()).map((item) => ({
      ...item,
      cost: Number(item.cost.toFixed(2)),
    }));

    // Group campaign metrics
    const campaignMap = new Map<string, {
      id: string;
      name: string;
      status: string;
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
      ctr: number;
      averageCpc: number;
    }>();

    for (const row of rows) {
      const campId = String(row.campaign?.id ?? "unknown");
      const campName = row.campaign?.name ?? "Campaign";
      const campStatus = row.campaign?.status ?? "ENABLED";
      const impressions = Number(row.metrics?.impressions ?? 0);
      const clicks = Number(row.metrics?.clicks ?? 0);
      const cost = Number(row.metrics?.cost_micros ?? 0) / 1_000_000;
      const conversions = Number(row.metrics?.conversions ?? 0);

      const existing = campaignMap.get(campId) ?? {
        id: campId,
        name: campName,
        status: campStatus,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        ctr: 0,
        averageCpc: 0,
      };

      existing.impressions += impressions;
      existing.clicks += clicks;
      existing.cost += cost;
      existing.conversions += conversions;
      campaignMap.set(campId, existing);
    }

    const campaigns = Array.from(campaignMap.values()).map((c) => ({
      ...c,
      cost: Number(c.cost.toFixed(2)),
      ctr: c.impressions > 0 ? Number(((c.clicks / c.impressions) * 100).toFixed(2)) : 0,
      averageCpc: c.clicks > 0 ? Number((c.cost / c.clicks).toFixed(2)) : 0,
    }));

    return NextResponse.json({
      clientId,
      customerGoogleAdsId: client.google_ads_customer_id,
      clientName: client.name,
      dateRange,
      metrics: summary,
      trend,
      campaigns,
      status: "connected",
      isLive: true,
    });
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
