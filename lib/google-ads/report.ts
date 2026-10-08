/**
 * Turns Google Ads rows into the figures the dashboards show.
 *
 * Pure: no I/O, so live rows and generated sample rows go through exactly the
 * same arithmetic, and it can be tested directly. The client report and the
 * agency's client list each used to carry their own copy of these sums, and
 * the copies had already started to differ in which figures they kept.
 */

import type { GoogleAdsRow } from "./auth.ts";
import { eachDay, percentChange, periodOf, type ResolvedRange } from "./date-range.ts";

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
export function groupByDay(rows: GoogleAdsRow[], start?: string, end?: string) {
  const byDate = new Map(groupRows(rows, (row) => row.segments?.date));

  // Every day of the period, quiet days as zero. Google sends no row for a day
  // without activity, and leaving those days out stretched the rest across the
  // chart: ads that stopped on Wednesday looked as if they ran all week.
  const dates = start && end ? eachDay(start, end) : [...byDate.keys()].sort();

  return dates.map((date) => [date, byDate.get(date) ?? []] as const).map(([date, dayRows]) => {
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
  currency,
}: {
  range: ResolvedRange;
  rows: GoogleAdsRow[];
  previousRows: GoogleAdsRow[];
  isSample: boolean;
  /** The account's currency code; every money figure in the report is in it. */
  currency: string;
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
    trend: groupByDay(rows, range.start, range.end),
    previousTrend: groupByDay(previousRows, range.previousStart, range.previousEnd),
    campaigns: groupByCampaign(rows),
    previousCampaigns: groupByCampaign(previousRows),
    isSample,
    currency,
  };
}

/** One currency's share of an agency's spend. */
export type SpendTotal = {
  currency: string;
  cost: number;
  conversions: number;
  costPerConversion: number;
};

/**
 * Money totals across several accounts, kept apart by currency: £1,279 and
 * ₹3,543 cannot be added into one figure. Largest spend first. Counts such as
 * clicks are the same in any currency and are totalled elsewhere.
 */
export function totalsByCurrency(
  accounts: Array<{ currency: string; cost: number; conversions: number }>
): SpendTotal[] {
  const byCurrency = new Map<string, { cost: number; conversions: number }>();

  for (const { currency, cost, conversions } of accounts) {
    const total = byCurrency.get(currency) ?? { cost: 0, conversions: 0 };
    total.cost += cost;
    total.conversions += conversions;
    byCurrency.set(currency, total);
  }

  return Array.from(byCurrency, ([currency, { cost, conversions }]) => ({
    currency,
    cost: round2(cost),
    conversions,
    costPerConversion: conversions > 0 ? round2(cost / conversions) : 0,
  })).sort((a, b) => b.cost - a.cost);
}

export type CampaignLine = ReturnType<typeof groupByCampaign>[number];

/** How the campaign table is ordered: by spend, best results first, or weakest first. */
export type CampaignOrder = "spend" | "best" | "lowest";

/** Shown at least once or cost something in the period. */
const ran = (c: CampaignLine) => c.impressions > 0 || c.cost > 0;
/**
 * Campaigns in the requested order. "best" and "lowest" mirror each other:
 * most conversions first (the cheaper first on a tie), or fewest first (the
 * dearer first on a tie, so money spent for nothing leads). Campaigns that
 * did not run at all come last in every order.
 */
export function orderCampaigns(campaigns: CampaignLine[], order: CampaignOrder): CampaignLine[] {
  const compare: Record<CampaignOrder, (a: CampaignLine, b: CampaignLine) => number> = {
    spend: (a, b) => b.cost - a.cost,
    best: (a, b) => b.conversions - a.conversions || a.cost - b.cost,
    lowest: (a, b) => a.conversions - b.conversions || b.cost - a.cost,
  };

  return [...campaigns].sort((a, b) => Number(ran(b)) - Number(ran(a)) || compare[order](a, b));
}

/**
 * The campaign tab's headline answers: how many ran, which did best, which
 * did worst, and which cost the most. A title is only given when it means
 * something: no "best" without a conversion, no "lowest" with one campaign.
 */
export function campaignHighlights(campaigns: CampaignLine[]) {
  const running = campaigns.filter(ran);
  const spent = running.filter((c) => c.cost > 0);

  const best = orderCampaigns(running, "best")[0];
  const lowest = spent.length > 1 ? orderCampaigns(spent, "lowest")[0] : undefined;
  const mostCostly = orderCampaigns(spent, "spend")[0];
  const totalSpend = spent.reduce((sum, c) => sum + c.cost, 0);

  return {
    total: running.length,
    active: running.filter((c) => c.status === "ENABLED").length,
    best: best && best.conversions > 0 ? best : null,
    // Only possible when every campaign that spent has identical figures:
    // then none is weaker, so naming one would mislead.
    lowest: lowest && lowest.id !== best?.id ? lowest : null,
    mostCostly: mostCostly ?? null,
    /** The most costly campaign's share of all spend, as a percentage. */
    mostCostlyShare: mostCostly && totalSpend > 0 ? (mostCostly.cost / totalSpend) * 100 : 0,
  };
}
