/**
 * Turns Google Ads rows into the figures the dashboards show.
 *
 * Pure: no I/O, so live rows and generated sample rows go through exactly the
 * same arithmetic, and it can be tested directly. The client report and the
 * agency's client list each used to carry their own copy of these sums, and
 * the copies had already started to differ in which figures they kept.
 */

import type { GoogleAdsRow } from "./auth.ts";
import { percentChange, periodOf, type ResolvedRange } from "./date-range.ts";

const round2 = (value: number) => Number(value.toFixed(2));

/** Micros are millionths of the account currency. */
const money = (micros: number | string | undefined) => Number(micros ?? 0) / 1_000_000;

/** Rates from totals. Each is 0, never NaN or Infinity, when its base is 0. */
function rates(t: { impressions: number; clicks: number; cost: number; conversions: number }) {
  return {
    ctr: t.impressions > 0 ? round2((t.clicks / t.impressions) * 100) : 0,
    averageCpc: t.clicks > 0 ? round2(t.cost / t.clicks) : 0,
    costPerConversion: t.conversions > 0 ? round2(t.cost / t.conversions) : 0,
    conversionRate: t.clicks > 0 ? round2((t.conversions / t.clicks) * 100) : 0,
  };
}

function totals(rows: GoogleAdsRow[]) {
  let impressions = 0;
  let clicks = 0;
  let cost = 0;
  let conversions = 0;
  let conversionValue = 0;

  for (const row of rows) {
    impressions += Number(row.metrics?.impressions ?? 0);
    clicks += Number(row.metrics?.clicks ?? 0);
    cost += money(row.metrics?.costMicros);
    conversions += Number(row.metrics?.conversions ?? 0);
    conversionValue += Number(row.metrics?.conversionsValue ?? 0);
  }

  return { impressions, clicks, cost, conversions, conversionValue };
}

/** Headline figures for one window. */
export function summarize(rows: GoogleAdsRow[]) {
  const t = totals(rows);

  return {
    impressions: Math.round(t.impressions),
    clicks: Math.round(t.clicks),
    cost: round2(t.cost),
    conversions: Math.round(t.conversions),
    ...rates(t),
    conversionValue: round2(t.conversionValue),
    roas: t.cost > 0 ? round2(t.conversionValue / t.cost) : 0,
  };
}

export type Summary = ReturnType<typeof summarize>;

/** Rows gathered by a key, keeping the order keys were first seen. */
function groupRows(rows: GoogleAdsRow[], keyOf: (row: GoogleAdsRow) => string | undefined) {
  const groups = new Map<string, GoogleAdsRow[]>();

  for (const row of rows) {
    const key = keyOf(row);
    if (key === undefined) continue;

    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  return Array.from(groups.entries());
}

/**
 * Daily series for one window. Every figure on the dashboard has a tile and
 * every tile shows its own trend, so the rates are worked out per day too.
 */
export function groupByDay(rows: GoogleAdsRow[]) {
  return groupRows(rows, (row) => row.segments?.date)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => {
      const { impressions, clicks, cost, conversions, ctr, averageCpc, costPerConversion, conversionRate } =
        summarize(dayRows);
      return { date, impressions, clicks, conversions, cost, ctr, averageCpc, costPerConversion, conversionRate };
    });
}

/** Per-campaign totals for one window, for the campaign table and attribution. */
export function groupByCampaign(rows: GoogleAdsRow[]) {
  return groupRows(rows, (row) => String(row.campaign?.id ?? "unknown")).map(
    ([id, campaignRows]) => {
      const { impressions, clicks, cost, conversions, ctr, averageCpc } = summarize(campaignRows);
      const first = campaignRows[0].campaign;
      return {
        id,
        name: first?.name ?? "Campaign",
        status: first?.status ?? "ENABLED",
        impressions,
        clicks,
        cost,
        conversions,
        ctr,
        averageCpc,
      };
    }
  );
}

/** One client's report: both windows, their comparison, and the breakdowns. */
export function buildReport({
  range,
  rows,
  previousRows,
  isSample,
}: {
  range: ResolvedRange;
  rows: GoogleAdsRow[];
  previousRows: GoogleAdsRow[];
  isSample: boolean;
}) {
  const metrics = summarize(rows);
  const previousMetrics = summarize(previousRows);

  const compared = [
    "cost",
    "clicks",
    "impressions",
    "conversions",
    "ctr",
    "averageCpc",
    "costPerConversion",
    "conversionRate",
  ] as const;

  return {
    status: "connected" as const,
    period: periodOf(range),
    metrics,
    previousMetrics,
    changes: Object.fromEntries(
      compared.map((key) => [key, percentChange(metrics[key], previousMetrics[key])])
    ),
    trend: groupByDay(rows),
    previousTrend: groupByDay(previousRows),
    campaigns: groupByCampaign(rows),
    previousCampaigns: groupByCampaign(previousRows),
    isSample,
  };
}
