"use client";

import { useMemo, useState } from "react";

import { BarChart, DeltaChip, LineChart, Sparkline, type Point } from "@/components/charts";
import { MetricDetail, type MetricDetailData } from "@/components/metric-detail";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { buildAlerts } from "@/lib/insights";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { shortDay } from "@/lib/google-ads/date-range";

export type Campaign = {
  id: string;
  name: string;
  status: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  averageCpc: number;
};

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

export type TrendRow = {
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  ctr: number;
  averageCpc: number;
  costPerConversion: number;
  conversionRate: number;
};

export type Changes = Partial<Record<keyof Metrics, number | null>>;

type MetricKey = keyof Metrics;

const MEASURES: Record<
  MetricKey,
  { label: string; invert?: boolean; meaning: string; format: (v: number) => string }
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

/**
 * Plain-language reading of the period, above the figures.
 *
 * Most people opening a report want a sentence, not a grid. The grid is there
 * for anyone who wants to check the sentence.
 */
function summarise(metrics: Metrics, changes: Changes): string {
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

export function ClientReport({
  metrics,
  changes,
  previousMetrics,
  trend,
  previousTrend,
  campaigns,
  previousCampaigns,
  periodLabel,
  comparisonLabel,
  tab,
}: {
  metrics: Metrics;
  changes: Changes;
  previousMetrics: Metrics | null;
  trend: TrendRow[];
  previousTrend: TrendRow[];
  campaigns: Campaign[];
  previousCampaigns: Campaign[];
  /** Dates the two lines cover, so the dashed one is never a mystery. */
  periodLabel: string;
  comparisonLabel: string;
  tab: "overview" | "campaigns";
}) {
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);
  const [compare, setCompare] = useState(false);

  const series = useMemo(
    () => (pick: (row: TrendRow) => number): Point[] =>
      trend.map((row) => ({ label: shortDay(row.date), value: pick(row) })),
    [trend]
  );

  const priorSeries = useMemo(
    () => (pick: (row: TrendRow) => number): Point[] =>
      previousTrend.map((row) => ({ label: shortDay(row.date), value: pick(row) })),
    [previousTrend]
  );

  const alerts = useMemo(
    () =>
      buildAlerts({
        metrics,
        previousMetrics,
        campaigns,
        previousCampaigns,
        formatCurrency: (value) => formatCurrency(value),
      }),
    [metrics, previousMetrics, campaigns, previousCampaigns]
  );

  const tiles: MetricKey[] = [
    "cost",
    "costPerConversion",
    "averageCpc",
    "impressions",
    "ctr",
    "conversionRate",
  ];

  const detail: MetricDetailData | null = openMetric
    ? {
        label: MEASURES[openMetric].label,
        value: MEASURES[openMetric].format(metrics[openMetric]),
        previousValue: previousMetrics
          ? MEASURES[openMetric].format(previousMetrics[openMetric])
          : "—",
        change: changes[openMetric] ?? null,
        invert: MEASURES[openMetric].invert,
        points: series((row) => row[openMetric]),
        comparisonPoints: priorSeries((row) => row[openMetric]),
        periodLabel,
        comparisonLabel,
        format: MEASURES[openMetric].format,
        meaning: MEASURES[openMetric].meaning,
      }
    : null;

  const topCampaigns: Point[] = [...campaigns]
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 5)
    .map((campaign) => ({ label: campaign.name, value: campaign.conversions }));

  return (
    <>
<div className={tab === "overview" ? "" : "hidden"}>
      <p className="animate-rise mt-5 text-base text-ink">{summarise(metrics, changes)}</p>

      {alerts.length > 0 ? (
        <div className="animate-rise mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl px-4 py-3 ring-1 ${
                alert.tone === "positive"
                  ? "bg-positive-tint text-positive ring-positive/20"
                  : "bg-caution-tint text-caution ring-caution/20"
              }`}
            >
              <p className="text-sm font-medium">{alert.headline}</p>
              <p className="mt-0.5 text-xs opacity-90">{alert.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-end">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--brand)]"
          />
          Compare with {comparisonLabel}
        </label>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Card className="animate-rise delay-1 p-5">
          <HeadlineChart
            title="Conversions"
            value={formatNumber(metrics.conversions)}
            change={changes.conversions ?? null}
            points={series((row) => row.conversions)}
            comparison={compare ? priorSeries((row) => row.conversions) : undefined}
            seriesLabel={periodLabel}
            comparisonLabel={comparisonLabel}
            format={(v) => formatNumber(v)}
            onOpen={() => setOpenMetric("conversions")}
          />
        </Card>

        <Card className="animate-rise delay-2 p-5">
          <HeadlineChart
            title="Clicks"
            value={formatNumber(metrics.clicks)}
            change={changes.clicks ?? null}
            points={series((row) => row.clicks)}
            comparison={compare ? priorSeries((row) => row.clicks) : undefined}
            seriesLabel={periodLabel}
            comparisonLabel={comparisonLabel}
            format={(v) => formatNumber(v)}
            onOpen={() => setOpenMetric("clicks")}
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((key, index) => (
          <button
            key={key}
            type="button"
            onClick={() => setOpenMetric(key)}
            style={{ animationDelay: `${Math.min(index + 1, 6) * 40}ms` }}
            className={`animate-rise group rounded-2xl bg-surface px-5 py-4 text-left ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-faint">
                {MEASURES[key].label}
              </p>
              <DeltaChip change={changes[key] ?? null} invert={MEASURES[key].invert} />
            </div>
            <p className="tabular mt-2 text-2xl font-medium tracking-[-0.02em] text-ink">
              {MEASURES[key].format(metrics[key])}
            </p>
            <div className="mt-3">
              <Sparkline points={series((row) => row[key])} />
            </div>
            <p className="mt-2 text-[11px] text-ink-faint opacity-0 transition group-hover:opacity-100">
              Click for detail
            </p>
          </button>
        ))}
      </div>

      </div>

      <div className={`mt-4 grid gap-4 lg:grid-cols-2 ${tab === "campaigns" ? "" : "hidden"}`}>
        <Card className="animate-rise p-5">
          <h2 className="text-sm font-medium text-ink">Conversions by campaign</h2>
          <p className="mt-0.5 text-xs text-ink-soft">Top five in this period</p>
          <div className="mt-5">
            <BarChart points={topCampaigns} format={(v) => formatNumber(v)} />
          </div>
        </Card>

        <Card id="campaigns" className="animate-rise scroll-mt-20">
          <CardHeader title="Campaigns" description="Everything that ran in this period." />
          {campaigns.length === 0 ? (
            <EmptyState
              title="No campaigns ran in this period"
              description="Choose a longer period, or ask your agency when the next campaign starts."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                    <th className="px-5 py-2.5">Campaign</th>
                    <th className="px-5 py-2.5 text-right">Spend</th>
                    <th className="px-5 py-2.5 text-right">Clicks</th>
                    <th className="px-5 py-2.5 text-right">Results</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="border-b border-line transition last:border-0 hover:bg-surface-sunken"
                    >
                      <td className="max-w-[14rem] truncate px-5 py-2.5 font-medium text-ink">
                        {campaign.name}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-ink">
                        {formatCurrency(campaign.cost)}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-ink-soft">
                        {formatNumber(campaign.clicks)}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-ink">
                        {formatNumber(campaign.conversions)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={detail !== null}
        onClose={() => setOpenMetric(null)}
        title={detail?.label ?? ""}
        subtitle="This period, day by day"
      >
        {detail ? <MetricDetail detail={detail} /> : null}
      </Modal>
    </>
  );
}

function HeadlineChart({
  title,
  value,
  change,
  points,
  comparison,
  seriesLabel,
  comparisonLabel,
  format,
  onOpen,
}: {
  title: string;
  value: string;
  change: number | null;
  points: Point[];
  comparison?: Point[];
  seriesLabel?: string;
  comparisonLabel?: string;
  format: (value: number) => string;
  onOpen: () => void;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="text-sm font-medium text-ink transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {title}
        </button>
        <div className="flex items-center gap-2">
          <DeltaChip change={change} />
          <span className="tabular text-xl font-medium text-ink">{value}</span>
        </div>
      </div>
      <div className="mt-4">
        <LineChart
          points={points}
          comparison={comparison}
          seriesLabel={seriesLabel}
          comparisonLabel={comparisonLabel}
          format={format}
          area
        />
      </div>
    </>
  );
}
