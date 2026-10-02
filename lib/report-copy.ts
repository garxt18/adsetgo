/**
 * How a client's figures are named and read out, shared by the dashboard and
 * the downloadable PDF so the two can never describe the same number
 * differently.
 *
 * Pure: no React and no I/O, so server code (the PDF) and client components
 * (the dashboard) both import it.
 */

import { formatCurrency, formatNumber, formatPercent } from "./format.ts";

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
    format: (value: number) => string;
  }
> = {
  cost: {
    label: "Spend",
    invert: true,
    meaning: "What your ads cost over this period.",
    format: (v) => formatCurrency(v),
  },
  costPerConversion: {
    label: "Cost per conversion",
    invert: true,
    meaning: "What you paid, on average, for each enquiry or sale.",
    format: (v) => formatCurrency(v),
  },
  averageCpc: {
    label: "Cost per click",
    invert: true,
    meaning: "What you paid, on average, each time someone clicked an ad.",
    format: (v) => formatCurrency(v),
  },
  conversions: {
    label: "Conversions",
    meaning: "How many enquiries or sales your ads produced.",
    format: (v) => formatNumber(v),
  },
  clicks: {
    label: "Clicks",
    meaning: "How many times someone clicked through to you.",
    format: (v) => formatNumber(v),
  },
  impressions: {
    label: "Impressions",
    meaning: "How many times your ads were shown.",
    format: (v) => formatNumber(v),
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
export function summarise(metrics: Metrics, changes: Changes): string {
  if (metrics.clicks === 0 && metrics.impressions === 0) {
    return "Your ads did not run in this period.";
  }

  const spend = formatCurrency(metrics.cost);
  const conversions = formatNumber(metrics.conversions);

  if (metrics.conversions === 0) {
    return `You spent ${spend} and received ${formatNumber(metrics.clicks)} clicks, but no conversions were recorded in this period.`;
  }

  const each = formatCurrency(metrics.costPerConversion);
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
