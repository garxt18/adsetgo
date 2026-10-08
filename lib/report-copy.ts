/**
 * How a client's figures are named and read out, shared by the dashboard and
 * the downloadable PDF so the two can never describe the same number
 * differently.
 *
 * Pure: no React and no I/O, so server code (the PDF) and client components
 * (the dashboard) both import it.
 */

import { formatCurrency, formatNumber, formatPercent } from "./format.ts";
import type { AdLine, AdOrder, adHighlights } from "./google-ads/ads.ts";
import type { CampaignLine, CampaignOrder, campaignHighlights } from "./google-ads/report.ts";

export type Metrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  averageCpc: number;
  costPerConversion: number;
  conversionRate: number;
};

export type MetricKey = keyof Metrics;

export type Changes = Partial<Record<MetricKey, number | null>>;

export const MEASURES: Record<
  MetricKey,
  {
    label: string;
    /** For measures where a fall is good news, such as cost per result. */
    invert?: boolean;
    meaning: string;
    /** The figure as text, in the account's currency and number style. */
    format: (value: number, currency: string) => string;
  }
> = {
  cost: {
    label: "Spend",
    invert: true,
    meaning: "What your ads cost over this period.",
    format: (v, currency) => formatCurrency(v, currency),
  },
  costPerConversion: {
    label: "Cost per conversion",
    invert: true,
    meaning: "What you paid, on average, for each enquiry or sale.",
    format: (v, currency) => formatCurrency(v, currency),
  },
  averageCpc: {
    label: "Cost per click",
    invert: true,
    meaning: "What you paid, on average, each time someone clicked an ad.",
    format: (v, currency) => formatCurrency(v, currency),
  },
  conversions: {
    label: "Conversions",
    meaning: "How many enquiries or sales your ads produced.",
    format: (v, currency) => formatNumber(v, currency),
  },
  clicks: {
    label: "Clicks",
    meaning: "How many times someone clicked through to you.",
    format: (v, currency) => formatNumber(v, currency),
  },
  impressions: {
    label: "Impressions",
    meaning: "How many times your ads were shown.",
    format: (v, currency) => formatNumber(v, currency),
  },
  ctr: {
    label: "Click-through rate",
    meaning: "The share of people who clicked after seeing an ad.",
    format: (v) => formatPercent(v),
  },
  conversionRate: {
    label: "Conversion rate",
    meaning: "The share of clicks that turned into an enquiry or sale.",
    format: (v) => formatPercent(v),
  },
};

/** The figures shown as tiles beneath the two headline charts. */
export const TILE_METRICS: MetricKey[] = [
  "cost",
  "costPerConversion",
  "averageCpc",
  "impressions",
  "ctr",
  "conversionRate",
];

/**
 * Plain-language reading of the period, above the figures.
 *
 * Most people opening a report want a sentence, not a grid. The grid is there
 * for anyone who wants to check the sentence.
 */
export function summarise(metrics: Metrics, changes: Changes, currency: string): string {
  if (metrics.clicks === 0 && metrics.impressions === 0) {
    return "Your ads did not run in this period.";
  }

  const spend = formatCurrency(metrics.cost, currency);
  const conversions = formatNumber(metrics.conversions, currency);

  if (metrics.conversions === 0) {
    return `You spent ${spend} and received ${formatNumber(metrics.clicks, currency)} clicks, but no conversions were recorded in this period.`;
  }

  const each = formatCurrency(metrics.costPerConversion, currency);
  const move = changes.costPerConversion;

  const verdict =
    move === null || move === undefined
      ? "There is no earlier period to compare it against."
      : Math.abs(move) < 2
        ? "That is about the same as the period before."
        : move < 0
          ? `That is ${Math.abs(Math.round(move))}% cheaper than the period before.`
          : `That is ${Math.round(move)}% dearer than the period before.`;

  return `You spent ${spend} and got ${conversions} conversions, about ${each} each. ${verdict}`;
}

export type HighlightKey = "all" | "best" | "lowest" | "costly";

/** Each highlight orders the campaign table so its campaign is easy to compare. */
export const HIGHLIGHT_ORDER: Record<HighlightKey, CampaignOrder> = {
  all: "spend",
  best: "best",
  lowest: "lowest",
  costly: "spend",
};

/**
 * The campaign highlights as four labelled answers, worded once for the
 * dashboard's buttons and the PDF's tiles.
 */
export function highlightTiles(h: ReturnType<typeof campaignHighlights>, currency: string) {
  const money = (v: number) => formatCurrency(v, currency);
  const count = (v: number) => formatNumber(v, currency);
  const results = (c: CampaignLine) =>
    c.conversions > 0
      ? `${plural(count(c.conversions), c.conversions, "conversion")} · ${money(c.cost / c.conversions)} each`
      : `${money(c.cost)} spent, no conversions`;

  const tiles: Array<{
    key: HighlightKey;
    label: string;
    value: string;
    caption: string;
    campaign: CampaignLine | null;
  }> = [
    {
      key: "all",
      label: "Total campaigns",
      value: count(h.total),
      caption: h.active > 0 ? `${count(h.active)} active now` : h.total > 0 ? "None running now" : "None ran in this period",
      campaign: null,
    },
    {
      key: "best",
      label: "Best campaign",
      value: h.best?.name ?? "—",
      caption: h.best ? results(h.best) : "No conversions in this period",
      campaign: h.best,
    },
    {
      key: "lowest",
      label: "Lowest performing",
      value: h.lowest?.name ?? "—",
      caption: h.lowest ? results(h.lowest) : "Nothing to compare in this period",
      campaign: h.lowest,
    },
    {
      key: "costly",
      label: "Most costly",
      value: h.mostCostly?.name ?? "—",
      caption: h.mostCostly
        ? `${money(h.mostCostly.cost)} · ${Math.round(h.mostCostlyShare)}% of spend`
        : "Nothing spent in this period",
      campaign: h.mostCostly,
    },
  ];

  return tiles;
}

export type AdHighlightKey = "all" | "best" | "reach" | "clicks";

/** Each ad highlight orders the ad table by the figure it is about. */
export const AD_HIGHLIGHT_ORDER: Record<AdHighlightKey, AdOrder> = {
  all: "conversions",
  best: "conversions",
  reach: "impressions",
  clicks: "clicks",
};

/** "1 conversion", "2 conversions". */
export function plural(count: string, value: number, word: string): string {
  return `${count} ${value === 1 ? word : `${word}s`}`;
}

/**
 * The ad highlights as four labelled answers, worded once for the Ads tab
 * and the PDF. "Reach" is impressions: Google counts unique people only for
 * video and display campaigns, so times shown is the measure every ad has.
 */
export function adHighlightTiles(h: ReturnType<typeof adHighlights>, currency: string) {
  const count = (v: number) => formatNumber(v, currency);

  // Many accounts pin the same first headline (often the web address) to
  // every ad, so where an ad runs is what tells two of them apart.
  const where = (ad: AdLine | null) => (ad ? `${ad.campaign} › ${ad.adGroup}` : undefined);

  const tiles: Array<{
    key: AdHighlightKey;
    label: string;
    value: string;
    caption: string;
    detail?: string;
    ad: AdLine | null;
  }> = [
    {
      key: "all",
      label: "Ads shown",
      value: count(h.total),
      caption: h.total > 0 ? `In ${plural(count(h.campaigns), h.campaigns, "campaign")}` : "None in this period",
      ad: null,
    },
    {
      key: "best",
      label: "Best ad",
      value: h.best?.headline ?? "—",
      caption: h.best
        ? `${plural(count(h.best.conversions), h.best.conversions, "conversion")} · ${formatCurrency(h.best.costPerConversion, currency)} each`
        : "No conversions in this period",
      detail: where(h.best),
      ad: h.best,
    },
    {
      key: "reach",
      label: "Best reach",
      value: h.reach?.headline ?? "—",
      caption: h.reach ? `Shown ${count(h.reach.impressions)} times` : "Not shown in this period",
      detail: where(h.reach),
      ad: h.reach,
    },
    {
      key: "clicks",
      label: "Most clicks",
      value: h.clicks?.headline ?? "—",
      caption: h.clicks
        ? `${plural(count(h.clicks.clicks), h.clicks.clicks, "click")} · ${formatPercent(h.clicks.ctr)} click-through`
        : "No clicks in this period",
      detail: where(h.clicks),
      ad: h.clicks,
    },
  ];

  return tiles;
}
