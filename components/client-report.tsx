"use client";

import { useMemo, useState } from "react";

import { BarChart, DeltaChip, LineChart, Sparkline, type Point } from "@/components/charts";
import { MetricDetail, type MetricDetailData } from "@/components/metric-detail";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { HighlightGrid } from "@/components/ui/highlight-grid";
import { ScrollX } from "@/components/ui/scroll-x";
import { StatusPill } from "@/components/ui/status-pill";
import { buildAlerts } from "@/lib/insights";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  HIGHLIGHT_ORDER,
  MEASURES,
  TILE_METRICS,
  highlightTiles,
  summarise,
  type HighlightKey,
  type Changes,
  type MetricKey,
  type Metrics,
} from "@/lib/report-copy";
import { shortDay } from "@/lib/google-ads/date-range";
import { campaignHighlights, orderCampaigns } from "@/lib/google-ads/report";

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

export type { Changes, Metrics };

const ORDER_NOTE = {
  spend: "Everything that ran in this period, highest spend first.",
  best: "Best results first: most conversions, the cheaper first on a tie.",
  lowest: "Weakest first: fewest conversions, the dearer first on a tie.",
} as const;

/** The report's views. Calls and Ads have their own components and load separately. */
export type ReportTab = "overview" | "campaigns" | "calls" | "ads";

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
  currency,
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
  tab: ReportTab;
  /** The account's currency code; every money figure here is in it. */
  currency: string;
}) {
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);
  const [compare, setCompare] = useState(false);
  const [highlight, setHighlight] = useState<HighlightKey>("all");

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
        formatCurrency: (value) => formatCurrency(value, currency),
      }),
    [metrics, previousMetrics, campaigns, previousCampaigns, currency]
  );

  const tiles = TILE_METRICS;

  const detail: MetricDetailData | null = openMetric
    ? {
        label: MEASURES[openMetric].label,
        value: MEASURES[openMetric].format(metrics[openMetric], currency),
        previousValue: previousMetrics
          ? MEASURES[openMetric].format(previousMetrics[openMetric], currency)
          : "—",
        change: changes[openMetric] ?? null,
        invert: MEASURES[openMetric].invert,
        points: series((row) => row[openMetric]),
        comparisonPoints: priorSeries((row) => row[openMetric]),
        periodLabel,
        comparisonLabel,
        format: (value: number) => MEASURES[openMetric].format(value, currency),
        meaning: MEASURES[openMetric].meaning,
      }
    : null;

  // Worked out from the period's campaigns, so every range gets its own answers.
  const highlights = useMemo(() => highlightTiles(campaignHighlights(campaigns), currency), [campaigns, currency]);
  const ordered = useMemo(() => orderCampaigns(campaigns, HIGHLIGHT_ORDER[highlight]), [campaigns, highlight]);
  const picked = highlights.find((item) => item.key === highlight)?.campaign?.id;

  const topCampaigns: Point[] = [...campaigns]
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 5)
    .map((campaign) => ({ label: campaign.name, value: campaign.conversions }));

  return (
    <>
<div className={tab === "overview" ? "" : "hidden"}>
      <p className="animate-rise mt-5 text-base text-ink">{summarise(metrics, changes, currency)}</p>

      {alerts.length > 0 ? (
        <div className="animate-rise mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="animate-rise delay-1 p-5">
          <HeadlineChart
            title="Conversions"
            value={formatNumber(metrics.conversions, currency)}
            change={changes.conversions ?? null}
            points={series((row) => row.conversions)}
            comparison={compare ? priorSeries((row) => row.conversions) : undefined}
            seriesLabel={periodLabel}
            comparisonLabel={comparisonLabel}
            format={(v) => formatNumber(v, currency)}
            onOpen={() => setOpenMetric("conversions")}
          />
        </Card>

        <Card className="animate-rise delay-2 p-5">
          <HeadlineChart
            title="Clicks"
            value={formatNumber(metrics.clicks, currency)}
            change={changes.clicks ?? null}
            points={series((row) => row.clicks)}
            comparison={compare ? priorSeries((row) => row.clicks) : undefined}
            seriesLabel={periodLabel}
            comparisonLabel={comparisonLabel}
            format={(v) => formatNumber(v, currency)}
            onOpen={() => setOpenMetric("clicks")}
          />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              {MEASURES[key].format(metrics[key], currency)}
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

      <div className={tab === "campaigns" ? "" : "hidden"}>
      {/* Pressing an answer orders the table to match and marks its campaign. */}
      <HighlightGrid label="Campaign highlights" items={highlights} value={highlight} onChange={setHighlight} />

      <div className="mt-4 grid grid-cols-1 gap-4">
        <Card id="campaigns" className="animate-rise scroll-mt-20">
          <CardHeader title="Campaigns" description={ORDER_NOTE[HIGHLIGHT_ORDER[highlight]]} />
          {campaigns.length === 0 ? (
            <EmptyState
              title="No campaigns ran in this period"
              description="Choose a longer period, or ask your agency when the next campaign starts."
            />
          ) : (
            <ScrollX>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                    <th className="px-5 py-2.5">Campaign</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5 text-right">Spend</th>
                    <th className="px-5 py-2.5 text-right">Clicks</th>
                    <th className="px-5 py-2.5 text-right">Results</th>
                    <th className="px-5 py-2.5 text-right">Cost / result</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((campaign) => (
                    <tr
                      key={campaign.id}
                      aria-current={campaign.id === picked ? "true" : undefined}
                      className={`border-b border-line transition last:border-0 ${
                        campaign.id === picked ? "bg-brand-tint" : "hover:bg-surface-sunken"
                      }`}
                    >
                      <td className="max-w-[14rem] truncate px-5 py-2.5 font-medium text-ink" title={campaign.name}>
                        {campaign.name}
                      </td>
                      <td className="px-5 py-2.5">
                        <StatusPill status={campaign.status} />
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-ink">
                        {formatCurrency(campaign.cost, currency)}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-ink-soft">
                        {formatNumber(campaign.clicks, currency)}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-ink">
                        {formatNumber(campaign.conversions, currency)}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-ink-soft">
                        {campaign.conversions > 0 ? formatCurrency(campaign.cost / campaign.conversions, currency) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
          )}
        </Card>

        <Card className="animate-rise p-5">
          <h2 className="text-sm font-medium text-ink">Conversions by campaign</h2>
          <p className="mt-0.5 text-xs text-ink-soft">Top five in this period</p>
          <div className="mt-5">
            <BarChart points={topCampaigns} format={(v) => formatNumber(v, currency)} />
          </div>
        </Card>
      </div>
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
